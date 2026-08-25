import { inferHouseAirflowNetwork, type AirflowNetworkRoom } from './house_airflow_network';
import { SITE_LOCATION_PRESETS, type SiteLocationProfile } from './site_geometry_optimizer';

export type DwellingArchetype = 'detached' | 'terrace_mid' | 'lowrise_apartment_mid' | 'tower_apartment_mid';
export type AirflowControlStrategy = 'balanced_rooms' | 'transfer_to_wet_rooms' | 'demand_zoned';

export type WholeHouseRoomInput = AirflowNetworkRoom & {
  targetTemp?: number;
  internalLoad?: number;
};

export interface WholeHouseOptimizerInput {
  rooms?: WholeHouseRoomInput[];
  location?: Partial<SiteLocationProfile>;
  targetTempC?: number;
  lifecycleYears?: number;
  hvacCop?: number;
  maximumCandidates?: number;
  siteObstruction?: {
    summerShadePotentialPercent: number;
    winterSolarAccessPercent: number;
    confidencePercent?: number;
    source?: string;
  };
}

export interface DwellingArchetypeProfile {
  id: DwellingArchetype;
  label: string;
  description: string;
  exposedEnvelopeFraction: number;
  sharedConditionedBoundaryPercent: number;
  summerNeighbourShadePercent: number;
  winterSolarAccessPercent: number;
  riserHeightM: number;
  buildingEmbodiedKWhPerM2: number;
}

export interface WholeHouseConfiguration {
  archetype: DwellingArchetype;
  control: AirflowControlStrategy;
  transferOpeningAreaCm2: number;
  mainDuctDiameterMm: number;
  fanStaticPressurePa: number;
  heatRecoveryEfficiency: number;
  designAirChangesPerHour: number;
}

export interface WholeHouseRoomResult {
  roomId: string;
  roomName: string;
  pressurePa: number;
  supplyLs: number;
  exhaustLs: number;
  transferInLs: number;
  achievedAirChangesPerHour: number;
  predictedTemperatureDeviationC: number;
  massBalanceResidualLs: number;
}

export interface WholeHouseFlowEdge {
  id: string;
  fromRoomId: string;
  toRoomId: string | 'outdoor';
  flowLs: number;
  kind: 'shared-cavity' | 'envelope-leakage';
  openingAreaCm2: number;
}

export interface EvaluatedWholeHouseConfiguration {
  configuration: WholeHouseConfiguration;
  rooms: WholeHouseRoomResult[];
  flows: WholeHouseFlowEdge[];
  annual: {
    envelopeElectricalKWh: number;
    ventilationElectricalKWh: number;
    fanElectricalKWh: number;
    solarShadeCoolingCreditKWh: number;
    winterSolarPenaltyKWh: number;
    totalOperationalKWh: number;
  };
  manufacturing: {
    buildingKWh: number;
    ductAndOpeningsKWh: number;
    controlsAndHeatRecoveryKWh: number;
    totalKWh: number;
    difficultyScore: number;
  };
  performance: {
    meanComfortDeviationC: number;
    maximumMassBalanceResidualLs: number;
    maximumVentVelocityMs: number;
    estimatedNoiseDbA: number;
    sharedTransferFlowLs: number;
  };
  totalLifecycleEnergyKWh: number;
  score: number;
}

export interface ArchetypeComparison {
  archetype: DwellingArchetype;
  label: string;
  sharedConditionedBoundaryPercent: number;
  summerNeighbourShadePercent: number;
  winterSolarAccessPercent: number;
  annualOperationalKWh: number;
  lifecycleEnergyKWh: number;
  annualEnergyVsDetachedPercent: number;
  lifecycleEnergyVsDetachedPercent: number;
  tradeoff: string;
}

export interface WholeHouseOptimizationResult {
  location: SiteLocationProfile;
  candidatesEvaluated: number;
  baseline: EvaluatedWholeHouseConfiguration;
  best: EvaluatedWholeHouseConfiguration;
  ranked: EvaluatedWholeHouseConfiguration[];
  archetypeComparisons: ArchetypeComparison[];
  solarContext: {
    source: string;
    summerShadePotentialPercent: number;
    winterSolarAccessPercent: number;
    confidencePercent: number;
  };
  improvement: {
    qualifiesAsImprovement: boolean;
    annualOperationalEnergySavedKWh: number;
    lifecycleEnergySavedKWh: number;
    lifecycleEnergySavedPercent: number;
    manufacturingEnergyDifferenceKWh: number;
    reason: string;
  };
  assumptions: string[];
}

