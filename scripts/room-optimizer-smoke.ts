import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  evaluateRoomLifecycleDesign,
  optimizeRoomLifecycle,
  type RoomLifecycleOptimizationInput,
} from '../src/lib/room_lifecycle_optimizer';
import { V12HouseEngine } from '../src/simulations/v12_house';

const input: RoomLifecycleOptimizationInput = {
  roomName: 'Test living room',
  mode: 'cooling',
  targetTempC: 22,
  outdoorDesignTempC: 38,
  occupants: 3,
  minFloorAreaM2: 20,
  maxFloorAreaM2: 38,
  wallRValue: 2.8,
  ceilingRValue: 4.5,
  floorRValue: 2.2,
  windowAreaM2: 6,
  windowUValue: 1.6,
  internalGainsW: 400,
  solarGainsW: 300,
  lifecycleYears: 20,
  iterations: 1600,
  seed: 12013,
  baseline: {
    widthM: 6,
    lengthM: 5,
    ceilingHeightM: 2.7,
    strategy: 'cross',
    intake: { x: 0.05, y: 0.2, z: 0.25 },
    exhaust: { x: 0.95, y: 0.8, z: 0.3 },
    flowRateM3s: 0.05,
    ventDiameterM: 0.15,
  },
};

const first = optimizeRoomLifecycle(input);
const repeated = optimizeRoomLifecycle(input);

assert.ok(first.candidatesEvaluated > 2_000, 'optimizer should search and refine thousands of candidates');
assert.equal(first.best.feasible, true, 'chosen design must satisfy all constraints');
assert.equal(first.best.targetAchieved, true, 'chosen design must hold the requested temperature');
assert.ok(first.best.floorAreaM2 >= 20 && first.best.floorAreaM2 <= 38, 'chosen design must respect usable-area limits');
assert.ok(first.best.totalLifecycleEnergyKWh <= first.baseline.totalLifecycleEnergyKWh, 'optimizer must not return a higher-energy design');
assert.deepEqual(first.best, repeated.best, 'seeded search must be deterministic');
assert.equal(
  first.improvement.qualifiesAsImprovement,
  first.improvement.lifecycleEnergySavedKWh > first.baseline.totalLifecycleEnergyKWh * 0.001,
  'qualification must follow net lifecycle energy, not operational energy alone',
);

const evaluated = evaluateRoomLifecycleDesign(first.best.design, input);
assert.equal(
  evaluated.totalLifecycleEnergyKWh,
  Math.round((evaluated.operational.lifecycleOperationalKWh + evaluated.manufacturing.totalKWh) * 10) / 10,
  'lifecycle objective must include manufacturing energy',
);

const engine = new V12HouseEngine(new THREE.Scene());
const liveRoom = engine.getRooms()[0];
const liveResult = engine.optimizeRoomLifecycle(liveRoom.id, {
  minFloorAreaM2: 20,
  maxFloorAreaM2: 38,
  iterations: 500,
  seed: 91,
});
assert.equal(liveResult.roomName, liveRoom.name, 'V12 integration should optimize the selected live room');
assert.equal(liveResult.best.feasible, true, 'V12 integration should return a feasible live-room design');
if (liveResult.improvement.qualifiesAsImprovement) {
  engine.applyRoomLifecycleDesign(liveRoom.id, liveResult.best.design, 22);
  const applied = engine.getRooms().find(room => room.id === liveRoom.id);
  assert.equal(applied?.width, liveResult.best.design.widthM, 'accepted width should be applied to V12');
  assert.equal(applied?.height, liveResult.best.design.lengthM, 'accepted length should be applied to V12');
  assert.equal(applied?.vents.filter(vent => vent.type === 'intake').length, 1, 'applied design should have one optimized intake');
  assert.equal(applied?.vents.filter(vent => vent.type === 'exhaust').length, 1, 'applied design should have one optimized exhaust');
}

console.log(
  `Room optimizer OK: ${first.candidatesEvaluated.toLocaleString()} designs, `
  + `${first.improvement.lifecycleEnergySavedPercent.toFixed(1)}% net lifecycle saving, `
  + `${first.best.design.strategy} airflow.`,
);
