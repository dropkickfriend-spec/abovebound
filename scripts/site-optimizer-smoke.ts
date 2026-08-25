import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  evaluateSiteHouseDesign,
  optimizeSiteGeometry,
  SITE_LOCATION_PRESETS,
  type SiteHouseDesign,
} from '../src/lib/site_geometry_optimizer';
import { V12HouseEngine } from '../src/simulations/v12_house';

const input = {
  location: SITE_LOCATION_PRESETS.bendigo,
  targetFloorAreaM2: 130,
  minFloorAreaM2: 110,
  maxFloorAreaM2: 150,
  lotWidthM: 30,
  lotDepthM: 45,
  lifecycleYears: 30,
  iterations: 500,
  seed: 24091,
  requirements: {
    designWindSpeedMs: 40,
    floodFloorElevationM: 0,
    bushfireAttackLevel: 'none' as const,
    seismicClass: 'low' as const,
    snowLoadKPa: 0,
    maxUnsupportedSpanM: 12,
  },
};

const first = optimizeSiteGeometry(input);
const repeated = optimizeSiteGeometry(input);

assert.equal(first.sunPath.length, 9, 'sun summary should include three hours for two solstices and an equinox');
assert.ok(first.candidatesEvaluated >= 800, 'site search should include random and refinement candidates');
assert.equal(first.best.feasible, true, 'selected site design must satisfy every screening constraint');
assert.equal(first.best.complianceChecks.every(check => check.passed), true, 'all selected-design constraints must pass');
assert.ok(first.best.design.floorAreaM2 >= 110 && first.best.design.floorAreaM2 <= 150, 'selected area must remain usable');
assert.ok(first.best.totalLifecycleEnergyKWh <= first.baseline.totalLifecycleEnergyKWh, 'search must not return a higher-energy feasible design');
assert.ok(first.best.solar.summerShadePercent >= 0 && first.best.solar.summerShadePercent <= 100, 'summer shade must be a percentage');
assert.ok(first.best.solar.winterSolarAccessPercent >= 0 && first.best.solar.winterSolarAccessPercent <= 100, 'winter access must be a percentage');
assert.deepEqual(first.best, repeated.best, 'site search must be deterministic for a fixed seed');

const courtyard: SiteHouseDesign = {
  form: 'courtyard', orientationDeg: 90, floorAreaM2: 130,
  widthM: 16.05, depthM: 13.38, ceilingHeightM: 2.7, wingRatio: 0.45,
  eaveEquatorM: 0.8, eaveOtherM: 0.5, roofPitchDeg: 22,
  equatorGlazingRatio: 0.25, otherGlazingRatio: 0.12, floorElevationM: 0.2,
  structuralSystem: 'reinforced_masonry', resilientShell: 'standard',
};
const courtyardResult = evaluateSiteHouseDesign(courtyard, {
  ...input,
  location: SITE_LOCATION_PRESETS.darwin,
});
assert.ok(courtyardResult.solar.annualSelfShadedKWh > 0, 'courtyard wings must cast a measurable geometric shadow');
assert.ok(
  Math.abs(
    courtyardResult.totalLifecycleEnergyKWh
    - (courtyardResult.operational.annualTotalKWh * 30 + courtyardResult.manufacturing.totalKWh)
  ) < 2,
  'lifecycle total must include operation and construction energy (within displayed rounding)',
);

assert.equal(first.improvement.qualifiesAsImprovement, true, 'smoke-test site should yield an applicable improvement');
const engine = new V12HouseEngine(new THREE.Scene());
engine.applySiteGeometryOptimization(first);
assert.ok(engine.getRooms().length >= 5, 'accepted site design should generate a multi-room V12 layout');
assert.equal(engine.getSiteDesignState().orientationDeg, first.best.design.orientationDeg, 'V12 should retain the optimized site orientation');

console.log(
  `Site optimizer OK: ${first.candidatesEvaluated.toLocaleString()} forms, `
  + `${first.best.design.form} at ${first.best.design.orientationDeg.toFixed(0)}°, `
  + `${first.improvement.lifecycleEnergySavedPercent.toFixed(1)}% net lifecycle saving.`,
);
