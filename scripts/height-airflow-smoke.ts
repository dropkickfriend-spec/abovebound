import assert from 'node:assert/strict';
import * as THREE from 'three';

import { calculateHeightAwareAirflow, optimizeHeightAwareAirflow } from '../src/lib/height_airflow';
import type { HeightAirflowSweepResult } from '../src/lib/height_airflow';
import { V12HouseEngine } from '../src/simulations/v12_house';

const base = {
  floorAreaM2: 20,
  roomTempC: 26,
  outsideTempC: 18,
  supplyTempC: 18,
  intakeHeightM: 0.15,
  exhaustHeightM: 2.55,
  designFlowM3s: 0.05,
  ventDiameterM: 0.15,
  powered: false,
  internalHeatW: 500,
};

const good = calculateHeightAwareAirflow({ ...base, roomId: 'good', ceilingHeightM: 2.7 });
assert.deepEqual(good, calculateHeightAwareAirflow({ ...base, roomId: 'good', ceilingHeightM: 2.7 }), 'height solver must be deterministic');
assert.ok(good.stackPressurePa > 0, 'warm room with a high exhaust should produce positive stack pressure');
assert.ok(good.stackFlowM3s > 0 && good.effectiveFlowM3s > 0, 'stack pressure should create upward natural flow');
assert.equal(good.shortCircuitRisk, false, 'well-separated vents should not short circuit');
assert.ok(good.layers.at(-1)!.temperatureC > good.layers[0].temperatureC, 'internal gains should produce a warmer upper layer');
assert.ok(good.layers.every(layer => Object.values(layer).every(Number.isFinite)), 'vertical layer outputs must stay finite');

const closeVents = calculateHeightAwareAirflow({
  ...base,
  ceilingHeightM: 2.7,
  intakeHeightM: 1.2,
  exhaustHeightM: 1.4,
});
assert.equal(closeVents.shortCircuitRisk, true, 'vents close in height should be flagged as a short circuit risk');
assert.ok(closeVents.stackPressurePa < good.stackPressurePa, 'smaller height separation should produce less stack pressure');

const tall = calculateHeightAwareAirflow({
  ...base,
  ceilingHeightM: 4.2,
  intakeHeightM: 0.15,
  exhaustHeightM: 4.05,
});
assert.ok(tall.stackPressurePa > good.stackPressurePa, 'a taller path should produce more stack pressure at the same temperature difference');
assert.ok(tall.stackFlowM3s > good.stackFlowM3s, 'a taller path should increase natural flow');

const reversed = calculateHeightAwareAirflow({
  ...base,
  ceilingHeightM: 2.7,
  intakeHeightM: 2.55,
  exhaustHeightM: 0.15,
});
assert.equal(reversed.reverseStackRisk, true, 'a high intake and low exhaust should flag reverse stack under warm-room conditions');
assert.ok(reversed.layers.every(layer => layer.verticalVelocityMs < 0), 'reverse stack should reverse vertical velocity');

const automaticSweepInput = {
  mode: 'cooling' as const,
  ceilingHeightM: 2.7,
  floorAreaM2: 20,
  roomTempC: 26,
  targetTempC: 22,
  outsideTempC: 18,
  hvacSupplyTempC: 14,
  internalHeatW: 500,
  envelopeLoadW: 1000,
};
const automaticSweep = optimizeHeightAwareAirflow(automaticSweepInput);
assert.deepEqual(automaticSweep, optimizeHeightAwareAirflow(automaticSweepInput), 'automatic airflow sweep must be deterministic');
assert.equal(automaticSweep.parameterSetsEvaluated, 512, 'automatic sweep must compare all vent height, flow, size, and power combinations');
assert.equal(automaticSweep.best.powered, true, 'a substantial cooling load should select powered displacement ventilation');
assert.equal(automaticSweep.rankedCandidates.length, 8, 'automatic sweep should retain a ranked shortlist');
assert.ok(
  new Set(automaticSweep.rankedCandidates.map(candidate => `${candidate.intakeHeightM}:${candidate.exhaustHeightM}:${candidate.designFlowM3s}:${candidate.ventDiameterM}`)).size >= 4,
  'ranked airflow results must contain materially different parameter sets',
);

const scene = new THREE.Scene();
const engine = new V12HouseEngine(scene);
try {
  for (let index = 0; index < 4; index += 1) engine.update('thermal', {}, 'cooling');
  const rooms = engine.getRooms();
  const grid = engine.getThermalGrid();
  assert.equal(grid.heightProfiles.length, rooms.length, 'V12 must expose one height profile per room');
  assert.equal(grid.heightSweeps.length, rooms.length, 'V12 must automatically sweep every room');
  assert.ok(grid.heightSweeps.every(sweep => sweep.parameterSetsEvaluated === 512), 'every room must compare the full deterministic sweep');
  assert.equal(grid.heightSweepRuns, 1, 'unchanged frames must reuse the deterministic sweep');
  assert.ok(grid.airflowX.every(Number.isFinite) && grid.airflowY.every(Number.isFinite), 'plan airflow must remain finite');

  const room = rooms.find(candidate => candidate.id === 'living')!;
  const intake = room.vents.find(vent => vent.type === 'intake')!;
  const exhaust = room.vents.find(vent => vent.type === 'exhaust')!;
  assert.ok(intake.position.z < room.ceilingHeight * 0.25, 'default intake should be low in the room');
  assert.ok(exhaust.position.z > room.ceilingHeight * 0.75, 'default exhaust should be high in the room');

  const appliedWinner = grid.heightSweeps.find(sweep => sweep.roomId === room.id)!.best;
  assert.equal(intake.position.z, appliedWinner.intakeHeightM, 'V12 must apply the winning intake height');
  assert.equal(exhaust.position.z, appliedWinner.exhaustHeightM, 'V12 must apply the winning exhaust height');

  const rerunValue = engine.runHeightAirflowSweep(room.id);
  assert.ok(rerunValue && !Array.isArray(rerunValue), 'room-specific sweep must return one result');
  const rerun = rerunValue as HeightAirflowSweepResult;
  const rerunGrid = engine.getThermalGrid();
  assert.equal(rerunGrid.heightSweepRuns, 2, 'explicit re-sweep must increment the run counter');
  assert.deepEqual(
    [rerun.best.intakeHeightM, rerun.best.exhaustHeightM, rerun.best.designFlowM3s, rerun.best.ventDiameterM, rerun.best.powered],
    [appliedWinner.intakeHeightM, appliedWinner.exhaustHeightM, appliedWinner.designFlowM3s, appliedWinner.ventDiameterM, appliedWinner.powered],
    'an unchanged explicit re-sweep must return the same physical design while its load metrics track the evolving simulation',
  );

  const before = grid.heightProfiles.find(profile => profile.roomId === room.id)!;
  const changed = engine.setVentHeight(room.id, 'exhaust', 0.45)!;
  assert.ok(changed.heightSeparationM < before.heightSeparationM, 'moving the exhaust down must alter the vertical solution');
  assert.equal(changed.shortCircuitRisk, true, 'moving the exhaust near the intake should expose the short-circuit risk');
} finally {
  engine.dispose();
  scene.clear();
}

console.log('Height-aware airflow smoke passed: 512 automatic candidates per room, deterministic ranking, stack pressure, stratification and V12 coupling.');
