import assert from 'node:assert/strict';
import {
  coupleHvacCycleInputs,
  coupleAdaptiveWallInputs,
  coupleRoomOptimizerInputs,
  deriveEnvelopeConductanceWPerK,
  representativeRoom,
  applyCoupledFields,
  type UpstreamSiteDesign,
  type UpstreamWholeHouse,
} from '../src/lib/panel_coupling';

const design: UpstreamSiteDesign = {
  floorAreaM2: 130,
  ceilingHeightM: 2.7,
  externalWallAreaM2: 168,
  envelopeThermalKWh: 9000,
  rooms: [
    { name: 'Living', floorAreaM2: 32, internalLoadW: 700 },
    { name: 'Bedroom', floorAreaM2: 16, internalLoadW: 260 },
    { name: 'Bathroom', floorAreaM2: 8, internalLoadW: 420 },
  ],
};
const wholeHouse: UpstreamWholeHouse = { designAirChangesPerHour: 0.58, heatRecoveryEfficiency: 0.84 };
const degreeDays = 2815; // setpoint-corrected Bendigo total at 22 degC

// 1. UA back-calculation is the exact inverse of the degree-day load.
//    UA [W/K] = kWh x 1000 / (K.day x 24 h/day)
const ua = deriveEnvelopeConductanceWPerK(design.envelopeThermalKWh, degreeDays);
const reconstructedKWh = ua * degreeDays * 24 / 1000;
assert.ok(Math.abs(reconstructedKWh - design.envelopeThermalKWh) < 1e-6,
  'UA derivation must invert the degree-day load exactly');
assert.ok(ua > 0 && Number.isFinite(ua), 'UA must be positive and finite');

// 2. Degenerate upstream state must not produce NaN/Infinity downstream.
assert.equal(deriveEnvelopeConductanceWPerK(9000, 0), 0, 'zero degree days must not divide by zero');
assert.equal(deriveEnvelopeConductanceWPerK(0, 2815), 0, 'zero load must give zero conductance');

// 3. The representative room is the largest one.
assert.equal(representativeRoom(design)?.name, 'Living', 'largest room must represent the dwelling');
assert.equal(representativeRoom({ ...design, rooms: [] }), null, 'no rooms must be handled');

// 4. HVAC cycling geometry follows the chosen design, not a hardcoded room.
const hvac = coupleHvacCycleInputs(design, wholeHouse, degreeDays);
const byField = Object.fromEntries(hvac.map(entry => [entry.field, entry.value]));
assert.equal(byField.floorAreaM2, 32, 'HVAC panel must screen the chosen room area');
assert.ok(Math.abs(byField.roomVolumeM3 - 32 * 2.7) < 0.01, 'room volume must follow area x ceiling height');
assert.equal(byField.internalGainsW, 700, 'internal gains must come from the chosen room');
assert.equal(byField.airLeakageAch, 0.58, 'air change rate must come from the whole-system winner');
// Room conductance is the dwelling UA scaled by the room's floor-area share.
assert.ok(Math.abs(byField.envelopeConductanceWPerK - ua * (32 / 130)) < 0.01,
  'room conductance must be the dwelling UA scaled by floor-area share');
// Outside air flow must equal room volume x ACH.
assert.ok(Math.abs(byField.outsideAirFlowM3s - (32 * 2.7 * 0.58 / 3600)) < 1e-5,
  'outside air flow must follow the coupled volume and air change rate');

// 5. Upstream changes must MOVE downstream results - the whole point.
const quieter = coupleHvacCycleInputs(design, { ...wholeHouse, designAirChangesPerHour: 0.3 }, degreeDays);
const quieterAch = quieter.find(entry => entry.field === 'airLeakageAch')?.value;
assert.equal(quieterAch, 0.3, 'changing the whole-system airflow must reach the cycling panel');
const bigger = coupleHvacCycleInputs(
  { ...design, rooms: [{ name: 'Living', floorAreaM2: 48, internalLoadW: 900 }] }, wholeHouse, degreeDays);
assert.equal(bigger.find(entry => entry.field === 'floorAreaM2')?.value, 48,
  'changing the site design must reach the cycling panel');

// 6. Adaptive wall screens the chosen envelope.
const wall = coupleAdaptiveWallInputs(design);
assert.equal(wall.find(entry => entry.field === 'wallAreaM2')?.value, 168,
  'adaptive wall must screen the chosen external wall area');
assert.equal(coupleAdaptiveWallInputs(null).length, 0, 'no design must couple nothing');

// 7. Room optimizer follows the chosen room.
assert.equal(coupleRoomOptimizerInputs(design)[0].value, 32, 'room optimizer must follow the chosen room');

// 8. Applying coupled fields preserves locals, reports movement, and is idempotent.
const local = { floorAreaM2: 18, roomVolumeM3: 48.6, expanderEfficiency: 0.55 };
const first = applyCoupledFields(local, hvac);
assert.equal(first.inputs.expanderEfficiency, 0.55, 'panel-local fields must survive coupling');
assert.equal(first.inputs.floorAreaM2, 32, 'coupled field must be applied');
assert.ok(first.applied.length > 0, 'movement must be reported');
assert.ok(first.applied.every(entry => entry.derivedFrom.length > 0), 'every coupled field must carry provenance');
const second = applyCoupledFields(first.inputs, hvac);
assert.equal(second.applied.length, 0, 're-applying identical coupling must report no movement');

// 9. Nothing upstream yet: panels must be left alone rather than zeroed.
assert.equal(coupleHvacCycleInputs(null, null, degreeDays).length, 0, 'no upstream must couple nothing');

console.log(JSON.stringify({
  dwellingUaWPerK: Math.round(ua * 100) / 100,
  representativeRoom: representativeRoom(design)?.name,
  hvacFieldsCoupled: hvac.length,
  adaptiveWallFieldsCoupled: wall.length,
  provenanceOnEveryField: true,
}, null, 2));