export const DWELLING_ARCHETYPES: Record<DwellingArchetype, DwellingArchetypeProfile> = {
  detached: {
    id: 'detached', label: 'Detached house',
    description: 'All sides, roof and floor are substantially exposed; maximum solar control freedom.',
    exposedEnvelopeFraction: 1, sharedConditionedBoundaryPercent: 0,
    summerNeighbourShadePercent: 4, winterSolarAccessPercent: 96,
    riserHeightM: 2.8, buildingEmbodiedKWhPerM2: 405,
  },
  terrace_mid: {
    id: 'terrace_mid', label: 'Mid-row / terrace',
    description: 'Two party walls reduce heat transfer while front and rear retain useful daylight.',
    exposedEnvelopeFraction: 0.68, sharedConditionedBoundaryPercent: 32,
    summerNeighbourShadePercent: 14, winterSolarAccessPercent: 86,
    riserHeightM: 5.6, buildingEmbodiedKWhPerM2: 350,
  },
  lowrise_apartment_mid: {
    id: 'lowrise_apartment_mid', label: 'Low-rise middle apartment',
    description: 'Conditioned dwellings above, below and beside it strongly reduce envelope losses.',
    exposedEnvelopeFraction: 0.42, sharedConditionedBoundaryPercent: 58,
    summerNeighbourShadePercent: 27, winterSolarAccessPercent: 73,
    riserHeightM: 12, buildingEmbodiedKWhPerM2: 315,
  },
  tower_apartment_mid: {
    id: 'tower_apartment_mid', label: 'Tower middle apartment',
    description: 'High shared-envelope benefit and large precinct shadows, offset by riser fan pressure and lower winter solar access.',
    exposedEnvelopeFraction: 0.36, sharedConditionedBoundaryPercent: 64,
    summerNeighbourShadePercent: 39, winterSolarAccessPercent: 61,
    riserHeightM: 36, buildingEmbodiedKWhPerM2: 365,
  },
};

const round = (value: number, digits = 2) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const wetRoom = (room: WholeHouseRoomInput) => /bath|kitchen|laundry|toilet|wc|service/i.test(room.name);

const normalizeRooms = (rooms: WholeHouseRoomInput[] | undefined): WholeHouseRoomInput[] => {
  const valid = (rooms || []).filter(room => room.width > 0 && room.height > 0 && room.ceilingHeight > 0);
  if (valid.length) return valid;
  return [
    { id: 'living', name: 'Living', x: 0, y: 0, width: 5.4, height: 4.5, ceilingHeight: 2.7, targetTemp: 22, internalLoad: 700 },
    { id: 'kitchen', name: 'Kitchen', x: 5.4, y: 0, width: 3.2, height: 4.5, ceilingHeight: 2.7, targetTemp: 22, internalLoad: 1000 },
    { id: 'bedroom', name: 'Bedroom', x: 0, y: 4.5, width: 4.2, height: 3.8, ceilingHeight: 2.7, targetTemp: 21, internalLoad: 260 },
    { id: 'bathroom', name: 'Bathroom', x: 4.2, y: 4.5, width: 2.4, height: 3.8, ceilingHeight: 2.7, targetTemp: 23, internalLoad: 420 },
    { id: 'study', name: 'Study', x: 6.6, y: 4.5, width: 2, height: 3.8, ceilingHeight: 2.7, targetTemp: 22, internalLoad: 380 },
  ];
};

const normalizeLocation = (value?: Partial<SiteLocationProfile>): SiteLocationProfile => ({
  ...SITE_LOCATION_PRESETS.bendigo,
  ...(value || {}),
});

type SolverEdge = { id: string; a: number; b: number | -1; conductance: number; openingAreaCm2: number; kind: WholeHouseFlowEdge['kind'] };

