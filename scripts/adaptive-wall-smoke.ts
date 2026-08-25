import assert from 'node:assert/strict';
import {
  discoverAdaptiveWall,
  evaluateAdaptiveWallStrategy,
  optimizeAdaptiveWall,
} from '../src/lib/adaptive_wall_optimizer';

const defaults = optimizeAdaptiveWall();
const repeated = optimizeAdaptiveWall();

assert.equal(defaults.candidatesEvaluated, 16, 'the optimizer should compare all lattice and bladder variants');
assert.deepEqual(defaults, repeated, 'the adaptive-wall search must be deterministic');
assert.ok(defaults.improvement.dailyConditioningHeatReducedKWh > 0, 'the default bladder should reduce operating heat');
assert.equal(defaults.improvement.qualifiesAsImprovement, false, 'operating savings alone must not hide manufacturing energy');
assert.equal(defaults.verdict, 'energy_shift_only', 'a concept that misses lifecycle payback must not be called an improvement');
assert.ok(
  (defaults.improvement.manufacturingEnergyPaybackYears ?? 0) > defaults.constraints.lifecycleYears,
  'the default manufacturing-energy payback should exceed its selected design life',
);

const discovery = discoverAdaptiveWall();
const repeatedDiscovery = discoverAdaptiveWall();
assert.deepEqual(discovery, repeatedDiscovery, 'automatic parameter discovery must be deterministic');
assert.equal(discovery.sweep?.parameterSetsEvaluated, 72, 'automatic discovery must search 72 different wall parameter sets');
assert.equal(discovery.sweep?.strategyEvaluations, 1152, 'automatic discovery must compare 16 strategies for every parameter set');
assert.equal(discovery.candidatesEvaluated, 1152, 'the top-level result must report every simulated design');
assert.ok((discovery.sweep?.rankedCandidates.length || 0) >= 4, 'automatic discovery should retain a diverse shortlist');
assert.ok(
  new Set(discovery.sweep?.rankedCandidates.map(candidate => `${candidate.strategy.kind}:${candidate.parameters.latticeAreaM2}:${candidate.parameters.inflatedRValue}`)).size >= 4,
  'ranked wall results must contain meaningfully different design parameters',
);
assert.ok(
  (discovery.sweep?.resultRanges.dailyElectricalSavedKWh.maximum || 0) > (discovery.sweep?.resultRanges.dailyElectricalSavedKWh.minimum || 0),
  'automatic discovery must expose varying energy results instead of repeating one answer',
);

const bridgeInput = {
  computeOrCompressorWasteHeatW: 0,
  outdoorLowTempC: 30,
  outdoorHighTempC: 40,
  latticeMaterialConductivityWmK: 160,
  latticeFillFraction: 0.05,
};
const bridgeBaseline = optimizeAdaptiveWall(bridgeInput).baseline;
const passiveBridge = evaluateAdaptiveWallStrategy({
  id: 'passive-metal-bridge',
  label: 'Passive metal thermal bridge',
  kind: 'passive_lattice',
  wasteCaptureFraction: 0,
}, bridgeInput);
assert.ok(
  passiveBridge.energy.conditioningThermalKWh > bridgeBaseline.energy.conditioningThermalKWh * 10,
  'a passive conductive lattice must be charged for short-circuiting the insulation',
);

const sinkBacked = optimizeAdaptiveWall({
  latticeMaterialConductivityWmK: 3,
  latticeFillFraction: 0.1,
  useFixedSink: true,
  fixedSinkTempC: 16,
  computeOrCompressorWasteHeatW: 1200,
  latticeEmbodiedEnergyKWhPerM2: 10,
  controllerAndActuatorEmbodiedKWh: 60,
  lifecycleYears: 30,
});
assert.equal(sinkBacked.improvement.qualifiesAsImprovement, true, 'a strong real sink may produce a lifecycle-positive design');
assert.equal(sinkBacked.verdict, 'reduces_heat_and_energy');
assert.ok(sinkBacked.best.energy.wasteHeatExportedKWh > 0, 'sink-backed waste heat must cross the envelope');
assert.ok(sinkBacked.improvement.lifecycleEnergySavedKWh > 0, 'manufacturing energy must remain repaid over the design life');

const heatingWithoutWaste = optimizeAdaptiveWall({
  mode: 'heating',
  outdoorLowTempC: 0,
  outdoorHighTempC: 12,
  computeOrCompressorWasteHeatW: 0,
  indoorRelativeHumidityPct: 35,
});
const heatingWithWaste = optimizeAdaptiveWall({
  mode: 'heating',
  outdoorLowTempC: 0,
  outdoorHighTempC: 12,
  computeOrCompressorWasteHeatW: 600,
  wasteHeatDutyFraction: 0.5,
  indoorRelativeHumidityPct: 35,
});
assert.ok(
  heatingWithWaste.baseline.energy.conditioningThermalKWh < heatingWithoutWaste.baseline.energy.conditioningThermalKWh,
  'indoor waste heat should offset heating demand instead of being treated as automatically harmful',
);
assert.equal(heatingWithWaste.best.energy.wasteHeatExportedKWh, 0, 'the heating recommendation should retain useful indoor waste heat');

const moistureRisk = optimizeAdaptiveWall({
  mode: 'heating',
  indoorTempC: 24,
  indoorRelativeHumidityPct: 95,
  outdoorLowTempC: 0,
  outdoorHighTempC: 6,
});
assert.equal(moistureRisk.best.condensationRisk, true, 'a cold wall near a high indoor dew point must raise a moisture warning');
assert.equal(moistureRisk.improvement.qualifiesAsImprovement, false, 'a condensation-risk concept must be rejected even when its energy is lower');

console.log(
  `Adaptive-wall smoke passed: ${discovery.candidatesEvaluated} automatically discovered concepts, `
  + `${defaults.improvement.dailyConditioningHeatReducedKWh.toFixed(2)} kWh/day default heat reduction, `
  + `${defaults.improvement.manufacturingEnergyPaybackYears?.toFixed(1)} year payback (not accepted).`,
);
