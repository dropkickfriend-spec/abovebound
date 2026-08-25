export type HvacOperatingMode = 'heating' | 'cooling';
export type HvacAssistMode = 'mechanical_only' | 'outside_air' | 'recovered_stream' | 'hybrid' | 'pressure_recovery';

export interface HvacCycleStrategy {
  id: string;
  label: string;
  onMinutes: number;
  offMinutes: number;
  deadbandC: number;
  capacityFraction: number;
  assistMode: HvacAssistMode;
}

export interface HvacCycleOptimizationInput {
  roomName?: string;
  mode?: HvacOperatingMode;
  targetTempC?: number;
  comfortBandC?: number;
  initialIndoorTempC?: number;
  floorAreaM2?: number;
  roomVolumeM3?: number;
  envelopeConductanceWPerK?: number;
  airLeakageAch?: number;
  effectiveThermalMassKJPerK?: number;
  internalGainsW?: number;
  outdoorLowTempC?: number;
  outdoorHighTempC?: number;
  outdoorPeakHour?: number;
  outdoorRelativeHumidityPct?: number;
  maxOutsideAirHumidityPct?: number;
  hvacThermalCapacityW?: number;
  hvacCop?: number;
  circulationFanPowerW?: number;
  standbyPowerW?: number;
  startupEnergyWh?: number;
  minOnMinutes?: number;
  minOffMinutes?: number;
  maxCyclesPerHour?: number;
  outsideAirFlowM3s?: number;
  allowOutsideAir?: boolean;
  recoveredStreamTempC?: number;
  recoveredStreamCapacityW?: number;
  recoveryPumpPowerW?: number;
  allowRecoveredStream?: boolean;
  compressedAirGaugePressureBar?: number;
  expanderEfficiency?: number;
  compressedAirProductionWhPerM3?: number;
  simulationHours?: number;
  timestepMinutes?: number;
  conditioningDaysPerYear?: number;
  lifecycleYears?: number;
  learnedStrategies?: HvacCycleStrategy[];
}

export interface HvacCycleTracePoint {
  hour: number;
  outdoorTempC: number;
  indoorTempC: number;
  mechanicalOn: boolean;
  assistActive: boolean;
}

export interface HvacEnergyBreakdown {
  mechanicalKWh: number;
  circulationFanKWh: number;
  startupKWh: number;
  standbyKWh: number;
  recoveryPumpKWh: number;
  compressedAirProductionKWh: number;
  totalElectricalKWh: number;
  mechanicalThermalKWh: number;
  outsideAirThermalKWh: number;
  recoveredThermalKWh: number;
  pressureRecoveryThermalKWh: number;
}

export interface HvacComfortResult {
  minutesEvaluated: number;
  comfortPercent: number;
  degreeHoursOutsideBand: number;
  meanAbsoluteErrorC: number;
  peakDeviationC: number;
  minimumIndoorTempC: number;
  maximumIndoorTempC: number;
}

export interface HvacCycleEvaluation {
  strategy: HvacCycleStrategy;
  energy: HvacEnergyBreakdown;
  comfort: HvacComfortResult;
  starts: number;
  startsPerHour: number;
  dutyCyclePercent: number;
  manufacturingEnergyKWh: number;
  annualElectricalKWh: number;
  lifecycleElectricalAndManufacturingKWh: number;
  trace: HvacCycleTracePoint[];
  comfortEquivalentToBaseline: boolean;
  manufacturerCycleLimitPassed: boolean;
  score: number;
}

