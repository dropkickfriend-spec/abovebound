import { SITE_LOCATION_PRESETS, type SiteLocationProfile } from './site_geometry_optimizer';

export type ExistingHomeEra = 'unknown' | 'pre_1980' | '1980_2005' | '2006_2018' | 'post_2018';
export type ExistingHomeForm = 'compact' | 'elongated' | 'complex';

export interface ExistingHomeAutopilotInput {
  location?: Partial<SiteLocationProfile>;
  estimatedFloorAreaM2?: number;
  constructionEra?: ExistingHomeEra;
  lifecycleYears?: number;
  targetIndoorTempC?: number;
}

interface ExistingHomeModel {
  id: string;
  label: string;
  era: Exclude<ExistingHomeEra, 'unknown'>;
  form: ExistingHomeForm;
  floorAreaM2: number;
  ceilingHeightM: number;
  wallR: number;
  roofR: number;
  floorR: number;
  windowU: number;
  windowSHGC: number;
  windowRatio: number;
  airLeakageACH: number;
  heatingCOP: number;
  coolingCOP: number;
  summerShadeFraction: number;
}

export interface ExistingHomeEnergyResult {
  annualHeatingKWh: number;
  annualCoolingKWh: number;
  annualFanKWh: number;
  annualTotalKWh: number;
}

export interface ExistingHomeRetrofitResult {
  id: string;
  label: string;
  measures: Array<{ id: string; label: string; explanation: string; applicableModels: number; applicabilityPercent: number }>;
  annualEnergyMedianKWh: number;
  annualEnergyLowKWh: number;
  annualEnergyHighKWh: number;
  annualEnergySavedMedianKWh: number;
  embodiedEnergyMedianKWh: number;
  lifecycleEnergySavedMedianKWh: number;
  lifecycleEnergySavedPercent: number;
  lifecyclePositiveModels: number;
  modelCount: number;
  robustPassPercent: number;
  energyPaybackYearsMedian: number | null;
  score: number;
}

export interface ExistingHomeAutopilotResult {
  location: SiteLocationProfile;
  lifecycleYears: number;
  targetIndoorTempC: number;
  modelCount: number;
  baseline: {
    annualEnergyMedianKWh: number;
    annualEnergyLowKWh: number;
    annualEnergyHighKWh: number;
    annualHeatingMedianKWh: number;
    annualCoolingMedianKWh: number;
    lifecycleEnergyMedianKWh: number;
  };
  best: ExistingHomeRetrofitResult | null;
  alternatives: ExistingHomeRetrofitResult[];
  confidence: {
    percent: number;
    label: 'screening' | 'moderate' | 'strong';
    robustModelAgreementPercent: number;
    uncertaintyDrivers: string[];
  };
  inferredHome: {
    floorAreaRangeM2: [number, number];
    erasCovered: string[];
    formsCovered: ExistingHomeForm[];
    description: string;
  };
  assumptions: string[];
  learning?: {
    mode: 'anonymous_aggregate';
    similarStudiesAvailable: number;
    exactLocationShared: false;
  };
}

interface RetrofitMeasure {
  id: string;
  label: string;
  explanation: string;
}

const MEASURES: RetrofitMeasure[] = [
  { id: 'roof_insulation', label: 'Upgrade roof insulation', explanation: 'Raise the ceiling or roof assembly to approximately R5.5.' },
  { id: 'air_sealing', label: 'Seal uncontrolled air leakage', explanation: 'Reduce drafts while retaining intentional ventilation.' },
  { id: 'heat_pump', label: 'High-efficiency reverse-cycle heat pump', explanation: 'Replace resistance or older compressor heating and cooling.' },
  { id: 'external_shade', label: 'Climate-tuned external shading', explanation: 'Block high summer sun while preserving useful winter solar access.' },
  { id: 'floor_insulation', label: 'Insulate exposed floors', explanation: 'Raise accessible suspended floors toward R2.5.' },
  { id: 'secondary_glazing', label: 'Secondary glazing and window seals', explanation: 'Reduce window conduction and frame leakage without full replacement.' },
  { id: 'wall_insulation', label: 'Retrofit wall insulation', explanation: 'Raise empty or poorly insulated wall cavities toward R3.2.' },
  { id: 'heat_recovery', label: 'Balanced heat-recovery ventilation', explanation: 'Recover exhaust heat while providing controlled fresh air.' },
];