function solvePressureNetwork(
  rooms: WholeHouseRoomInput[],
  configuration: WholeHouseConfiguration,
  supplyM3s: number[],
  exhaustM3s: number[],
  archetype: DwellingArchetypeProfile,
) {
  const inferred = inferHouseAirflowNetwork(rooms);
  const indexById = new Map(rooms.map((room, index) => [room.id, index]));
  const edges: SolverEdge[] = inferred.cavities.map((cavity, index) => ({
    id: cavity.id,
    a: indexById.get(cavity.roomAId) ?? 0,
    b: indexById.get(cavity.roomBId) ?? 0,
    conductance: (configuration.transferOpeningAreaCm2 / 10_000) * 0.82 * (0.82 + Math.min(1.2, cavity.lengthM) * 0.15),
    openingAreaCm2: configuration.transferOpeningAreaCm2,
    kind: 'shared-cavity',
  }));

  rooms.forEach((room, index) => {
    const volume = room.width * room.height * room.ceilingHeight;
    const leakageAt4Pa = volume * (0.22 + archetype.exposedEnvelopeFraction * 0.38) / 3600;
    edges.push({
      id: `${room.id}-outdoor`, a: index, b: -1,
      conductance: leakageAt4Pa / 4,
      openingAreaCm2: round(leakageAt4Pa * 10_000 / 0.65, 0),
      kind: 'envelope-leakage',
    });
  });

  const source = rooms.map((_, index) => supplyM3s[index] - exhaustM3s[index]);
  const pressure = rooms.map(() => 0);
  for (let iteration = 0; iteration < 180; iteration += 1) {
    rooms.forEach((_, roomIndex) => {
      let numerator = source[roomIndex];
      let denominator = 0;
      edges.forEach(edge => {
        if (edge.a === roomIndex) {
          denominator += edge.conductance;
          if (edge.b >= 0) numerator += edge.conductance * pressure[edge.b];
        } else if (edge.b === roomIndex) {
          denominator += edge.conductance;
          numerator += edge.conductance * pressure[edge.a];
        }
      });
      const solved = denominator > 0 ? numerator / denominator : 0;
      pressure[roomIndex] = pressure[roomIndex] * 0.35 + solved * 0.65;
    });
  }

  const roomOutflow = rooms.map(() => 0);
  const roomInflow = rooms.map(() => 0);
  const flows: WholeHouseFlowEdge[] = edges.map(edge => {
    const signed = edge.conductance * (pressure[edge.a] - (edge.b >= 0 ? pressure[edge.b] : 0));
    if (signed >= 0) {
      roomOutflow[edge.a] += signed;
      if (edge.b >= 0) roomInflow[edge.b] += signed;
    } else {
      roomInflow[edge.a] += -signed;
      if (edge.b >= 0) roomOutflow[edge.b] += -signed;
    }
    return {
      id: edge.id,
      fromRoomId: signed >= 0 ? rooms[edge.a].id : (edge.b >= 0 ? rooms[edge.b].id : rooms[edge.a].id),
      toRoomId: signed >= 0 ? (edge.b >= 0 ? rooms[edge.b].id : 'outdoor') : rooms[edge.a].id,
      flowLs: round(Math.abs(signed) * 1000, 2),
      kind: edge.kind,
      openingAreaCm2: edge.openingAreaCm2,
    };
  });

  const residualM3s = rooms.map((_, index) => source[index] + roomInflow[index] - roomOutflow[index]);
  return { pressure, flows, roomInflow, residualM3s };
}

