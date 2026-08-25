import assert from 'node:assert/strict';
import { runExistingHomeAutopilot } from '../src/lib/existing_home_autopilot';
import { SITE_LOCATION_PRESETS } from '../src/lib/site_geometry_optimizer';

const bendigo = runExistingHomeAutopilot({ location: SITE_LOCATION_PRESETS.bendigo });
const repeated = runExistingHomeAutopilot({ location: SITE_LOCATION_PRESETS.bendigo });

assert.equal(bendigo.modelCount, 12, 'zero-input mode should retain twelve plausible homes');
assert.ok(bendigo.best, 'Bendigo screening should find a robust lifecycle-positive retrofit');
assert.ok(bendigo.best!.robustPassPercent >= 75, 'the winning retrofit must work across at least 75% of plausible homes');
assert.ok(bendigo.best!.embodiedEnergyMedianKWh > 0, 'manufacturing energy must be included');
assert.ok(bendigo.best!.lifecycleEnergySavedMedianKWh > 0, 'the selected package must save lifecycle energy');
assert.deepEqual(bendigo.best, repeated.best, 'the autopilot must be deterministic for identical evidence');

const knownEra = runExistingHomeAutopilot({
  location: SITE_LOCATION_PRESETS.hobart,
  constructionEra: 'pre_1980',
  estimatedFloorAreaM2: 105,
});
assert.equal(knownEra.modelCount, 4, 'a known era should narrow the ensemble without requiring a floorplan');
assert.ok(knownEra.confidence.percent > bendigo.confidence.percent, 'a construction-era hint should increase confidence');
assert.ok(knownEra.best?.measures.some(measure => measure.id === 'roof_insulation'), 'a cold older-home package should consider roof insulation');

const darwin = runExistingHomeAutopilot({ location: SITE_LOCATION_PRESETS.darwin });
assert.ok(darwin.best?.measures.some(measure => measure.id === 'external_shade'), 'a hot-climate package should consider external shading');

console.log(
  `Existing-home autopilot OK: ${bendigo.modelCount} plausible homes, `
  + `${bendigo.best!.measures.length} measures, ${bendigo.best!.lifecycleEnergySavedPercent.toFixed(1)}% net lifecycle saving.`,
);
