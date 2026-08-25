export type RoomAirflowStrategy = 'cross' | 'stack' | 'mixed';

export interface NormalizedVentPosition {
  x: number;
  y: number;
  z: number;
}

export interface RoomLifecycleDesign {
  widthM: number;
  lengthM: number;
  ceilingHeightM: number;
  strategy: RoomAirflowStrategy;
  intake: NormalizedVentPosition;
  exhaust: NormalizedVentPosition;
  flowRateM3s: number;
  ventDiameterM: number;
}

export interface ManufacturingEnergyFactors {
  wallKWhPerM2: number;
  floorKWhPerM2: number;
  ceilingKWhPerM2: number;
  windowKWhPerM2: number;
  ductKWhPerM: number;
  ventHardwareKWhEach: number;
  fanKWhPerM3Hour: number;
  geometryComplexityKWh: number;
}

export interface RoomLifecycleOptimizationInput {
  roomName?: string;
  mode?: 'heating' | 'cooling';
  targetTempC?: number;
  outdoorDesignTempC?: number;
  occupants?: number;
  minFloorAreaM2?: number;
  maxFloorAreaM2?: number;
  minWidthM?: number;
  maxWidthM?: number;
  minLengthM?: number;
  maxLengthM?: number;
  minCeilingHeightM?: number;
  maxCeilingHeightM?: number;
  wallRValue?: number;
  ceilingRValue?: number;
  floorRValue?: number;
  windowAreaM2?: number;
  windowUValue?: number;
  airLeakageAch?: number;
  internalGainsW?: number;
  solarGainsW?: number;
  hvacCop?: number;
  maxHvacElectricalW?: number;
  conditioningHoursPerYear?: number;
  lifecycleYears?: number;
  baseline?: Partial<RoomLifecycleDesign>;
  manufacturing?: Partial<ManufacturingEnergyFactors>;
  iterations?: number;
  seed?: number;
}

export interface RoomEnergyBreakdown {
  envelopeLoadW: number;
  outdoorAirLoadW: number;
  internalAndSolarLoadW: number;
  designThermalLoadW: number;
  distributionEffectiveness: number;
  hvacElectricalW: number;
  fanElectricalW: number;
  annualOperationalKWh: number;
  lifecycleOperationalKWh: number;
}

export interface RoomManufacturingBreakdown {
  envelopeKWh: number;
  glazingKWh: number;
  ductAndVentKWh: number;
  fanKWh: number;
  complexityKWh: number;
  totalKWh: number;
  difficultyScore: number;
}

export interface EvaluatedRoomDesign {
  design: RoomLifecycleDesign;
  floorAreaM2: number;
  volumeM3: number;
  airChangesPerHour: number;
  airVelocityMs: number;
  estimatedTemperatureErrorC: number;
  targetAchieved: boolean;
  feasible: boolean;
  operational: RoomEnergyBreakdown;
  manufacturing: RoomManufacturingBreakdown;
  totalLifecycleEnergyKWh: number;
  score: number;
}

export interface RoomLifecycleOptimizationResult {
  roomName: string;
  baseline: EvaluatedRoomDesign;
  best: EvaluatedRoomDesign;
  candidatesEvaluated: number;
  improvement: {
    qualifiesAsImprovement: boolean;
    lifecycleEnergySavedKWh: number;
    lifecycleEnergySavedPercent: number;
    annualOperationalEnergySavedKWh: number;
    manufacturingEnergyDifferenceKWh: number;
    energyPaybackYears: number | null;
    reason: string;
  };
  constraints: {
    minFloorAreaM2: number;
    maxFloorAreaM2: number;
    targetTempC: number;
    toleranceC: number;
    lifecycleYears: number;
  };
  assumptions: string[];
}

const AIR_DENSITY_KG_M3 = 1.204;
const AIR_SPECIFIC_HEAT_J_KGK = 1006;
const COMFORT_TOLERANCE_C = 0.5;
const STANDARD_VENT_DIAMETERS_M = [0.1, 0.125, 0.15, 0.2, 0.25];

const DEFAULT_MANUFACTURING: ManufacturingEnergyFactors = {
  wallKWhPerM2: 22,
  floorKWhPerM2: 34,
  ceilingKWhPerM2: 16,
  windowKWhPerM2: 95,
  ductKWhPerM: 9,
  ventHardwareKWhEach: 42,
  fanKWhPerM3Hour: 0.9,
  geometryComplexityKWh: 180,
};

