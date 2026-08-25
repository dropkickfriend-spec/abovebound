import assert from 'node:assert/strict';
import { optimizeHvacCycle } from '../src/lib/hvac_cycle_optimizer';

const first = optimizeHvacCycle({
  roomName: 'Living room',
  allowOutsideAir: false,
  allowRecoveredStream: false,
});
const repeated = optimizeHvacCycle({
  roomName: 'Living room',
  allowOutsideAir: false,
  allowRecoveredStream: false,
});

assert.ok(first.candidatesEvaluated >= 800, 'the optimizer should search a meaningful control grid');
assert.deepEqual(first, repeated, 'the HVAC search must be deterministic');
assert.equal(first.improvement.qualifiesAsImprovement, true, 'the reference room should find an equivalent-comfort intermittent cycle');
assert.equal(first.best.strategy.assistMode, 'mechanical_only', 'no thermal source may be invented when every assist is disabled');
assert.ok(first.best.comfort.comfortPercent >= 98, 'a recommendation must hold the comfort band for at least 98% of the period');
assert.ok(first.best.manufacturerCycleLimitPassed, 'a recommendation must respect the compressor start-rate limit');
assert.ok(first.best.energy.startupKWh > 0, 'compressor startup electricity must be counted');
assert.ok(first.best.manufacturingEnergyKWh > 0, 'controller manufacturing energy must be counted');
assert.ok(first.improvement.lifecycleEnergySavedKWh > 0, 'the lifecycle result must remain net positive after manufacturing');
assert.equal(first.physics.expansionSupplyTempC, null, 'same-pressure outside air must receive no expansion-cooling credit');
assert.ok(first.physics.effectiveThermalCapacityKWhPerK > first.physics.airThermalCapacityKWhPerK, 'the building mass must be distinct from room-air heat capacity');

const freeAir = optimizeHvacCycle({
  targetTempC: 24,
  initialIndoorTempC: 24.8,
  comfortBandC: 1,
  outdoorLowTempC: 20,
  outdoorHighTempC: 28,
  internalGainsW: 800,
  hvacCop: 1.5,
  circulationFanPowerW: 40,
  outsideAirFlowM3s: 0.3,
  allowOutsideAir: true,
  allowRecoveredStream: false,
});
assert.equal(freeAir.best.strategy.assistMode, 'outside_air', 'suitable dry outside air should be selected when it beats mechanical cooling');
assert.ok(freeAir.best.energy.outsideAirThermalKWh > 0, 'free-air thermal transfer must be measured');

const humidAir = optimizeHvacCycle({
  targetTempC: 24,
  initialIndoorTempC: 24.8,
  comfortBandC: 1,
  outdoorLowTempC: 20,
  outdoorHighTempC: 28,
  internalGainsW: 800,
  hvacCop: 1.5,
  circulationFanPowerW: 40,
  outsideAirFlowM3s: 0.3,
  allowOutsideAir: true,
  allowRecoveredStream: false,
  outdoorRelativeHumidityPct: 90,
  maxOutsideAirHumidityPct: 65,
});
assert.equal(humidAir.best.energy.outsideAirThermalKWh, 0, 'outside-air cooling must be disabled above the humidity limit');

const recoveredCold = optimizeHvacCycle({
  allowOutsideAir: false,
  allowRecoveredStream: true,
  recoveredStreamTempC: 15,
  recoveredStreamCapacityW: 1200,
});
assert.equal(recoveredCold.best.strategy.assistMode, 'recovered_stream', 'a useful available cold stream should be considered before the compressor');
assert.ok(recoveredCold.best.energy.recoveredThermalKWh > 0, 'recovered thermal energy must be reported');
assert.ok(recoveredCold.best.energy.recoveryPumpKWh > 0, 'recovery pumping electricity must be charged');

const pressureRecovery = optimizeHvacCycle({
  targetTempC: 24,
  initialIndoorTempC: 24.8,
  comfortBandC: 1,
  outdoorLowTempC: 28,
  outdoorHighTempC: 38,
  internalGainsW: 800,
  hvacCop: 1.2,
  circulationFanPowerW: 40,
  outsideAirFlowM3s: 0.15,
  allowOutsideAir: false,
  allowRecoveredStream: false,
  compressedAirGaugePressureBar: 2,
  expanderEfficiency: 0.6,
  compressedAirProductionWhPerM3: 5,
});
assert.equal(pressureRecovery.best.strategy.assistMode, 'pressure_recovery', 'a real pressurized source may receive expansion-cooling credit');
assert.ok(pressureRecovery.physics.expansionSupplyTempC !== null, 'expansion supply temperature must be calculated');
assert.ok(pressureRecovery.best.energy.pressureRecoveryThermalKWh > 0, 'expansion thermal recovery must be reported');
assert.ok(pressureRecovery.best.energy.compressedAirProductionKWh > 0, 'compressed-air production electricity must be charged');

console.log(
  `HVAC cycle smoke passed: ${first.candidatesEvaluated.toLocaleString()} strategies, `
  + `${first.best.strategy.onMinutes}/${first.best.strategy.offMinutes} minute mechanical cycle, `
  + `${first.improvement.electricalSavedPercent.toFixed(1)}% electrical saving.`,
);