const ERA_LIBRARY: Record<Exclude<ExistingHomeEra, 'unknown'>, Omit<ExistingHomeModel, 'id' | 'label' | 'era' | 'form' | 'floorAreaM2'>> = {
  pre_1980: { ceilingHeightM: 2.9, wallR: 0.65, roofR: 1.2, floorR: 0.45, windowU: 6.2, windowSHGC: 0.72, windowRatio: 0.18, airLeakageACH: 2.4, heatingCOP: 1.4, coolingCOP: 2.5, summerShadeFraction: 0.18 },
  '1980_2005': { ceilingHeightM: 2.7, wallR: 1.25, roofR: 2.2, floorR: 0.7, windowU: 5.7, windowSHGC: 0.68, windowRatio: 0.2, airLeakageACH: 1.7, heatingCOP: 2.1, coolingCOP: 2.7, summerShadeFraction: 0.2 },
  '2006_2018': { ceilingHeightM: 2.7, wallR: 2.2, roofR: 3.5, floorR: 1.3, windowU: 4.2, windowSHGC: 0.58, windowRatio: 0.22, airLeakageACH: 1.05, heatingCOP: 3, coolingCOP: 3, summerShadeFraction: 0.26 },
  post_2018: { ceilingHeightM: 2.7, wallR: 2.8, roofR: 4.5, floorR: 2, windowU: 3, windowSHGC: 0.5, windowRatio: 0.24, airLeakageACH: 0.7, heatingCOP: 3.7, coolingCOP: 3.5, summerShadeFraction: 0.34 },
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const round = (value: number, digits = 1) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};
const quantile = (values: number[], fraction: number) => {
  const ordered = [...values].sort((a, b) => a - b);
  if (ordered.length === 0) return 0;
  const index = (ordered.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return ordered[lower] + (ordered[upper] - ordered[lower]) * (index - lower);
};

function normalizeLocation(raw?: Partial<SiteLocationProfile>): SiteLocationProfile {
  const fallback = SITE_LOCATION_PRESETS.bendigo;
  return {
    name: String(raw?.name || fallback.name),
    latitudeDeg: clamp(Number(raw?.latitudeDeg ?? fallback.latitudeDeg), -66, 66),
    longitudeDeg: clamp(Number(raw?.longitudeDeg ?? fallback.longitudeDeg), -180, 180),
    averageDailySolarMJm2: clamp(Number(raw?.averageDailySolarMJm2 ?? fallback.averageDailySolarMJm2), 2, 35),
    summerDesignTempC: clamp(Number(raw?.summerDesignTempC ?? fallback.summerDesignTempC), 10, 55),
    winterDesignTempC: clamp(Number(raw?.winterDesignTempC ?? fallback.winterDesignTempC), -30, 25),
    heatingDegreeDays: clamp(Number(raw?.heatingDegreeDays ?? fallback.heatingDegreeDays), 0, 8000),
    coolingDegreeDays: clamp(Number(raw?.coolingDegreeDays ?? fallback.coolingDegreeDays), 0, 8000),
  };
}

function buildEnsemble(input: ExistingHomeAutopilotInput): ExistingHomeModel[] {
  const centerArea = clamp(Number(input.estimatedFloorAreaM2 ?? 130), 45, 500);
  const selectedEra = input.constructionEra && input.constructionEra !== 'unknown' ? input.constructionEra : null;
  const eras = selectedEra ? [selectedEra] : Object.keys(ERA_LIBRARY) as Array<Exclude<ExistingHomeEra, 'unknown'>>;
  const forms: ExistingHomeForm[] = ['compact', 'elongated', 'complex'];
  const areaMultipliers = selectedEra ? [0.85, 1, 1.15, 1.3] : [0.82, 1, 1.18];
  const models: ExistingHomeModel[] = [];
  eras.forEach((era, eraIndex) => {
    const base = ERA_LIBRARY[era];
    const count = selectedEra ? areaMultipliers.length : forms.length;
    for (let index = 0; index < count; index++) {
      const form = forms[index % forms.length];
      const multiplier = selectedEra ? areaMultipliers[index] : areaMultipliers[(eraIndex + index) % areaMultipliers.length];
      models.push({
        ...base,
        id: `${era}_${form}_${index}`,
        label: `${era.replaceAll('_', ' ')} ${form}`,
        era,
        form,
        floorAreaM2: round(centerArea * multiplier, 1),
      });
    }
  });
  return models;
}

function geometry(model: ExistingHomeModel) {
  const formFactor = model.form === 'compact' ? 1 : model.form === 'elongated' ? 1.16 : 1.32;
  const perimeterM = Math.sqrt(model.floorAreaM2) * 4 * formFactor;
  const wallAreaM2 = perimeterM * model.ceilingHeightM;
  const windowAreaM2 = wallAreaM2 * model.windowRatio;
  return {
    perimeterM,
    wallAreaM2,
    opaqueWallAreaM2: Math.max(1, wallAreaM2 - windowAreaM2),
    windowAreaM2,
    roofAreaM2: model.floorAreaM2 * (model.form === 'complex' ? 1.15 : 1.07),
    floorAreaM2: model.floorAreaM2,
    volumeM3: model.floorAreaM2 * model.ceilingHeightM,
  };
}

function simulateEnergy(model: ExistingHomeModel, location: SiteLocationProfile, targetIndoorTempC: number, measures: Set<string>): ExistingHomeEnergyResult & { embodiedKWh: number; applied: RetrofitMeasure[] } {
  const areas = geometry(model);
  let wallR = model.wallR;
  let roofR = model.roofR;
  let floorR = model.floorR;
  let windowU = model.windowU;
  let windowSHGC = model.windowSHGC;
  let ach = model.airLeakageACH;
  let heatingCOP = model.heatingCOP;
  let coolingCOP = model.coolingCOP;
  let shade = model.summerShadeFraction;
  let infiltrationRecovery = 0;
  let annualFanKWh = 0;
  let embodiedKWh = 0;
  const applied: RetrofitMeasure[] = [];
  const apply = (id: string, condition: boolean, energy: number, change: () => void) => {
    if (!measures.has(id) || !condition) return;
    applied.push(MEASURES.find(measure => measure.id === id)!);
    embodiedKWh += energy;
    change();
  };

  apply('roof_insulation', roofR < 5, areas.roofAreaM2 * 18 * (5.5 - roofR) / 4.5, () => { roofR = 5.5; });
  apply('air_sealing', ach > 0.75, 320 + areas.floorAreaM2 * 1.5, () => { ach = Math.max(0.6, ach * 0.43); });
  apply('heat_pump', heatingCOP < 4.2 || coolingCOP < 3.8, 2300, () => { heatingCOP = 4.5; coolingCOP = 4.1; });
  apply('external_shade', shade < 0.55, areas.windowAreaM2 * 15 + areas.perimeterM * 5, () => { shade = 0.68; });
  apply('floor_insulation', floorR < 2, areas.floorAreaM2 * 24 * (2.5 - floorR) / 2.2, () => { floorR = 2.5; });
  apply('secondary_glazing', windowU > 2.6, areas.windowAreaM2 * 125, () => { windowU = 2.2; windowSHGC = Math.min(windowSHGC, 0.55); });
  apply('wall_insulation', wallR < 2.6, areas.opaqueWallAreaM2 * 44 * (3.2 - wallR) / 2.8, () => { wallR = 3.2; });
  apply('heat_recovery', ach > 0.55 && location.heatingDegreeDays > 900, 1750, () => { infiltrationRecovery = 0.72; annualFanKWh = 210; });

  const conductionWPerK = areas.opaqueWallAreaM2 / wallR
    + areas.roofAreaM2 / roofR
    + areas.floorAreaM2 / floorR
    + areas.windowAreaM2 * windowU;
  const infiltrationWPerK = 0.33 * ach * areas.volumeM3 * (1 - infiltrationRecovery);
  const totalWPerK = conductionWPerK + infiltrationWPerK;
  const annualIncidentWindowSolarKWh = location.averageDailySolarMJm2 / 3.6 * 365 * areas.windowAreaM2;
  const climateDays = Math.max(1, location.heatingDegreeDays + location.coolingDegreeDays);
  const heatingShare = location.heatingDegreeDays / climateDays;
  const coolingShare = location.coolingDegreeDays / climateDays;
  const usefulWinterSolarKWh = annualIncidentWindowSolarKWh * windowSHGC * heatingShare * 0.12;
  const unwantedSummerSolarKWh = annualIncidentWindowSolarKWh * windowSHGC * coolingShare * (1 - shade) * 0.3;
  const heatingComfortFactor = clamp((targetIndoorTempC - 14) / 8, 0.55, 1.45);
  const coolingComfortFactor = clamp((30 - targetIndoorTempC) / 8, 0.55, 1.45);
  const heatingThermalKWh = Math.max(0, totalWPerK * location.heatingDegreeDays * 24 / 1000 * 0.72 * heatingComfortFactor - usefulWinterSolarKWh);
  const coolingThermalKWh = Math.max(0, totalWPerK * location.coolingDegreeDays * 24 / 1000 * 0.64 * coolingComfortFactor + unwantedSummerSolarKWh);
  const annualHeatingKWh = heatingThermalKWh / heatingCOP;
  const annualCoolingKWh = coolingThermalKWh / coolingCOP;
  return {
    annualHeatingKWh,
    annualCoolingKWh,
    annualFanKWh,
    annualTotalKWh: annualHeatingKWh + annualCoolingKWh + annualFanKWh,
    embodiedKWh,
    applied,
  };
}

function evaluateBundle(
  requestedIds: string[],
  models: ExistingHomeModel[],
  location: SiteLocationProfile,
  targetIndoorTempC: number,
  lifecycleYears: number,
  baselines: ReturnType<typeof simulateEnergy>[],
): ExistingHomeRetrofitResult | null {
  const measureSet = new Set(requestedIds);
  const scenarios = models.map((model, index) => {
    const result = simulateEnergy(model, location, targetIndoorTempC, measureSet);
    const baseline = baselines[index];
    return {
      result,
      annualSavedKWh: baseline.annualTotalKWh - result.annualTotalKWh,
      lifecycleSavedKWh: (baseline.annualTotalKWh - result.annualTotalKWh) * lifecycleYears - result.embodiedKWh,
    };
  });
  const appliedIds = [...new Set(scenarios.flatMap(scenario => scenario.result.applied.map(measure => measure.id)))];
  if (appliedIds.length === 0) return null;
  const annualTotals = scenarios.map(scenario => scenario.result.annualTotalKWh);
  const annualSavings = scenarios.map(scenario => scenario.annualSavedKWh);
  const embodied = scenarios.map(scenario => scenario.result.embodiedKWh);
  const lifecycleSavings = scenarios.map(scenario => scenario.lifecycleSavedKWh);
  const baselineLifecycle = baselines.map(baseline => baseline.annualTotalKWh * lifecycleYears);
  const positiveModels = lifecycleSavings.filter(value => value > 0).length;
  const passPercent = positiveModels / models.length * 100;
  const medianLifecycleSaved = quantile(lifecycleSavings, 0.5);
  const medianAnnualSaved = quantile(annualSavings, 0.5);
  const medianEmbodied = quantile(embodied, 0.5);
  const payback = medianAnnualSaved > 0 ? medianEmbodied / medianAnnualSaved : null;
  const uncertaintyPenalty = (quantile(lifecycleSavings, 0.75) - quantile(lifecycleSavings, 0.25)) * 0.22;
  const score = medianLifecycleSaved * (0.35 + passPercent / 100 * 0.65) - uncertaintyPenalty;
  const measures = appliedIds.map(id => {
    const measure = MEASURES.find(candidate => candidate.id === id)!;
    const applicableModels = scenarios.filter(scenario => scenario.result.applied.some(applied => applied.id === id)).length;
    return { ...measure, applicableModels, applicabilityPercent: round(applicableModels / models.length * 100) };
  }).filter(Boolean);
  return {
    id: appliedIds.join('+'),
    label: measures.length === 1 ? measures[0].label : `${measures.length}-measure conditional retrofit`,
    measures,
    annualEnergyMedianKWh: round(quantile(annualTotals, 0.5)),
    annualEnergyLowKWh: round(quantile(annualTotals, 0.1)),
    annualEnergyHighKWh: round(quantile(annualTotals, 0.9)),
    annualEnergySavedMedianKWh: round(medianAnnualSaved),
    embodiedEnergyMedianKWh: round(medianEmbodied),
    lifecycleEnergySavedMedianKWh: round(medianLifecycleSaved),
    lifecycleEnergySavedPercent: round(medianLifecycleSaved / Math.max(1, quantile(baselineLifecycle, 0.5)) * 100),
    lifecyclePositiveModels: positiveModels,
    modelCount: models.length,
    robustPassPercent: round(passPercent),
    energyPaybackYearsMedian: payback === null || !Number.isFinite(payback) ? null : round(payback, 1),
    score: round(score),
  };
}

export function runExistingHomeAutopilot(rawInput: ExistingHomeAutopilotInput = {}): ExistingHomeAutopilotResult {
  const location = normalizeLocation(rawInput.location);
  const lifecycleYears = clamp(Math.round(Number(rawInput.lifecycleYears ?? 25)), 5, 60);
  const targetIndoorTempC = clamp(Number(rawInput.targetIndoorTempC ?? 22), 16, 28);
  const models = buildEnsemble(rawInput);
  const baselines = models.map(model => simulateEnergy(model, location, targetIndoorTempC, new Set()));
  const uniqueBundles = new Map<string, ExistingHomeRetrofitResult>();
  const bundleCount = 2 ** MEASURES.length;
  for (let mask = 1; mask < bundleCount; mask++) {
    const ids = MEASURES.filter((_measure, index) => mask & (1 << index)).map(measure => measure.id);
    const result = evaluateBundle(ids, models, location, targetIndoorTempC, lifecycleYears, baselines);
    if (!result) continue;
    const existing = uniqueBundles.get(result.id);
    if (!existing || result.score > existing.score) uniqueBundles.set(result.id, result);
  }
  const ranked = [...uniqueBundles.values()]
    .filter(result => result.robustPassPercent >= 75 && result.lifecycleEnergySavedMedianKWh > 0)
    .sort((a, b) => b.score - a.score);
  const best = ranked[0] || null;
  const baselineTotals = baselines.map(result => result.annualTotalKWh);
  const floorAreas = models.map(model => model.floorAreaM2);
  const agreement = best?.robustPassPercent ?? 0;
  const confidencePercent = rawInput.constructionEra && rawInput.constructionEra !== 'unknown'
    ? Math.min(88, 55 + agreement * 0.33)
    : Math.min(76, 35 + agreement * 0.4);
  return {
    location,
    lifecycleYears,
    targetIndoorTempC,
    modelCount: models.length,
    baseline: {
      annualEnergyMedianKWh: round(quantile(baselineTotals, 0.5)),
      annualEnergyLowKWh: round(quantile(baselineTotals, 0.1)),
      annualEnergyHighKWh: round(quantile(baselineTotals, 0.9)),
      annualHeatingMedianKWh: round(quantile(baselines.map(result => result.annualHeatingKWh), 0.5)),
      annualCoolingMedianKWh: round(quantile(baselines.map(result => result.annualCoolingKWh), 0.5)),
      lifecycleEnergyMedianKWh: round(quantile(baselineTotals, 0.5) * lifecycleYears),
    },
    best,
    alternatives: ranked.slice(1, 5),
    confidence: {
      percent: round(confidencePercent),
      label: confidencePercent >= 80 ? 'strong' : confidencePercent >= 60 ? 'moderate' : 'screening',
      robustModelAgreementPercent: agreement,
      uncertaintyDrivers: [
        'construction era and existing insulation',
        'actual floor area and external surface area',
        'air leakage and window performance',
        'existing heating and cooling equipment efficiency',
      ],
    },
    inferredHome: {
      floorAreaRangeM2: [round(Math.min(...floorAreas)), round(Math.max(...floorAreas))],
      erasCovered: [...new Set(models.map(model => model.era.replaceAll('_', ' ')))],
      formsCovered: [...new Set(models.map(model => model.form))],
      description: rawInput.constructionEra && rawInput.constructionEra !== 'unknown'
        ? `Four plausible ${rawInput.constructionEra.replaceAll('_', ' ')} homes are tested around the estimated area.`
        : 'Twelve plausible homes span four construction eras, three footprint complexities and a realistic floor-area range.',
    },
    assumptions: [
      'No floorplan, image, address database or external AI service is required.',
      'Recommendations are accepted only when lifecycle savings remain positive in at least 75% of the plausible-home ensemble.',
      'Construction energy is included for insulation, glazing, shading, sealing, ventilation and HVAC equipment.',
      'This is a screening model. A site inspection or energy assessment should verify construction and moisture/ventilation safety before work begins.',
    ],
  };
}