interface NormalizedInput extends Required<Omit<RoomLifecycleOptimizationInput, 'baseline' | 'manufacturing'>> {
  baseline: RoomLifecycleDesign;
  manufacturing: ManufacturingEnergyFactors;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const round = (value: number, digits = 3) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizePosition(position: Partial<NormalizedVentPosition> | undefined, fallback: NormalizedVentPosition) {
  return {
    x: clamp(Number(position?.x ?? fallback.x), 0.02, 0.98),
    y: clamp(Number(position?.y ?? fallback.y), 0.02, 0.98),
    z: clamp(Number(position?.z ?? fallback.z), 0.02, 0.98),
  };
}

function normalizeInput(input: RoomLifecycleOptimizationInput): NormalizedInput {
  const occupants = clamp(Math.round(Number(input.occupants ?? 2)), 1, 12);
  const minFloorAreaM2 = clamp(Number(input.minFloorAreaM2 ?? Math.max(12, occupants * 7)), 6, 120);
  const maxFloorAreaM2 = clamp(
    Number(input.maxFloorAreaM2 ?? Math.max(minFloorAreaM2 * 1.45, minFloorAreaM2 + 6)),
    minFloorAreaM2,
    180,
  );
  const minWidthM = clamp(Number(input.minWidthM ?? 2.4), 1.8, 12);
  const maxWidthM = clamp(Number(input.maxWidthM ?? 8), minWidthM, 20);
  const minLengthM = clamp(Number(input.minLengthM ?? 2.4), 1.8, 12);
  const maxLengthM = clamp(Number(input.maxLengthM ?? 8), minLengthM, 20);
  const minCeilingHeightM = clamp(Number(input.minCeilingHeightM ?? 2.4), 2.1, 5);
  const maxCeilingHeightM = clamp(Number(input.maxCeilingHeightM ?? 3.2), minCeilingHeightM, 6);

  const defaultWidth = clamp(Math.sqrt(minFloorAreaM2 * 1.35), minWidthM, maxWidthM);
  const defaultLength = clamp(Math.max(minFloorAreaM2 / defaultWidth, minLengthM), minLengthM, maxLengthM);
  const baselineInput = input.baseline || {};
  const baseline: RoomLifecycleDesign = {
    widthM: clamp(Number(baselineInput.widthM ?? defaultWidth), minWidthM, maxWidthM),
    lengthM: clamp(Number(baselineInput.lengthM ?? defaultLength), minLengthM, maxLengthM),
    ceilingHeightM: clamp(Number(baselineInput.ceilingHeightM ?? 2.7), minCeilingHeightM, maxCeilingHeightM),
    strategy: baselineInput.strategy || 'cross',
    intake: normalizePosition(baselineInput.intake, { x: 0.05, y: 0.2, z: 0.15 }),
    exhaust: normalizePosition(baselineInput.exhaust, { x: 0.95, y: 0.8, z: 0.85 }),
    flowRateM3s: clamp(Number(baselineInput.flowRateM3s ?? 0.05), 0.008, 0.45),
    ventDiameterM: STANDARD_VENT_DIAMETERS_M.includes(Number(baselineInput.ventDiameterM))
      ? Number(baselineInput.ventDiameterM)
      : 0.15,
  };

  return {
    roomName: input.roomName || 'Selected room',
    mode: input.mode || 'cooling',
    targetTempC: clamp(Number(input.targetTempC ?? 22), 10, 32),
    outdoorDesignTempC: clamp(Number(input.outdoorDesignTempC ?? 35), -20, 55),
    occupants,
    minFloorAreaM2,
    maxFloorAreaM2,
    minWidthM,
    maxWidthM,
    minLengthM,
    maxLengthM,
    minCeilingHeightM,
    maxCeilingHeightM,
    wallRValue: clamp(Number(input.wallRValue ?? 2.8), 0.4, 12),
    ceilingRValue: clamp(Number(input.ceilingRValue ?? 4.5), 0.5, 16),
    floorRValue: clamp(Number(input.floorRValue ?? 2.2), 0.3, 12),
    windowAreaM2: clamp(Number(input.windowAreaM2 ?? 3), 0, 30),
    windowUValue: clamp(Number(input.windowUValue ?? 1.8), 0.3, 7),
    airLeakageAch: clamp(Number(input.airLeakageAch ?? 0.55), 0.05, 8),
    internalGainsW: clamp(Number(input.internalGainsW ?? occupants * 115 + 150), 0, 5000),
    solarGainsW: clamp(Number(input.solarGainsW ?? 300), 0, 5000),
    hvacCop: clamp(Number(input.hvacCop ?? 3.5), 1, 8),
    maxHvacElectricalW: clamp(Number(input.maxHvacElectricalW ?? 3500), 250, 20000),
    conditioningHoursPerYear: clamp(Number(input.conditioningHoursPerYear ?? 2200), 100, 8760),
    lifecycleYears: clamp(Math.round(Number(input.lifecycleYears ?? 20)), 1, 100),
    iterations: clamp(Math.round(Number(input.iterations ?? 4200)), 300, 20000),
    seed: Math.round(Number(input.seed ?? 12013)),
    baseline,
    manufacturing: { ...DEFAULT_MANUFACTURING, ...(input.manufacturing || {}) },
  };
}

function distributionEffectiveness(design: RoomLifecycleDesign, volumeM3: number) {
  const dx = design.intake.x - design.exhaust.x;
  const dy = design.intake.y - design.exhaust.y;
  const planarSeparation = clamp(Math.sqrt(dx * dx + dy * dy) / Math.sqrt(2), 0, 1);
  const verticalSeparation = Math.abs(design.intake.z - design.exhaust.z);

  let placement = 0.6;
  if (design.strategy === 'cross') {
    placement = 0.58 + planarSeparation * 0.36 - verticalSeparation * 0.08;
  } else if (design.strategy === 'stack') {
    placement = 0.54 + verticalSeparation * 0.35 + planarSeparation * 0.07;
  } else {
    placement = 0.58 + planarSeparation * 0.19 + verticalSeparation * 0.2;
  }

  const ach = design.flowRateM3s * 3600 / Math.max(volumeM3, 1);
  const coverage = clamp(0.76 + Math.min(ach, 4) * 0.055 - Math.max(0, ach - 5) * 0.025, 0.68, 0.98);
  return clamp(placement * coverage, 0.42, 0.96);
}

function manufacturingEnergy(
  design: RoomLifecycleDesign,
  input: NormalizedInput,
  wallAreaM2: number,
  windowAreaM2: number,
  airVelocityMs: number,
): RoomManufacturingBreakdown {
  const floorAreaM2 = design.widthM * design.lengthM;
  const opaqueWallAreaM2 = Math.max(0, wallAreaM2 - windowAreaM2);
  const diagonalM = Math.sqrt(design.widthM ** 2 + design.lengthM ** 2);
  const planarDistance = Math.sqrt(
    ((design.intake.x - design.exhaust.x) * design.widthM) ** 2
    + ((design.intake.y - design.exhaust.y) * design.lengthM) ** 2,
  );
  const verticalDistance = Math.abs(design.intake.z - design.exhaust.z) * design.ceilingHeightM;
  const ductLengthM = Math.max(1, planarDistance + verticalDistance + diagonalM * 0.15);
  const strategyMultiplier = design.strategy === 'cross' ? 1 : design.strategy === 'stack' ? 1.12 : 1.24;
  const aspectRatio = Math.max(design.widthM, design.lengthM) / Math.max(0.1, Math.min(design.widthM, design.lengthM));
  const geometryComplexity = clamp(
    (aspectRatio - 1) / 1.5
      + Math.abs(design.ceilingHeightM - 2.7) / 2
      + (design.strategy === 'mixed' ? 0.28 : design.strategy === 'stack' ? 0.12 : 0)
      + Math.max(0, airVelocityMs - 5) / 10,
    0,
    2,
  );

  const envelopeKWh = opaqueWallAreaM2 * input.manufacturing.wallKWhPerM2
    + floorAreaM2 * input.manufacturing.floorKWhPerM2
    + floorAreaM2 * input.manufacturing.ceilingKWhPerM2;
  const glazingKWh = windowAreaM2 * input.manufacturing.windowKWhPerM2;
  const ductAndVentKWh = (
    ductLengthM * input.manufacturing.ductKWhPerM
    + input.manufacturing.ventHardwareKWhEach * 2
  ) * strategyMultiplier;
  const fanKWh = design.flowRateM3s * 3600 * input.manufacturing.fanKWhPerM3Hour;
  const complexityKWh = geometryComplexity * input.manufacturing.geometryComplexityKWh;
  const totalKWh = envelopeKWh + glazingKWh + ductAndVentKWh + fanKWh + complexityKWh;
  const difficultyScore = clamp(
    18
      + geometryComplexity * 27
      + (design.strategy === 'mixed' ? 18 : design.strategy === 'stack' ? 9 : 0)
      + clamp(ductLengthM / 15, 0, 1) * 18,
    0,
    100,
  );

  return {
    envelopeKWh: round(envelopeKWh, 1),
    glazingKWh: round(glazingKWh, 1),
    ductAndVentKWh: round(ductAndVentKWh, 1),
    fanKWh: round(fanKWh, 1),
    complexityKWh: round(complexityKWh, 1),
    totalKWh: round(totalKWh, 1),
    difficultyScore: round(difficultyScore, 1),
  };
}

export function evaluateRoomLifecycleDesign(
  designInput: RoomLifecycleDesign,
  rawInput: RoomLifecycleOptimizationInput,
): EvaluatedRoomDesign {
  const input = normalizeInput(rawInput);
  const design: RoomLifecycleDesign = {
    ...designInput,
    widthM: Number(designInput.widthM),
    lengthM: Number(designInput.lengthM),
    ceilingHeightM: Number(designInput.ceilingHeightM),
    intake: normalizePosition(designInput.intake, input.baseline.intake),
    exhaust: normalizePosition(designInput.exhaust, input.baseline.exhaust),
    flowRateM3s: clamp(Number(designInput.flowRateM3s), 0.008, 0.45),
    ventDiameterM: Number(designInput.ventDiameterM),
  };
  const floorAreaM2 = design.widthM * design.lengthM;
  const volumeM3 = floorAreaM2 * design.ceilingHeightM;
  const wallAreaM2 = 2 * (design.widthM + design.lengthM) * design.ceilingHeightM;
  const windowAreaM2 = Math.min(input.windowAreaM2, wallAreaM2 * 0.42);
  const opaqueWallAreaM2 = Math.max(0, wallAreaM2 - windowAreaM2);
  const deltaT = Math.abs(input.outdoorDesignTempC - input.targetTempC);
  const envelopeUA = opaqueWallAreaM2 / input.wallRValue
    + floorAreaM2 / input.ceilingRValue
    + floorAreaM2 / input.floorRValue
    + windowAreaM2 * input.windowUValue;
  const envelopeLoadW = envelopeUA * deltaT;

  const leakageM3s = input.airLeakageAch * volumeM3 / 3600;
  const hygieneFreshAirM3s = Math.max(input.occupants * 0.01, volumeM3 * 0.35 / 3600);
  const outdoorAirLoadW = AIR_DENSITY_KG_M3
    * AIR_SPECIFIC_HEAT_J_KGK
    * (leakageM3s + hygieneFreshAirM3s)
    * deltaT;
  const internalAndSolarLoadW = input.internalGainsW + input.solarGainsW;
  const designThermalLoadW = input.mode === 'cooling'
    ? envelopeLoadW + outdoorAirLoadW + internalAndSolarLoadW
    : Math.max(0, envelopeLoadW + outdoorAirLoadW - internalAndSolarLoadW);

  const effectiveness = distributionEffectiveness(design, volumeM3);
  const deliveredThermalLoadW = designThermalLoadW / effectiveness;
  const ventAreaM2 = Math.PI * (design.ventDiameterM / 2) ** 2;
  const airVelocityMs = design.flowRateM3s / Math.max(ventAreaM2, 0.001);
  const diagonalM = Math.sqrt(design.widthM ** 2 + design.lengthM ** 2);
  const pressurePa = 28 + diagonalM * 4.5 + airVelocityMs ** 2 * AIR_DENSITY_KG_M3 * 0.6;
  const fanElectricalW = pressurePa * design.flowRateM3s / 0.58;
  const hvacElectricalW = deliveredThermalLoadW / input.hvacCop;
  const totalElectricalW = hvacElectricalW + fanElectricalW;
  const annualOperationalKWh = totalElectricalW * input.conditioningHoursPerYear / 1000;
  const lifecycleOperationalKWh = annualOperationalKWh * input.lifecycleYears;
  const estimatedTemperatureErrorC = totalElectricalW <= input.maxHvacElectricalW
    ? 0
    : (totalElectricalW - input.maxHvacElectricalW) / Math.max(envelopeUA, 1);
  const targetAchieved = estimatedTemperatureErrorC <= COMFORT_TOLERANCE_C;
  const airChangesPerHour = design.flowRateM3s * 3600 / Math.max(volumeM3, 1);

  const geometryFeasible = Number.isFinite(floorAreaM2)
    && floorAreaM2 >= input.minFloorAreaM2
    && floorAreaM2 <= input.maxFloorAreaM2
    && design.widthM >= input.minWidthM
    && design.widthM <= input.maxWidthM
    && design.lengthM >= input.minLengthM
    && design.lengthM <= input.maxLengthM
    && design.ceilingHeightM >= input.minCeilingHeightM
    && design.ceilingHeightM <= input.maxCeilingHeightM;
  const airflowFeasible = airChangesPerHour >= 0.5 && airChangesPerHour <= 10 && airVelocityMs <= 12;
  const feasible = geometryFeasible && airflowFeasible && targetAchieved;
  const manufacturing = manufacturingEnergy(design, input, wallAreaM2, windowAreaM2, airVelocityMs);
  const totalLifecycleEnergyKWh = lifecycleOperationalKWh + manufacturing.totalKWh;
  const noisePenalty = Math.max(0, airVelocityMs - 5) ** 2 * 500;
  const constraintPenalty = feasible
    ? 0
    : 1_000_000
      + Math.max(0, input.minFloorAreaM2 - floorAreaM2) * 100_000
      + Math.max(0, estimatedTemperatureErrorC - COMFORT_TOLERANCE_C) * 100_000;

  return {
    design: {
      ...design,
      widthM: round(design.widthM),
      lengthM: round(design.lengthM),
      ceilingHeightM: round(design.ceilingHeightM),
      flowRateM3s: round(design.flowRateM3s, 5),
      ventDiameterM: round(design.ventDiameterM, 3),
      intake: { x: round(design.intake.x), y: round(design.intake.y), z: round(design.intake.z) },
      exhaust: { x: round(design.exhaust.x), y: round(design.exhaust.y), z: round(design.exhaust.z) },
    },
    floorAreaM2: round(floorAreaM2, 2),
    volumeM3: round(volumeM3, 2),
    airChangesPerHour: round(airChangesPerHour, 2),
    airVelocityMs: round(airVelocityMs, 2),
    estimatedTemperatureErrorC: round(estimatedTemperatureErrorC, 2),
    targetAchieved,
    feasible,
    operational: {
      envelopeLoadW: round(envelopeLoadW, 1),
      outdoorAirLoadW: round(outdoorAirLoadW, 1),
      internalAndSolarLoadW: round(internalAndSolarLoadW, 1),
      designThermalLoadW: round(designThermalLoadW, 1),
      distributionEffectiveness: round(effectiveness, 3),
      hvacElectricalW: round(hvacElectricalW, 1),
      fanElectricalW: round(fanElectricalW, 1),
      annualOperationalKWh: round(annualOperationalKWh, 1),
      lifecycleOperationalKWh: round(lifecycleOperationalKWh, 1),
    },
    manufacturing,
    totalLifecycleEnergyKWh: round(totalLifecycleEnergyKWh, 1),
    score: round(totalLifecycleEnergyKWh + noisePenalty + constraintPenalty, 1),
  };
}

function randomPosition(rng: () => number, strategy: RoomAirflowStrategy) {
  const side = rng() > 0.5;
  if (strategy === 'cross') {
    const z = lerp(0.25, 0.65, rng());
    return {
      intake: { x: side ? 0.04 : 0.96, y: lerp(0.08, 0.92, rng()), z },
      exhaust: { x: side ? 0.96 : 0.04, y: lerp(0.08, 0.92, rng()), z: clamp(z + lerp(-0.08, 0.08, rng()), 0.08, 0.92) },
    };
  }
  if (strategy === 'stack') {
    return {
      intake: { x: lerp(0.05, 0.4, rng()), y: lerp(0.05, 0.95, rng()), z: lerp(0.03, 0.22, rng()) },
      exhaust: { x: lerp(0.6, 0.95, rng()), y: lerp(0.05, 0.95, rng()), z: lerp(0.78, 0.97, rng()) },
    };
  }
  return {
    intake: { x: side ? 0.04 : 0.96, y: lerp(0.08, 0.92, rng()), z: lerp(0.05, 0.32, rng()) },
    exhaust: { x: side ? 0.96 : 0.04, y: lerp(0.08, 0.92, rng()), z: lerp(0.68, 0.95, rng()) },
  };
}

function randomDesign(input: NormalizedInput, rng: () => number): RoomLifecycleDesign {
  const floorAreaM2 = lerp(input.minFloorAreaM2, input.maxFloorAreaM2, rng() ** 1.8);
  const aspectRatio = lerp(0.68, 1.62, rng());
  let widthM = Math.sqrt(floorAreaM2 * aspectRatio);
  let lengthM = floorAreaM2 / widthM;
  widthM = clamp(widthM, input.minWidthM, input.maxWidthM);
  lengthM = clamp(lengthM, input.minLengthM, input.maxLengthM);
  const strategies: RoomAirflowStrategy[] = ['cross', 'stack', 'mixed'];
  const strategy = strategies[Math.floor(rng() * strategies.length)];
  const positions = randomPosition(rng, strategy);
  const ceilingHeightM = lerp(input.minCeilingHeightM, input.maxCeilingHeightM, rng() ** 1.7);
  const volumeM3 = widthM * lengthM * ceilingHeightM;
  const minFlow = Math.max(0.01, volumeM3 * 0.75 / 3600, input.occupants * 0.006);
  const maxFlow = Math.max(minFlow, Math.min(0.35, volumeM3 * 6 / 3600));

  return {
    widthM,
    lengthM,
    ceilingHeightM,
    strategy,
    intake: positions.intake,
    exhaust: positions.exhaust,
    flowRateM3s: lerp(minFlow, maxFlow, rng()),
    ventDiameterM: STANDARD_VENT_DIAMETERS_M[Math.floor(rng() * STANDARD_VENT_DIAMETERS_M.length)],
  };
}

function mutateDesign(best: RoomLifecycleDesign, input: NormalizedInput, rng: () => number): RoomLifecycleDesign {
  const strategy = rng() < 0.1
    ? (['cross', 'stack', 'mixed'] as RoomAirflowStrategy[])[Math.floor(rng() * 3)]
    : best.strategy;
  const positions = strategy === best.strategy
    ? {
        intake: {
          x: clamp(best.intake.x + lerp(-0.08, 0.08, rng()), 0.02, 0.98),
          y: clamp(best.intake.y + lerp(-0.08, 0.08, rng()), 0.02, 0.98),
          z: clamp(best.intake.z + lerp(-0.08, 0.08, rng()), 0.02, 0.98),
        },
        exhaust: {
          x: clamp(best.exhaust.x + lerp(-0.08, 0.08, rng()), 0.02, 0.98),
          y: clamp(best.exhaust.y + lerp(-0.08, 0.08, rng()), 0.02, 0.98),
          z: clamp(best.exhaust.z + lerp(-0.08, 0.08, rng()), 0.02, 0.98),
        },
      }
    : randomPosition(rng, strategy);

  return {
    widthM: clamp(best.widthM * lerp(0.92, 1.08, rng()), input.minWidthM, input.maxWidthM),
    lengthM: clamp(best.lengthM * lerp(0.92, 1.08, rng()), input.minLengthM, input.maxLengthM),
    ceilingHeightM: clamp(best.ceilingHeightM * lerp(0.96, 1.04, rng()), input.minCeilingHeightM, input.maxCeilingHeightM),
    strategy,
    intake: positions.intake,
    exhaust: positions.exhaust,
    flowRateM3s: clamp(best.flowRateM3s * lerp(0.82, 1.18, rng()), 0.008, 0.45),
    ventDiameterM: rng() < 0.2
      ? STANDARD_VENT_DIAMETERS_M[Math.floor(rng() * STANDARD_VENT_DIAMETERS_M.length)]
      : best.ventDiameterM,
  };
}

export function optimizeRoomLifecycle(rawInput: RoomLifecycleOptimizationInput = {}): RoomLifecycleOptimizationResult {
  const input = normalizeInput(rawInput);
  const rng = seededRandom(input.seed);
  const baseline = evaluateRoomLifecycleDesign(input.baseline, input);
  let best = baseline.feasible ? baseline : null;
  let candidatesEvaluated = 1;

  for (let i = 0; i < input.iterations; i++) {
    const evaluated = evaluateRoomLifecycleDesign(randomDesign(input, rng), input);
    candidatesEvaluated++;
    if (evaluated.feasible && (!best || evaluated.score < best.score)) best = evaluated;
  }

  if (!best) best = baseline;
  const refinementIterations = Math.max(300, Math.round(input.iterations * 0.3));
  for (let i = 0; i < refinementIterations; i++) {
    const evaluated = evaluateRoomLifecycleDesign(mutateDesign(best.design, input, rng), input);
    candidatesEvaluated++;
    if (evaluated.feasible && evaluated.score < best.score) best = evaluated;
  }

  const lifecycleEnergySavedKWh = baseline.totalLifecycleEnergyKWh - best.totalLifecycleEnergyKWh;
  const annualOperationalEnergySavedKWh = baseline.operational.annualOperationalKWh
    - best.operational.annualOperationalKWh;
  const manufacturingEnergyDifferenceKWh = best.manufacturing.totalKWh - baseline.manufacturing.totalKWh;
  const qualifiesAsImprovement = best.feasible
    && best.targetAchieved
    && lifecycleEnergySavedKWh > Math.max(1, baseline.totalLifecycleEnergyKWh * 0.001);
  const energyPaybackYears = manufacturingEnergyDifferenceKWh > 0 && annualOperationalEnergySavedKWh > 0
    ? manufacturingEnergyDifferenceKWh / annualOperationalEnergySavedKWh
    : manufacturingEnergyDifferenceKWh <= 0 && lifecycleEnergySavedKWh > 0
      ? 0
      : null;
  const reason = qualifiesAsImprovement
    ? `Accepted: saves ${round(lifecycleEnergySavedKWh, 1).toLocaleString()} kWh over ${input.lifecycleYears} years after manufacturing energy is included.`
    : best.targetAchieved
      ? 'Rejected: the operational saving does not repay the manufacturing and complexity energy within the selected lifecycle.'
      : `Rejected: the design cannot maintain the target within ±${COMFORT_TOLERANCE_C}°C at the design condition.`;

  return {
    roomName: input.roomName,
    baseline,
    best,
    candidatesEvaluated,
    improvement: {
      qualifiesAsImprovement,
      lifecycleEnergySavedKWh: round(lifecycleEnergySavedKWh, 1),
      lifecycleEnergySavedPercent: round(
        baseline.totalLifecycleEnergyKWh > 0 ? lifecycleEnergySavedKWh / baseline.totalLifecycleEnergyKWh * 100 : 0,
        1,
      ),
      annualOperationalEnergySavedKWh: round(annualOperationalEnergySavedKWh, 1),
      manufacturingEnergyDifferenceKWh: round(manufacturingEnergyDifferenceKWh, 1),
      energyPaybackYears: energyPaybackYears === null ? null : round(energyPaybackYears, 2),
      reason,
    },
    constraints: {
      minFloorAreaM2: input.minFloorAreaM2,
      maxFloorAreaM2: input.maxFloorAreaM2,
      targetTempC: input.targetTempC,
      toleranceC: COMFORT_TOLERANCE_C,
      lifecycleYears: input.lifecycleYears,
    },
    assumptions: [
      'The minimum usable floor area is a hard constraint; without it, the lowest-energy room would trivially be the smallest possible room.',
      'Operational energy combines envelope, outdoor-air, HVAC distribution and fan energy at the selected design condition.',
      'Manufacturing energy includes envelope area, glazing, ducts, two vent terminals, fan capacity and a geometry/installation complexity allowance.',
      'This is a comparative early-design model, not a building permit, NCC compliance certificate or mechanical-engineering sign-off.',
    ],
  };
}

