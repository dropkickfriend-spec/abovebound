import assert from 'node:assert/strict';
import {
  DEFAULT_SHARED_SITE_MODEL,
  applySharedModel,
  lifecycleHorizonsByPanel,
  outdoorDayRangeC,
  LIFECYCLE_PANELS,
  type SharedSiteModel,
} from '../src/lib/shared_site_model';
import { SITE_LOCATION_PRESETS } from '../src/lib/site_geometry_optimizer';

const model = DEFAULT_SHARED_SITE_MODEL;

// 1. Every panel screens ONE lifecycle horizon. This is the regression guard on
//    the defect: horizons were 15/20/20/25/30 across panels whose "% lifecycle
//    saving" headlines were displayed side by side as if comparable.
const horizons = lifecycleHorizonsByPanel(model);
const distinct = new Set(Object.values(horizons));
assert.equal(distinct.size, 1, `panels must share one lifecycle horizon, got ${JSON.stringify(horizons)}`);
assert.equal(Object.keys(horizons).length, LIFECYCLE_PANELS.length, 'every lifecycle panel must be covered');

// 2. Changing the shared horizon reaches every panel.
const longer: SharedSiteModel = { ...model, lifecycleYears: 45 };
assert.ok(
  Object.values(lifecycleHorizonsByPanel(longer)).every(years => years === 45),
  'a shared horizon change must reach every panel',
);

// 3. Setpoint and COP are single-valued across panels.
const setpoints = new Set<number>();
const cops = new Set<number>();
LIFECYCLE_PANELS.forEach(panel => {
  const projected = applySharedModel(panel, model, {} as Record<string, unknown>).inputs as Record<string, unknown>;
  const setpoint = projected.targetTempC ?? projected.targetIndoorTempC ?? projected.indoorTempC;
  if (typeof setpoint === 'number') setpoints.add(setpoint);
  if (typeof projected.hvacCop === 'number') cops.add(projected.hvacCop);
});
assert.equal(setpoints.size, 1, `panels must share one indoor setpoint, got ${[...setpoints].join(', ')}`);
assert.equal(cops.size, 1, `panels must share one HVAC COP, got ${[...cops].join(', ')}`);

// 4. Upstream wins, and the override is reported rather than silently applied.
const handEdited = { targetTempC: 19, lifecycleYears: 20, latticeFillFraction: 0.04 };
const { inputs, overrides } = applySharedModel('roomOptimizer', model, handEdited);
assert.equal(inputs.targetTempC, model.targetIndoorTempC, 'upstream setpoint must win');
assert.equal(inputs.lifecycleYears, model.lifecycleYears, 'upstream horizon must win');
assert.equal(inputs.latticeFillFraction, 0.04, 'panel-local parameters must be preserved untouched');
const overriddenFields = overrides.map(entry => entry.field).sort();
assert.deepEqual(overriddenFields, ['lifecycleYears', 'targetTempC'], 'both overridden fields must be reported');
assert.equal(overrides.find(entry => entry.field === 'targetTempC')?.from, 19, 'override must report the replaced value');

// 5. An already-consistent panel reports no overrides (no spurious change notices).
const consistent = applySharedModel('roomOptimizer', model, inputs);
assert.equal(consistent.overrides.length, 0, 'a consistent panel must not report overrides');

// 6. Outdoor day ranges are derived from the site, ordered, and mode-aware.
const cooling = outdoorDayRangeC(model, 'cooling');
const heating = outdoorDayRangeC(model, 'heating');
assert.ok(cooling.highC > cooling.lowC, 'cooling day range must be ordered');
assert.ok(heating.highC > heating.lowC, 'heating day range must be ordered');
assert.equal(cooling.highC, model.location.summerDesignTempC, 'cooling day must peak at the summer design temperature');
assert.equal(heating.lowC, model.location.winterDesignTempC, 'heating day must trough at the winter design temperature');
assert.ok(cooling.lowC > heating.highC, 'a summer day must sit above a winter day');

// 7. Switching site preset moves every panel to the same site.
const hobart: SharedSiteModel = {
  ...model,
  location: { ...SITE_LOCATION_PRESETS.hobart },
  locationPresetKey: 'hobart',
};
const sites = new Set<number>();
(['autopilot', 'siteOptimizer'] as const).forEach(panel => {
  const projected = applySharedModel(panel, hobart, {} as Record<string, unknown>).inputs as Record<string, unknown>;
  sites.add(Number(projected.heatingDegreeDays));
});
assert.equal(sites.size, 1, 'site-scoped panels must agree on the loaded site');
assert.equal([...sites][0], SITE_LOCATION_PRESETS.hobart.heatingDegreeDays, 'panels must follow the selected preset');

console.log(JSON.stringify({
  panels: LIFECYCLE_PANELS.length,
  sharedLifecycleYears: [...distinct][0],
  sharedSetpointC: [...setpoints][0],
  sharedHvacCop: [...cops][0],
  coolingDayC: `${cooling.lowC}-${cooling.highC}`,
  heatingDayC: `${heating.lowC}-${heating.highC}`,
  overridesReported: overriddenFields.length,
}, null, 2));