export interface HvacCycleOptimizationResult {
  roomName: string;
  mode: HvacOperatingMode;
  baseline: HvacCycleEvaluation;
  best: HvacCycleEvaluation;
  candidatesEvaluated: number;
  improvement: {
    qualifiesAsImprovement: boolean;
    dailyElectricalSavedKWh: number;
    annualElectricalSavedKWh: number;
    electricalSavedPercent: number;
    lifecycleEnergySavedKWh: number;
    lifecycleEnergySavedPercent: number;
    controllerEnergyPaybackYears: number | null;
    reason: string;
  };
  physics: {
    airMassKg: number;
    airThermalCapacityKWhPerK: number;
    effectiveThermalCapacityKWhPerK: number;
    infiltrationConductanceWPerK: number;
    expansionSupplyTempC: number | null;
  };
  constraints: {
    targetTempC: number;
    comfortLowC: number;
    comfortHighC: number;
    minOnMinutes: number;
    minOffMinutes: number;
    maxCyclesPerHour: number;
    conditioningDaysPerYear: number;
    lifecycleYears: number;
  };
  assumptions: string[];
  learning?: {
    mode: 'anonymous_aggregate';
    priorStrategiesUsed: number;
    sharedStrategiesAvailable: number;
    exactRoomInputsShared: false;
  };
}

interface NormalizedInput extends Required<Omit<HvacCycleOptimizationInput, 'learnedStrategies'>> {
  learnedStrategies: HvacCycleStrategy[];
}

const AIR_DENSITY_KG_M3 = 1.204;
const AIR_SPECIFIC_HEAT_J_KGK = 1006;
const AIR_HEAT_CAPACITY_J_M3K = AIR_DENSITY_KG_M3 * AIR_SPECIFIC_HEAT_J_KGK;
const AIR_GAMMA = 1.4;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const round = (value: number, digits = 3) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

function normalizeInput(input: HvacCycleOptimizationInput): NormalizedInput {
  const mode = input.mode || 'cooling';
  const targetTempC = clamp(Number(input.targetTempC ?? 22), 10, 32);
  const floorAreaM2 = clamp(Number(input.floorAreaM2 ?? 18), 5, 500);
  const roomVolumeM3 = clamp(Number(input.roomVolumeM3 ?? floorAreaM2 * 2.7), 12, 1800);
  const outdoorLowTempC = clamp(Number(input.outdoorLowTempC ?? (mode === 'cooling' ? 18 : 2)), -35, 50);
  const outdoorHighTempC = clamp(Number(input.outdoorHighTempC ?? (mode === 'cooling' ? 35 : 13)), outdoorLowTempC, 60);
  const minOnMinutes = clamp(Math.round(Number(input.minOnMinutes ?? 5)), 3, 60);
  const minOffMinutes = clamp(Math.round(Number(input.minOffMinutes ?? 5)), 3, 120);

  return {
    roomName: input.roomName || 'Selected room',
    mode,
    targetTempC,
    comfortBandC: clamp(Number(input.comfortBandC ?? 1), 0.25, 3),
    initialIndoorTempC: clamp(Number(input.initialIndoorTempC ?? (mode === 'cooling' ? targetTempC + 0.8 : targetTempC - 0.8)), -10, 50),
    floorAreaM2,
    roomVolumeM3,
    envelopeConductanceWPerK: clamp(Number(input.envelopeConductanceWPerK ?? floorAreaM2 * 4.2), 5, 5000),
    airLeakageAch: clamp(Number(input.airLeakageAch ?? 0.7), 0.05, 12),
    effectiveThermalMassKJPerK: clamp(Number(input.effectiveThermalMassKJPerK ?? floorAreaM2 * 120), 50, 150_000),
    internalGainsW: clamp(Number(input.internalGainsW ?? 320), -3000, 10_000),
    outdoorLowTempC,
    outdoorHighTempC,
    outdoorPeakHour: clamp(Number(input.outdoorPeakHour ?? 15), 0, 24),
    outdoorRelativeHumidityPct: clamp(Number(input.outdoorRelativeHumidityPct ?? 55), 0, 100),
    maxOutsideAirHumidityPct: clamp(Number(input.maxOutsideAirHumidityPct ?? 70), 10, 100),
    hvacThermalCapacityW: clamp(Number(input.hvacThermalCapacityW ?? 4200), 300, 50_000),
    hvacCop: clamp(Number(input.hvacCop ?? 3.6), 1, 9),
    circulationFanPowerW: clamp(Number(input.circulationFanPowerW ?? 160), 0, 3000),
    standbyPowerW: clamp(Number(input.standbyPowerW ?? 8), 0, 300),
    startupEnergyWh: clamp(Number(input.startupEnergyWh ?? 18), 0, 500),
    minOnMinutes,
    minOffMinutes,
    maxCyclesPerHour: clamp(Number(input.maxCyclesPerHour ?? 3), 0.25, 12),
    outsideAirFlowM3s: clamp(Number(input.outsideAirFlowM3s ?? 0.12), 0.005, 3),
    allowOutsideAir: input.allowOutsideAir !== false,
    recoveredStreamTempC: clamp(Number(input.recoveredStreamTempC ?? (mode === 'cooling' ? 14 : 32)), -30, 100),
    recoveredStreamCapacityW: clamp(Number(input.recoveredStreamCapacityW ?? 1600), 0, 50_000),
    recoveryPumpPowerW: clamp(Number(input.recoveryPumpPowerW ?? 70), 0, 3000),
    allowRecoveredStream: input.allowRecoveredStream === true,
    compressedAirGaugePressureBar: clamp(Number(input.compressedAirGaugePressureBar ?? 0), 0, 20),
    expanderEfficiency: clamp(Number(input.expanderEfficiency ?? 0.55), 0, 1),
    compressedAirProductionWhPerM3: clamp(Number(input.compressedAirProductionWhPerM3 ?? 120), 0, 1000),
    simulationHours: clamp(Number(input.simulationHours ?? 24), 4, 168),
    timestepMinutes: clamp(Math.round(Number(input.timestepMinutes ?? 5)), 1, 15),
    conditioningDaysPerYear: clamp(Math.round(Number(input.conditioningDaysPerYear ?? 180)), 1, 365),
    lifecycleYears: clamp(Math.round(Number(input.lifecycleYears ?? 15)), 1, 40),
    learnedStrategies: (input.learnedStrategies || []).slice(0, 24),
  };
}