function evaluateConfiguration(
  rooms: WholeHouseRoomInput[],
  location: SiteLocationProfile,
  configuration: WholeHouseConfiguration,
  lifecycleYears: number,
  hvacCop: number,
  targetTempC: number,
  siteObstruction: WholeHouseOptimizerInput['siteObstruction'],
): EvaluatedWholeHouseConfiguration {
  const archetype = DWELLING_ARCHETYPES[configuration.archetype];
  const volumes = rooms.map(room => room.width * room.height * room.ceilingHeight);
  const totalVolume = volumes.reduce((sum, value) => sum + value, 0);
  const floorAreaM2 = rooms.reduce((sum, room) => sum + room.width * room.height, 0);
  const totalFlowM3s = totalVolume * configuration.designAirChangesPerHour / 3600;
  const supply = rooms.map(() => 0);
  const exhaust = rooms.map(() => 0);
  const habitable = rooms.map((room, index) => ({ room, index })).filter(item => !wetRoom(item.room));
  const wet = rooms.map((room, index) => ({ room, index })).filter(item => wetRoom(item.room));
  const safeWet = wet.length ? wet : rooms.map((room, index) => ({ room, index }));
  const safeHabitable = habitable.length ? habitable : rooms.map((room, index) => ({ room, index }));

  if (configuration.control === 'transfer_to_wet_rooms') {
    const supplyVolume = safeHabitable.reduce((sum, item) => sum + volumes[item.index], 0) || 1;
    const exhaustWeight = safeWet.reduce((sum, item) => sum + Math.max(1, item.room.internalLoad || 250), 0) || 1;
    safeHabitable.forEach(item => { supply[item.index] = totalFlowM3s * volumes[item.index] / supplyVolume; });
    safeWet.forEach(item => { exhaust[item.index] = totalFlowM3s * Math.max(1, item.room.internalLoad || 250) / exhaustWeight; });
  } else if (configuration.control === 'demand_zoned') {
    const weights = rooms.map(room => Math.max(80, room.internalLoad || room.width * room.height * 22));
    const totalWeight = weights.reduce((sum, value) => sum + value, 0) || 1;
    rooms.forEach((room, index) => {
      supply[index] = totalFlowM3s * weights[index] / totalWeight;
      const exhaustBias = wetRoom(room) ? 1.28 : 0.9;
      exhaust[index] = totalFlowM3s * weights[index] / totalWeight * exhaustBias;
    });
    const rawExhaust = exhaust.reduce((sum, value) => sum + value, 0) || 1;
    exhaust.forEach((value, index) => { exhaust[index] = value * totalFlowM3s / rawExhaust; });
  } else {
    rooms.forEach((_, index) => {
      supply[index] = totalFlowM3s * volumes[index] / totalVolume;
      exhaust[index] = supply[index];
    });
  }

  const network = solvePressureNetwork(rooms, configuration, supply, exhaust, archetype);
  const roomResults: WholeHouseRoomResult[] = rooms.map((room, index) => {
    const totalFreshAndTransfer = supply[index] + network.roomInflow[index];
    const achievedAch = totalFreshAndTransfer * 3600 / volumes[index];
    const envelopeLoadFactor = archetype.exposedEnvelopeFraction * (location.coolingDegreeDays + location.heatingDegreeDays) / 2100;
    const internalLoadFactor = Math.max(0, (room.internalLoad || room.width * room.height * 24) - 250) / 900;
    const ventilationDeficit = Math.max(0, 0.45 - achievedAch);
    const predictedDeviation = clamp(ventilationDeficit * 2.2 + envelopeLoadFactor * 0.32 + internalLoadFactor * 0.18, 0.05, 3.5);
    return {
      roomId: room.id,
      roomName: room.name,
      pressurePa: round(network.pressure[index], 3),
      supplyLs: round(supply[index] * 1000, 2),
      exhaustLs: round(exhaust[index] * 1000, 2),
      transferInLs: round(network.roomInflow[index] * 1000, 2),
      achievedAirChangesPerHour: round(achievedAch, 2),
      predictedTemperatureDeviationC: round(predictedDeviation, 2),
      massBalanceResidualLs: round(network.residualM3s[index] * 1000, 4),
    };
  });

  const degreeDays = location.heatingDegreeDays + location.coolingDegreeDays;
  const envelopeUaWPerK = floorAreaM2 * (0.42 + archetype.exposedEnvelopeFraction * 1.28);
  const envelopeElectricalKWh = envelopeUaWPerK * degreeDays * 24 / 1000 / hvacCop;
  const ventilationUaWPerK = 1.204 * 1006 * totalFlowM3s * (1 - configuration.heatRecoveryEfficiency);
  const ventilationElectricalKWh = ventilationUaWPerK * degreeDays * 24 / 1000 / hvacCop;
  const riserPressurePa = Math.max(0, archetype.riserHeightM - 3) * 0.7;
  const fanPowerW = totalFlowM3s * (configuration.fanStaticPressurePa + riserPressurePa) / 0.58;
  const fanElectricalKWh = fanPowerW * 16 * 365 / 1000;
  const solarPotentialKWh = floorAreaM2 * location.averageDailySolarMJm2 / 3.6 * 365 * 0.105;
  const climateTotal = Math.max(1, degreeDays);
  const siteSummerShade = clamp(Number(siteObstruction?.summerShadePotentialPercent) || 0, 0, 90);
  const siteWinterAccess = clamp(Number(siteObstruction?.winterSolarAccessPercent) || 100, 5, 100);
  const effectiveSummerShadePercent = 100 - (100 - archetype.summerNeighbourShadePercent) * (100 - siteSummerShade) / 100;
  const effectiveWinterSolarAccessPercent = archetype.winterSolarAccessPercent * siteWinterAccess / 100;
  const solarShadeCoolingCreditKWh = solarPotentialKWh * (location.coolingDegreeDays / climateTotal)
    * effectiveSummerShadePercent / 100 / hvacCop;
  const winterSolarPenaltyKWh = solarPotentialKWh * (location.heatingDegreeDays / climateTotal)
    * (1 - effectiveWinterSolarAccessPercent / 100) / hvacCop;
  const totalOperationalKWh = Math.max(0, envelopeElectricalKWh + ventilationElectricalKWh + fanElectricalKWh
    - solarShadeCoolingCreditKWh + winterSolarPenaltyKWh);

  const inferred = inferHouseAirflowNetwork(rooms);
  const sharedDuctLengthM = inferred.cavities.reduce((sum, cavity) => sum + cavity.lengthM * 0.45, 0);
  const directDuctLengthM = rooms.length * 2.2 + archetype.riserHeightM * 0.18;
  const ductLengthM = configuration.control === 'balanced_rooms' ? directDuctLengthM : directDuctLengthM * 0.62 + sharedDuctLengthM;
  const ductSurfaceM2 = Math.PI * configuration.mainDuctDiameterMm / 1000 * ductLengthM;
  const ductAndOpeningsKWh = ductSurfaceM2 * 34 + inferred.cavities.length * configuration.transferOpeningAreaCm2 / 180 * 7;
  const controlsAndHeatRecoveryKWh = 380 + configuration.heatRecoveryEfficiency * 420
    + (configuration.control === 'demand_zoned' ? rooms.length * 32 : 45);
  const buildingKWh = floorAreaM2 * archetype.buildingEmbodiedKWhPerM2;
  const manufacturingTotalKWh = buildingKWh + ductAndOpeningsKWh + controlsAndHeatRecoveryKWh;
  const difficultyScore = clamp(2.2 + rooms.length * 0.22 + ductLengthM * 0.08
    + (configuration.control === 'demand_zoned' ? 1.4 : 0)
    + archetype.riserHeightM / 24, 1, 10);
  const ductAreaM2 = Math.PI * (configuration.mainDuctDiameterMm / 1000) ** 2 / 4;
  const maximumVentVelocityMs = totalFlowM3s / Math.max(1, safeHabitable.length) / Math.max(0.001, ductAreaM2);
  const estimatedNoiseDbA = 24 + Math.max(0, 20 * Math.log10(Math.max(0.7, maximumVentVelocityMs) / 0.7))
    + configuration.fanStaticPressurePa / 95;
  const meanComfortDeviationC = roomResults.reduce((sum, room) => sum + room.predictedTemperatureDeviationC, 0) / roomResults.length;
  const maximumMassBalanceResidualLs = Math.max(...roomResults.map(room => Math.abs(room.massBalanceResidualLs)), 0);
  const sharedTransferFlowLs = network.flows.filter(flow => flow.kind === 'shared-cavity').reduce((sum, flow) => sum + flow.flowLs, 0);
  const totalLifecycleEnergyKWh = totalOperationalKWh * lifecycleYears + manufacturingTotalKWh;
  const penalty = meanComfortDeviationC * floorAreaM2 * lifecycleYears * 75
    + Math.max(0, estimatedNoiseDbA - 36) * lifecycleYears * 90
    + maximumMassBalanceResidualLs * 10_000;

  return {
    configuration,
    rooms: roomResults,
    flows: network.flows,
    annual: {
      envelopeElectricalKWh: round(envelopeElectricalKWh),
      ventilationElectricalKWh: round(ventilationElectricalKWh),
      fanElectricalKWh: round(fanElectricalKWh),
      solarShadeCoolingCreditKWh: round(solarShadeCoolingCreditKWh),
      winterSolarPenaltyKWh: round(winterSolarPenaltyKWh),
      totalOperationalKWh: round(totalOperationalKWh),
    },
    manufacturing: {
      buildingKWh: round(buildingKWh),
      ductAndOpeningsKWh: round(ductAndOpeningsKWh),
      controlsAndHeatRecoveryKWh: round(controlsAndHeatRecoveryKWh),
      totalKWh: round(manufacturingTotalKWh),
      difficultyScore: round(difficultyScore, 1),
    },
    performance: {
      meanComfortDeviationC: round(meanComfortDeviationC, 2),
      maximumMassBalanceResidualLs: round(maximumMassBalanceResidualLs, 4),
      maximumVentVelocityMs: round(maximumVentVelocityMs, 2),
      estimatedNoiseDbA: round(estimatedNoiseDbA, 1),
      sharedTransferFlowLs: round(sharedTransferFlowLs, 1),
    },
    totalLifecycleEnergyKWh: round(totalLifecycleEnergyKWh),
    score: round(totalLifecycleEnergyKWh + penalty),
  };
}

