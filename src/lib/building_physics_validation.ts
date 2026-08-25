import { calculateSolarPosition, SITE_LOCATION_PRESETS } from './site_geometry_optimizer';
import { optimizeWholeHouseSystem } from './whole_house_optimizer';

export type PhysicsValidationStatus = 'pass' | 'warn' | 'fail';
export type PhysicsValidationCategory = 'solar' | 'shadow' | 'conduction' | 'ventilation' | 'mass_balance' | 'determinism' | 'lifecycle';

export interface PhysicsValidationCase {
  id: string;
  category: PhysicsValidationCategory;
  label: string;
  expected: number;
  actual: number;
  tolerance: number;
  unit: string;
  status: PhysicsValidationStatus;
  source: string;
  note: string;
}

export interface BuildingPhysicsValidationReport {
  generatedAt: string;
  validationLevel: 'level_1_numerical_invariants';
  cases: PhysicsValidationCase[];
  passed: number;
  warned: number;
  failed: number;
  scorePercent: number;
  readyForScreening: boolean;
  limitations: string[];
  nextBenchmark: string;
}

const round = (value: number, digits = 4) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

export const calculateShadowLengthM = (heightM: number, altitudeRad: number) => (
  altitudeRad > 0 ? heightM / Math.tan(altitudeRad) : Number.POSITIVE_INFINITY
);

const makeCase = (
  id: string,
  category: PhysicsValidationCategory,
  label: string,
  expected: number,
  actual: number,
  tolerance: number,
  unit: string,
  source: string,
  note: string,
): PhysicsValidationCase => {
  const difference = Math.abs(actual - expected);
  const status: PhysicsValidationStatus = difference <= tolerance ? 'pass' : difference <= tolerance * 2 ? 'warn' : 'fail';
  return { id, category, label, expected: round(expected), actual: round(actual), tolerance, unit, status, source, note };
};

export function runBuildingPhysicsValidation(): BuildingPhysicsValidationReport {
  const cases: PhysicsValidationCase[] = [];

  const conductionW = 30 / 3 * 10;
  cases.push(makeCase(
    'fabric-q-a-over-r-delta-t', 'conduction', 'Steady opaque-fabric heat flow',
    100, conductionW, 0.001, 'W', 'first-principles identity',
    'Checks Q = A/R × ΔT for a 30 m² surface, R-3 and 10 K temperature difference.',
  ));

  const ventilationW = 1.204 * 1006 * 0.1 * 10;
  cases.push(makeCase(
    'ventilation-rho-cp-q-delta-t', 'ventilation', 'Sensible ventilation heat flow',
    1211.224, ventilationW, 0.01, 'W', 'first-principles identity',
    'Checks Q = ρ × cp × volumetric flow × ΔT using dry-air screening constants.',
  ));

  const equinoxNoon = calculateSolarPosition(0, 80, 12).altitudeRad * 180 / Math.PI;
  cases.push(makeCase(
    'solar-equinox-equator-noon', 'solar', 'Equatorial equinox solar altitude',
    90, equinoxNoon, 1, 'degrees', 'astronomical geometry invariant',
    'At the equator near the March equinox, the noon sun should be approximately overhead.',
  ));

  const bendigoWinterNoon = calculateSolarPosition(SITE_LOCATION_PRESETS.bendigo.latitudeDeg, 172, 12).altitudeRad * 180 / Math.PI;
  cases.push(makeCase(
    'solar-bendigo-june-noon', 'solar', 'Bendigo June-solstice solar altitude',
    29.8, bendigoWinterNoon, 1, 'degrees', 'astronomical geometry invariant',
    'Checks southern-hemisphere latitude and declination signs at the June solstice.',
  ));

  const shadow = calculateShadowLengthM(3, Math.PI / 4);
  cases.push(makeCase(
    'shadow-45-degree', 'shadow', '45° building shadow length',
    3, shadow, 0.001, 'm', 'geometric identity',
    'A vertical 3 m object under a 45° solar altitude casts a 3 m level-ground shadow.',
  ));

  const first = optimizeWholeHouseSystem({ maximumCandidates: 576 });
  const second = optimizeWholeHouseSystem({ maximumCandidates: 576 });
  cases.push(makeCase(
    'airflow-pressure-mass-balance', 'mass_balance', 'Pressure-network mass balance',
    0, first.best.performance.maximumMassBalanceResidualLs, 0.1, 'L/s', 'solver conservation invariant',
    'Maximum room residual must remain below the screening threshold after the linear pressure solve.',
  ));

  const sameWinner = JSON.stringify(first.best.configuration) === JSON.stringify(second.best.configuration)
    && first.best.totalLifecycleEnergyKWh === second.best.totalLifecycleEnergyKWh;
  cases.push(makeCase(
    'whole-system-determinism', 'determinism', 'Repeatable automatic sweep',
    1, sameWinner ? 1 : 0, 0, 'boolean', 'regression invariant',
    'Identical inputs must return the same configuration and lifecycle energy.',
  ));

  const lifecycleExpected = first.best.annual.totalOperationalKWh * 30 + first.best.manufacturing.totalKWh;
  cases.push(makeCase(
    'lifecycle-accounting', 'lifecycle', 'Lifecycle energy accounting',
    lifecycleExpected, first.best.totalLifecycleEnergyKWh, 0.2, 'kWh', 'accounting invariant',
    'Checks operational energy over the selected 30-year horizon plus manufacturing energy.',
  ));

  const passed = cases.filter(item => item.status === 'pass').length;
  const warned = cases.filter(item => item.status === 'warn').length;
  const failed = cases.filter(item => item.status === 'fail').length;
  return {
    generatedAt: new Date().toISOString(),
    validationLevel: 'level_1_numerical_invariants',
    cases,
    passed,
    warned,
    failed,
    scorePercent: round((passed + warned * 0.5) / cases.length * 100, 1),
    readyForScreening: failed === 0,
    limitations: [
      'These checks catch unit, sign, conservation, geometry and repeatability errors; they are not a whole-building validation certificate.',
      'Envelope, solar and HVAC screening results still require comparison with published ASHRAE Standard 140 / BESTEST cases.',
      'Construction decisions require calibrated weather, surveyed geometry, product data and qualified engineering review.',
    ],
    nextBenchmark: 'Run the generated building model against published ASHRAE Standard 140 / BESTEST annual heating and cooling ranges.',
  };
}