function outsideTemperature(input: NormalizedInput, hour: number) {
  const mean = (input.outdoorHighTempC + input.outdoorLowTempC) / 2;
  const amplitude = (input.outdoorHighTempC - input.outdoorLowTempC) / 2;
  return mean + amplitude * Math.cos((hour - input.outdoorPeakHour) / 24 * Math.PI * 2);
}

function effectiveCop(input: NormalizedInput, outdoorTempC: number) {
  const lift = Math.abs(outdoorTempC - input.targetTempC);
  return clamp(input.hvacCop * (1.05 - lift * 0.012), input.hvacCop * 0.52, input.hvacCop * 1.08);
}

function expansionSupplyTemperatureC(input: NormalizedInput, inletTempC: number) {
  if (input.compressedAirGaugePressureBar <= 0 || input.expanderEfficiency <= 0) return null;
  const pressureRatio = 1 + input.compressedAirGaugePressureBar;
  const inletK = inletTempC + 273.15;
  const idealOutletK = inletK * (1 / pressureRatio) ** ((AIR_GAMMA - 1) / AIR_GAMMA);
  return inletTempC - (inletK - idealOutletK) * input.expanderEfficiency;
}

function manufacturingEnergy(strategy: HvacCycleStrategy) {
  if (strategy.id === 'baseline') return 0;
  if (strategy.assistMode === 'outside_air') return 220;
  if (strategy.assistMode === 'recovered_stream') return 480;
  if (strategy.assistMode === 'hybrid') return 620;
  if (strategy.assistMode === 'pressure_recovery') return 350;
  return 65;
}

function emptyEnergy(): HvacEnergyBreakdown {
  return {
    mechanicalKWh: 0,
    circulationFanKWh: 0,
    startupKWh: 0,
    standbyKWh: 0,
    recoveryPumpKWh: 0,
    compressedAirProductionKWh: 0,
    totalElectricalKWh: 0,
    mechanicalThermalKWh: 0,
    outsideAirThermalKWh: 0,
    recoveredThermalKWh: 0,
    pressureRecoveryThermalKWh: 0,
  };
}

