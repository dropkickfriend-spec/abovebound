import assert from 'node:assert/strict';
import {
  EMBODIED_ENERGY_EVIDENCE,
  COMFORT_CRITERIA,
  GLAZING_EVIDENCE,
  BESTEST_ACCEPTANCE_RANGES,
  withinBestestRange,
  embodiedEvidenceFor,
} from '../src/lib/evidence_sources';
import { DWELLING_ARCHETYPES, SCREENING_CONSTRAINTS, optimizeWholeHouseSystem } from '../src/lib/whole_house_optimizer';

// 1. Every evidence entry is traceable: a locator, or an explicit null value.
EMBODIED_ENERGY_EVIDENCE.forEach(entry => {
  if (entry.typicalKWhPerM2 !== null) {
    assert.ok(entry.source, `${entry.archetypeId}: a value must name a source`);
    assert.ok(entry.source!.locator.length > 0, `${entry.archetypeId}: source must have a locator`);
    assert.ok(entry.sourceBoundary !== 'no qualifying source',
      `${entry.archetypeId}: a value cannot sit on a "no qualifying source" boundary`);
  }
});

// 2. The single-case apartment studies must never be usable as defaults.
(['lowrise_apartment_mid', 'tower_apartment_mid'] as const).forEach(id => {
  const entry = embodiedEvidenceFor(id)!;
  assert.equal(entry.modelUse, false, `${id}: single-case context must not be model-usable`);
  assert.equal(entry.confidence, 'low_for_model_use', `${id}: confidence must flag limited model use`);
  assert.equal(entry.includesCommonStructure, true, `${id}: common-structure allocation must be recorded`);
});

// 3. Terrace has no qualifying source and must not acquire a value.
const terrace = embodiedEvidenceFor('terrace_mid')!;
assert.equal(terrace.typicalKWhPerM2, null, 'terrace must remain null until a qualifying source exists');
assert.equal(terrace.modelUse, false, 'terrace must not be model-usable');

// 4. Detached is the only model-usable factor, and its older boundary is stated.
const detached = embodiedEvidenceFor('detached')!;
assert.equal(detached.modelUse, true, 'detached is the only qualifying range');
assert.ok(detached.typicalKWhPerM2! > 1000, 'detached range must reflect the published magnitude');
assert.ok(/not EN 15978 A1-A3/.test(detached.sourceBoundary),
  'detached boundary must state it is not modern A1-A3');

// 5. Every shipped archetype constant declares its evidence status. None may
//    claim to be sourced while the audit found no qualifying source.
Object.values(DWELLING_ARCHETYPES).forEach(profile => {
  assert.ok(profile.embodiedEvidence, `${profile.id}: must declare embodied evidence status`);
  assert.equal(profile.embodiedEvidence.sourced, false,
    `${profile.id}: no shipped embodied factor is sourced yet - do not mark one sourced without a locator`);
  assert.ok(profile.embodiedEvidence.note.length > 40, `${profile.id}: evidence note must be substantive`);
});

// 6. Comfort is a constraint, never an energy conversion.
assert.equal(COMFORT_CRITERIA.energyPenaltyConversion, null,
  'no accepted deviation-to-energy conversion exists; none may be introduced');
assert.equal(COMFORT_CRITERIA.prescribedExceedanceFraction, null,
  'no standard prescribes a universal exceedance fraction');
assert.equal(COMFORT_CRITERIA.pmvLimit, 0.5, 'ASHRAE 55 band is PMV +/-0.5');
assert.ok(SCREENING_CONSTRAINTS.basis.includes('project-specified'),
  'screening limits must be labelled as project choices, not sourced values');

// 7. The objective is lifecycle energy alone - the regression guard on the
//    comfort penalty, which was ~30% of the old score at 75 kWh/(K.m2.yr).
const result = optimizeWholeHouseSystem({});
result.ranked.forEach(candidate => {
  assert.equal(candidate.score, candidate.totalLifecycleEnergyKWh,
    'score must equal lifecycle energy; no constraint may be folded into the objective');
});

// 8. Feasible candidates outrank infeasible ones, and the selection is the
//    lowest-energy feasible candidate.
const feasibleRanked = result.ranked.filter(candidate => candidate.feasible);
const infeasibleRanked = result.ranked.filter(candidate => !candidate.feasible);
if (feasibleRanked.length && infeasibleRanked.length) {
  const lastFeasible = result.ranked.findIndex(candidate => !candidate.feasible);
  assert.ok(result.ranked.slice(lastFeasible).every(candidate => !candidate.feasible),
    'feasible candidates must all rank ahead of infeasible ones');
}
assert.ok(result.best.feasible || feasibleRanked.length === 0,
  'an infeasible candidate may only win when nothing feasible exists');

// 9. Constraint exceedance is reported, not silently absorbed.
const c = result.best.constraints;
assert.ok(typeof c.comfortExceedanceC === 'number' && c.comfortExceedanceC >= 0, 'comfort exceedance must be reported');
assert.ok(typeof c.noiseExceedanceDbA === 'number', 'noise exceedance must be reported');
assert.equal(c.comfortPass, c.comfortExceedanceC <= 0, 'pass flag must agree with exceedance');

// 10. The ranking driver is disclosed in the assumptions.
assert.ok(result.assumptions.some(entry => /UNSOURCED/.test(entry)),
  'the unsourced embodied factors driving the ranking must be disclosed');

// 11. BESTEST bands are exact and the membership test is inclusive.
const case600 = BESTEST_ACCEPTANCE_RANGES.find(entry => entry.caseId === '600')!;
assert.deepEqual(case600.heatingMWhRange, { low: 3.75, high: 4.98 });
assert.deepEqual(case600.sensibleCoolingMWhRange, { low: 5.00, high: 6.83 });
const case900 = BESTEST_ACCEPTANCE_RANGES.find(entry => entry.caseId === '900')!;
assert.deepEqual(case900.heatingMWhRange, { low: 1.04, high: 2.28 });
assert.deepEqual(case900.sensibleCoolingMWhRange, { low: 2.35, high: 2.60 });
assert.equal(withinBestestRange('600', 'heating', 3.75), true, 'band must be inclusive at the low edge');
assert.equal(withinBestestRange('600', 'heating', 4.98), true, 'band must be inclusive at the high edge');
assert.equal(withinBestestRange('600', 'heating', 3.74), false, 'below band must fail');
assert.equal(withinBestestRange('999', 'heating', 4), null, 'unknown case must return null, not a pass');

// 12. NCC daylight rule must not be mistaken for an energy glazing fraction.
assert.equal(GLAZING_EVIDENCE.nccDaylightMinimumPercentPerRoom, 10);
assert.ok(GLAZING_EVIDENCE.victorianGlazingToFloorPercent > GLAZING_EVIDENCE.glazingToFloorRatioRange.lowPercent - 1,
  'Victorian sample must sit inside the reported national range');
assert.ok(GLAZING_EVIDENCE.standardSHGC > GLAZING_EVIDENCE.improvedSHGCRange.high,
  'standard glazing must admit more heat than improved systems');

console.log(JSON.stringify({
  embodiedEntries: EMBODIED_ENERGY_EVIDENCE.length,
  modelUsableEmbodiedFactors: EMBODIED_ENERGY_EVIDENCE.filter(entry => entry.modelUse).length,
  shippedArchetypesMarkedSourced: Object.values(DWELLING_ARCHETYPES).filter(p => p.embodiedEvidence.sourced).length,
  objectiveIsEnergyOnly: true,
  bestestCases: BESTEST_ACCEPTANCE_RANGES.length,
}, null, 2));