export function optimizeWholeHouseSystem(rawInput: WholeHouseOptimizerInput = {}): WholeHouseOptimizationResult {
  const rooms = normalizeRooms(rawInput.rooms);
  const location = normalizeLocation(rawInput.location);
  const lifecycleYears = clamp(Number(rawInput.lifecycleYears) || 30, 5, 100);
  const hvacCop = clamp(Number(rawInput.hvacCop) || 3.6, 1, 8);
  const targetTempC = clamp(Number(rawInput.targetTempC) || 22, 15, 30);
  const maximumCandidates = clamp(Math.round(Number(rawInput.maximumCandidates) || 432), 48, 1200);
  const configurations: WholeHouseConfiguration[] = [];
  const archetypes = Object.keys(DWELLING_ARCHETYPES) as DwellingArchetype[];
  const controls: AirflowControlStrategy[] = ['balanced_rooms', 'transfer_to_wet_rooms', 'demand_zoned'];
  const openings = [120, 220, 360];
  const diameters = [125, 160, 200];
  const pressures = [90, 155];
  const recovery = [0.68, 0.84];
  outer: for (const archetype of archetypes) for (const control of controls) for (const opening of openings)
    for (const diameter of diameters) for (const pressure of pressures) for (const hrv of recovery) {
      configurations.push({
        archetype,
        control,
        transferOpeningAreaCm2: opening,
        mainDuctDiameterMm: diameter,
        fanStaticPressurePa: pressure,
        heatRecoveryEfficiency: hrv,
        designAirChangesPerHour: control === 'transfer_to_wet_rooms' ? 0.62 : control === 'demand_zoned' ? 0.54 : 0.58,
      });
      if (configurations.length >= maximumCandidates) break outer;
    }

  const baselineConfiguration: WholeHouseConfiguration = {
    archetype: 'detached', control: 'balanced_rooms', transferOpeningAreaCm2: 120,
    mainDuctDiameterMm: 125, fanStaticPressurePa: 180, heatRecoveryEfficiency: 0.5,
    designAirChangesPerHour: 0.7,
  };
  const siteObstruction = rawInput.siteObstruction;
  const baseline = evaluateConfiguration(rooms, location, baselineConfiguration, lifecycleYears, hvacCop, targetTempC, siteObstruction);
  const evaluated = configurations.map(configuration => evaluateConfiguration(
    rooms, location, configuration, lifecycleYears, hvacCop, targetTempC, siteObstruction,
  )).sort((a, b) => a.score - b.score || a.totalLifecycleEnergyKWh - b.totalLifecycleEnergyKWh);
  const best = evaluated[0] || baseline;
  const bestByArchetype = new Map<DwellingArchetype, EvaluatedWholeHouseConfiguration>();
  evaluated.forEach(candidate => {
    const current = bestByArchetype.get(candidate.configuration.archetype);
    if (!current || candidate.score < current.score) bestByArchetype.set(candidate.configuration.archetype, candidate);
  });
  const detached = bestByArchetype.get('detached') || baseline;
  const archetypeComparisons = archetypes.map(archetypeId => {
    const candidate = bestByArchetype.get(archetypeId) || baseline;
    const profile = DWELLING_ARCHETYPES[archetypeId];
    const annualDelta = (detached.annual.totalOperationalKWh - candidate.annual.totalOperationalKWh)
      / Math.max(1, detached.annual.totalOperationalKWh) * 100;
    const lifecycleDelta = (detached.totalLifecycleEnergyKWh - candidate.totalLifecycleEnergyKWh)
      / Math.max(1, detached.totalLifecycleEnergyKWh) * 100;
    const tradeoff = archetypeId === 'tower_apartment_mid'
      ? 'Strong insulation and summer precinct shade; higher riser pressure and reduced winter sun are included.'
      : archetypeId === 'lowrise_apartment_mid'
        ? 'Best shared-envelope efficiency without a tall mechanical riser.'
        : archetypeId === 'terrace_mid'
          ? 'Moderate party-wall benefit while retaining more direct winter sun.'
          : 'Reference case with the most exposed envelope and the most orientation freedom.';
    return {
      archetype: archetypeId,
      label: profile.label,
      sharedConditionedBoundaryPercent: profile.sharedConditionedBoundaryPercent,
      summerNeighbourShadePercent: round(100 - (100 - profile.summerNeighbourShadePercent)
        * (100 - clamp(Number(siteObstruction?.summerShadePotentialPercent) || 0, 0, 90)) / 100, 1),
      winterSolarAccessPercent: round(profile.winterSolarAccessPercent
        * clamp(Number(siteObstruction?.winterSolarAccessPercent) || 100, 5, 100) / 100, 1),
      annualOperationalKWh: candidate.annual.totalOperationalKWh,
      lifecycleEnergyKWh: candidate.totalLifecycleEnergyKWh,
      annualEnergyVsDetachedPercent: round(annualDelta, 1),
      lifecycleEnergyVsDetachedPercent: round(lifecycleDelta, 1),
      tradeoff,
    };
  });
  const annualSaved = baseline.annual.totalOperationalKWh - best.annual.totalOperationalKWh;
  const lifecycleSaved = baseline.totalLifecycleEnergyKWh - best.totalLifecycleEnergyKWh;
  const manufacturingDifference = best.manufacturing.totalKWh - baseline.manufacturing.totalKWh;
  const qualifies = lifecycleSaved > 0 && best.performance.meanComfortDeviationC <= 1.2
    && best.performance.maximumMassBalanceResidualLs < 0.1;

  return {
    location,
    candidatesEvaluated: evaluated.length,
    baseline,
    best,
    ranked: evaluated.slice(0, 12),
    archetypeComparisons,
    solarContext: {
      source: siteObstruction?.source || 'archetype_only',
      summerShadePotentialPercent: round(clamp(Number(siteObstruction?.summerShadePotentialPercent) || 0, 0, 90), 1),
      winterSolarAccessPercent: round(clamp(Number(siteObstruction?.winterSolarAccessPercent) || 100, 5, 100), 1),
      confidencePercent: round(clamp(Number(siteObstruction?.confidencePercent) || 0, 0, 100), 0),
    },
    improvement: {
      qualifiesAsImprovement: qualifies,
      annualOperationalEnergySavedKWh: round(annualSaved),
      lifecycleEnergySavedKWh: round(lifecycleSaved),
      lifecycleEnergySavedPercent: round(lifecycleSaved / Math.max(1, baseline.totalLifecycleEnergyKWh) * 100, 1),
      manufacturingEnergyDifferenceKWh: round(manufacturingDifference),
      reason: qualifies
        ? `${DWELLING_ARCHETYPES[best.configuration.archetype].label} with ${best.configuration.control.replaceAll('_', ' ')} has the lowest screened lifecycle energy after airflow balance, comfort, fan, shading and manufacturing penalties.`
        : 'No candidate clears both the lifecycle-energy and comfort/mass-balance gates; keep the baseline until inputs are verified.',
    },
    assumptions: [
      'This is a reduced-order screening model, not certified CFD, daylight, structural or code-compliance analysis.',
      'Room pressures use a steady linear conductance network. Final grilles, doors, shafts and fire/smoke dampers require an engineer.',
      'Apartment party walls, floors and ceilings are treated as conditioned boundaries; edge units and vacant neighbours will perform differently.',
      siteObstruction
        ? 'Neighbouring-building shade is adjusted with a cached massing horizon screen; the 3D sun view casts the selected hour through those footprint-derived masses.'
        : 'Neighbouring-building shade is an archetype estimate. The 3D sun view uses the selected latitude and the optimized local footprint for directional shadow testing.',
      'Manufacturing energy includes a per-dwelling structure allowance plus ducts, openings, controls and heat recovery so operational savings cannot hide a larger build cost.',
    ],
  };
}