function simulate(strategy: HvacCycleStrategy, input: NormalizedInput, baseline = false): HvacCycleEvaluation {
  const dtSeconds = input.timestepMinutes * 60;
  const steps = Math.ceil(input.simulationHours * 60 / input.timestepMinutes);
  const airCapacityJPerK = input.roomVolumeM3 * AIR_HEAT_CAPACITY_J_M3K;
  const effectiveCapacityJPerK = airCapacityJPerK + input.effectiveThermalMassKJPerK * 1000;
  const infiltrationConductance = AIR_HEAT_CAPACITY_J_M3K * input.roomVolumeM3 * input.airLeakageAch / 3600;
  const direction = input.mode === 'cooling' ? -1 : 1;
  const comfortLow = input.targetTempC - input.comfortBandC;
  const comfortHigh = input.targetTempC + input.comfortBandC;
  const energy = emptyEnergy();
  const trace: HvacCycleTracePoint[] = [];
  let indoorTempC = input.initialIndoorTempC;
  let minimumIndoorTempC = indoorTempC;
  let maximumIndoorTempC = indoorTempC;
  let absoluteErrorMinutes = 0;
  let degreeMinutesOutsideBand = 0;
  let comfortMinutes = 0;
  let mechanicalOn = false;
  let elapsedOnMinutes = 0;
  let elapsedOffMinutes = 10_000;
  let starts = 0;
  let mechanicalOnMinutes = 0;

  for (let step = 0; step < steps; step += 1) {
    const hour = step * input.timestepMinutes / 60;
    const outdoorTempC = outsideTemperature(input, hour % 24);
    const qEnvelopeW = (input.envelopeConductanceWPerK + infiltrationConductance) * (outdoorTempC - indoorTempC);
    const qFreeW = qEnvelopeW + input.internalGainsW;
    let qAssistW = 0;
    let assistActive = false;
    let outsideAssistW = 0;
    let recoveredAssistW = 0;
    let pressureAssistW = 0;
    const needsConditioning = direction * (input.targetTempC - indoorTempC) > 0.03;

    if (!baseline && needsConditioning) {
      const useOutside = strategy.assistMode === 'outside_air' || strategy.assistMode === 'hybrid';
      const humiditySafe = input.outdoorRelativeHumidityPct <= input.maxOutsideAirHumidityPct;
      const outsideHelpful = direction * (outdoorTempC - indoorTempC) > 0.2;
      if (useOutside && input.allowOutsideAir && humiditySafe && outsideHelpful) {
        outsideAssistW = AIR_HEAT_CAPACITY_J_M3K * input.outsideAirFlowM3s * (outdoorTempC - indoorTempC);
        qAssistW += outsideAssistW;
        assistActive = true;
      }

      const useRecovered = strategy.assistMode === 'recovered_stream' || strategy.assistMode === 'hybrid';
      const recoveredDelta = input.recoveredStreamTempC - indoorTempC;
      if (useRecovered && input.allowRecoveredStream && direction * recoveredDelta > 0.4 && input.recoveredStreamCapacityW > 0) {
        recoveredAssistW = direction * Math.min(input.recoveredStreamCapacityW, Math.abs(recoveredDelta) * AIR_HEAT_CAPACITY_J_M3K * input.outsideAirFlowM3s);
        qAssistW += recoveredAssistW;
        assistActive = true;
      }

      if (strategy.assistMode === 'pressure_recovery' && input.mode === 'cooling') {
        const supplyTempC = expansionSupplyTemperatureC(input, outdoorTempC);
        if (supplyTempC !== null && supplyTempC < indoorTempC - 0.4) {
          pressureAssistW = AIR_HEAT_CAPACITY_J_M3K * input.outsideAirFlowM3s * (supplyTempC - indoorTempC);
          qAssistW += pressureAssistW;
          assistActive = true;
          const movedM3 = input.outsideAirFlowM3s * dtSeconds;
          energy.compressedAirProductionKWh += movedM3 * input.compressedAirProductionWhPerM3 / 1000;
        }
      }
    }

    let qMechanicalW = 0;
    let justStarted = false;
    if (baseline) {
      const requiredW = effectiveCapacityJPerK * (input.targetTempC - indoorTempC) / dtSeconds - qFreeW;
      if (direction * requiredW > 0) {
        qMechanicalW = direction * Math.min(input.hvacThermalCapacityW, Math.abs(requiredW));
        mechanicalOn = Math.abs(qMechanicalW) > 0.5;
      } else {
        mechanicalOn = false;
      }
    } else {
      const startThreshold = input.mode === 'cooling'
        ? input.targetTempC + strategy.deadbandC
        : input.targetTempC - strategy.deadbandC;
      const stopThreshold = input.mode === 'cooling'
        ? input.targetTempC - strategy.deadbandC * 0.35
        : input.targetTempC + strategy.deadbandC * 0.35;
      const startDemand = input.mode === 'cooling' ? indoorTempC >= startThreshold : indoorTempC <= startThreshold;
      const stopDemand = input.mode === 'cooling' ? indoorTempC <= stopThreshold : indoorTempC >= stopThreshold;

      if (mechanicalOn) {
        elapsedOnMinutes += input.timestepMinutes;
        elapsedOffMinutes = 0;
        if (elapsedOnMinutes >= Math.max(input.minOnMinutes, strategy.onMinutes) || (stopDemand && elapsedOnMinutes >= input.minOnMinutes)) {
          mechanicalOn = false;
          elapsedOffMinutes = 0;
        }
      } else {
        elapsedOffMinutes += input.timestepMinutes;
        elapsedOnMinutes = 0;
        const predictedAssistChange = qAssistW * dtSeconds / effectiveCapacityJPerK;
        const assistWillRecover = input.mode === 'cooling'
          ? indoorTempC + predictedAssistChange <= startThreshold
          : indoorTempC + predictedAssistChange >= startThreshold;
        if (startDemand && elapsedOffMinutes >= Math.max(input.minOffMinutes, strategy.offMinutes) && !assistWillRecover) {
          mechanicalOn = true;
          justStarted = true;
          starts += 1;
          elapsedOnMinutes = 0;
        }
      }

      if (mechanicalOn) {
        const desiredThermalW = input.hvacThermalCapacityW * strategy.capacityFraction;
        const assistMagnitudeW = Math.max(0, direction * qAssistW);
        const startupCapacityFactor = justStarted ? 0.82 : 1;
        qMechanicalW = direction * Math.max(0, desiredThermalW - assistMagnitudeW) * startupCapacityFactor;
      }
    }

    const cop = effectiveCop(input, outdoorTempC);
    energy.mechanicalKWh += Math.abs(qMechanicalW) / cop * dtSeconds / 3_600_000;
    energy.mechanicalThermalKWh += Math.abs(qMechanicalW) * dtSeconds / 3_600_000;
    energy.outsideAirThermalKWh += Math.abs(outsideAssistW) * dtSeconds / 3_600_000;
    energy.recoveredThermalKWh += Math.abs(recoveredAssistW) * dtSeconds / 3_600_000;
    energy.pressureRecoveryThermalKWh += Math.abs(pressureAssistW) * dtSeconds / 3_600_000;
    if (justStarted) energy.startupKWh += input.startupEnergyWh / 1000;
    if (baseline || mechanicalOn || (assistActive && strategy.assistMode !== 'recovered_stream')) {
      energy.circulationFanKWh += input.circulationFanPowerW * dtSeconds / 3_600_000;
    } else {
      energy.standbyKWh += input.standbyPowerW * dtSeconds / 3_600_000;
    }
    if (assistActive && (strategy.assistMode === 'recovered_stream' || strategy.assistMode === 'hybrid')) {
      energy.recoveryPumpKWh += input.recoveryPumpPowerW * dtSeconds / 3_600_000;
    }

    indoorTempC += (qFreeW + qAssistW + qMechanicalW) * dtSeconds / effectiveCapacityJPerK;
    minimumIndoorTempC = Math.min(minimumIndoorTempC, indoorTempC);
    maximumIndoorTempC = Math.max(maximumIndoorTempC, indoorTempC);
    const errorC = Math.abs(indoorTempC - input.targetTempC);
    absoluteErrorMinutes += errorC * input.timestepMinutes;
    const outsideComfortC = indoorTempC < comfortLow ? comfortLow - indoorTempC : indoorTempC > comfortHigh ? indoorTempC - comfortHigh : 0;
    degreeMinutesOutsideBand += outsideComfortC * input.timestepMinutes;
    if (outsideComfortC <= 0.0001) comfortMinutes += input.timestepMinutes;
    if (mechanicalOn) mechanicalOnMinutes += input.timestepMinutes;

    if (step % Math.max(1, Math.round(30 / input.timestepMinutes)) === 0 || step === steps - 1) {
      trace.push({
        hour: round(hour, 2),
        outdoorTempC: round(outdoorTempC, 2),
        indoorTempC: round(indoorTempC, 2),
        mechanicalOn,
        assistActive,
      });
    }
  }

  energy.totalElectricalKWh = energy.mechanicalKWh
    + energy.circulationFanKWh
    + energy.startupKWh
    + energy.standbyKWh
    + energy.recoveryPumpKWh
    + energy.compressedAirProductionKWh;
  Object.keys(energy).forEach(key => {
    energy[key as keyof HvacEnergyBreakdown] = round(energy[key as keyof HvacEnergyBreakdown]);
  });

  const totalMinutes = steps * input.timestepMinutes;
  const comfort: HvacComfortResult = {
    minutesEvaluated: totalMinutes,
    comfortPercent: round(comfortMinutes / totalMinutes * 100, 2),
    degreeHoursOutsideBand: round(degreeMinutesOutsideBand / 60, 3),
    meanAbsoluteErrorC: round(absoluteErrorMinutes / totalMinutes, 3),
    peakDeviationC: round(Math.max(Math.abs(minimumIndoorTempC - input.targetTempC), Math.abs(maximumIndoorTempC - input.targetTempC)), 3),
    minimumIndoorTempC: round(minimumIndoorTempC, 2),
    maximumIndoorTempC: round(maximumIndoorTempC, 2),
  };
  const startsPerHour = starts / input.simulationHours;
  const manufacturerCycleLimitPassed = startsPerHour <= input.maxCyclesPerHour;
  const comfortEquivalentToBaseline = comfort.comfortPercent >= 98
    && comfort.degreeHoursOutsideBand <= 0.15
    && comfort.peakDeviationC <= input.comfortBandC + 0.15;
  const manufacturingEnergyKWh = manufacturingEnergy(strategy);
  const annualElectricalKWh = energy.totalElectricalKWh / input.simulationHours * 24 * input.conditioningDaysPerYear;
  const lifecycleElectricalAndManufacturingKWh = annualElectricalKWh * input.lifecycleYears + manufacturingEnergyKWh;
  const score = energy.totalElectricalKWh
    + comfort.degreeHoursOutsideBand * 20
    + Math.max(0, 98 - comfort.comfortPercent) * 2
    + Math.max(0, startsPerHour - input.maxCyclesPerHour) * 50;

  return {
    strategy,
    energy,
    comfort,
    starts,
    startsPerHour: round(startsPerHour, 3),
    dutyCyclePercent: round(mechanicalOnMinutes / totalMinutes * 100, 2),
    manufacturingEnergyKWh,
    annualElectricalKWh: round(annualElectricalKWh),
    lifecycleElectricalAndManufacturingKWh: round(lifecycleElectricalAndManufacturingKWh),
    trace,
    comfortEquivalentToBaseline,
    manufacturerCycleLimitPassed,
    score: round(score),
  };
}

function strategyKey(strategy: HvacCycleStrategy) {
  return [strategy.onMinutes, strategy.offMinutes, strategy.deadbandC, strategy.capacityFraction, strategy.assistMode].join('|');
}

function candidateStrategies(input: NormalizedInput) {
  const onMinutes = [5, 10, 15, 20, 30, 45, 60].filter(value => value >= input.minOnMinutes);
  const offMinutes = [5, 10, 15, 20, 30, 45, 60, 90].filter(value => value >= input.minOffMinutes);
  const deadbands = [0.25, 0.5, 0.75, 1, 1.25, 1.5].filter(value => value <= input.comfortBandC);
  const capacityFractions = [0.35, 0.5, 0.7, 1];
  const assistModes: HvacAssistMode[] = ['mechanical_only'];
  if (input.allowOutsideAir) assistModes.push('outside_air');
  if (input.allowRecoveredStream && input.recoveredStreamCapacityW > 0) assistModes.push('recovered_stream');
  if (input.allowOutsideAir && input.allowRecoveredStream && input.recoveredStreamCapacityW > 0) assistModes.push('hybrid');
  if (input.compressedAirGaugePressureBar > 0 && input.mode === 'cooling') assistModes.push('pressure_recovery');
  const candidates: HvacCycleStrategy[] = [];
  const seen = new Set<string>();
  const add = (strategy: HvacCycleStrategy) => {
    const key = strategyKey(strategy);
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(strategy);
  };

  input.learnedStrategies.forEach((strategy, index) => add({
    ...strategy,
    id: `learned-${index}`,
    label: `Learned ${strategy.onMinutes}/${strategy.offMinutes} minute cycle`,
    onMinutes: clamp(Math.round(strategy.onMinutes), input.minOnMinutes, 120),
    offMinutes: clamp(Math.round(strategy.offMinutes), input.minOffMinutes, 180),
    deadbandC: clamp(strategy.deadbandC, 0.2, input.comfortBandC),
    capacityFraction: clamp(strategy.capacityFraction, 0.2, 1),
  }));

  for (const assistMode of assistModes) {
    for (const on of onMinutes) {
      for (const off of offMinutes) {
        for (const deadbandC of deadbands) {
          for (const capacityFraction of capacityFractions) {
            add({
              id: `${assistMode}-${on}-${off}-${deadbandC}-${capacityFraction}`,
              label: `${on} min on / ${off} min off · ${assistMode.replaceAll('_', ' ')}`,
              onMinutes: on,
              offMinutes: off,
              deadbandC,
              capacityFraction,
              assistMode,
            });
          }
        }
      }
    }
  }
  return candidates;
}

export function optimizeHvacCycle(rawInput: HvacCycleOptimizationInput = {}): HvacCycleOptimizationResult {
  const input = normalizeInput(rawInput);
  const baselineStrategy: HvacCycleStrategy = {
    id: 'baseline',
    label: 'Tight thermostat · continuous circulation fan',
    onMinutes: input.timestepMinutes,
    offMinutes: input.timestepMinutes,
    deadbandC: 0,
    capacityFraction: 1,
    assistMode: 'mechanical_only',
  };
  const baseline = simulate(baselineStrategy, input, true);
  const strategies = candidateStrategies(input);
  const evaluated = strategies.map(strategy => simulate(strategy, input));
  const comfortEquivalent = evaluated
    .filter(candidate => candidate.comfortEquivalentToBaseline && candidate.manufacturerCycleLimitPassed)
    .sort((a, b) => a.lifecycleElectricalAndManufacturingKWh - b.lifecycleElectricalAndManufacturingKWh || a.score - b.score);
  const best = comfortEquivalent[0] || evaluated.sort((a, b) => a.score - b.score)[0] || baseline;
  const dailySaved = baseline.energy.totalElectricalKWh - best.energy.totalElectricalKWh;
  const annualSaved = baseline.annualElectricalKWh - best.annualElectricalKWh;
  const baselineLifecycle = baseline.annualElectricalKWh * input.lifecycleYears;
  const lifecycleSaved = baselineLifecycle - best.lifecycleElectricalAndManufacturingKWh;
  const qualifies = best.comfortEquivalentToBaseline
    && best.manufacturerCycleLimitPassed
    && dailySaved > 0.001
    && lifecycleSaved > 0;
  const payback = annualSaved > 0 ? best.manufacturingEnergyKWh / annualSaved : null;

  return {
    roomName: input.roomName,
    mode: input.mode,
    baseline,
    best,
    candidatesEvaluated: strategies.length,
    improvement: {
      qualifiesAsImprovement: qualifies,
      dailyElectricalSavedKWh: round(dailySaved),
      annualElectricalSavedKWh: round(annualSaved),
      electricalSavedPercent: round(dailySaved / Math.max(0.001, baseline.energy.totalElectricalKWh) * 100, 2),
      lifecycleEnergySavedKWh: round(lifecycleSaved),
      lifecycleEnergySavedPercent: round(lifecycleSaved / Math.max(1, baselineLifecycle) * 100, 2),
      controllerEnergyPaybackYears: payback !== null && Number.isFinite(payback) ? round(payback, 2) : null,
      reason: qualifies
        ? `${best.strategy.label} used less lifecycle energy while matching the comfort band and equipment cycling limit.`
        : 'No intermittent strategy saved net lifecycle energy while matching the comfort band and equipment cycling limit; retain tight thermostat control for these inputs.',
    },
    physics: {
      airMassKg: round(input.roomVolumeM3 * AIR_DENSITY_KG_M3),
      airThermalCapacityKWhPerK: round(input.roomVolumeM3 * AIR_HEAT_CAPACITY_J_M3K / 3_600_000, 4),
      effectiveThermalCapacityKWhPerK: round((input.roomVolumeM3 * AIR_HEAT_CAPACITY_J_M3K + input.effectiveThermalMassKJPerK * 1000) / 3_600_000, 3),
      infiltrationConductanceWPerK: round(AIR_HEAT_CAPACITY_J_M3K * input.roomVolumeM3 * input.airLeakageAch / 3600),
      expansionSupplyTempC: expansionSupplyTemperatureC(input, (input.outdoorLowTempC + input.outdoorHighTempC) / 2),
    },
    constraints: {
      targetTempC: input.targetTempC,
      comfortLowC: round(input.targetTempC - input.comfortBandC),
      comfortHighC: round(input.targetTempC + input.comfortBandC),
      minOnMinutes: input.minOnMinutes,
      minOffMinutes: input.minOffMinutes,
      maxCyclesPerHour: input.maxCyclesPerHour,
      conditioningDaysPerYear: input.conditioningDaysPerYear,
      lifecycleYears: input.lifecycleYears,
    },
    assumptions: [
      'The room is represented by a transient resistance-capacitance model: air heat capacity, accessible building thermal mass, envelope conduction and infiltration are solved at each timestep.',
      'Injected outside or recovered air transfers heat by mass flow and mixing. Ordinary same-pressure supply air receives no expansion-cooling credit.',
      'Pressure-recovery cooling is credited only when a pressurized source and expander efficiency are supplied, and compressed-air production electricity is counted.',
      'The baseline is a tight, continuously circulating thermostat. Candidate pulse controls must remain inside the requested comfort band for at least 98% of the simulated period.',
      'Startup electricity, minimum on/off time, compressor start frequency, fan/pump energy and controller/damper/heat-exchanger manufacturing energy are included.',
      'Waste-stream thermal energy is treated as otherwise discarded; only recovery fan or pump electricity is charged. Verify real source temperature, availability and contamination controls before construction.',
      'This is a screening/control-design model, not equipment commissioning or a substitute for psychrometric, condensation, combustion-safety and code checks.',
    ],
  };
}
