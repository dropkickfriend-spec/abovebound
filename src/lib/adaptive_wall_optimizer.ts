export type AdaptiveWallMode = 'heating' | 'cooling';
export type AdaptiveWallStrategyKind = 'passive_lattice' | 'switchable_lattice' | 'bladder' | 'bladder_lattice';

export interface AdaptiveWallStrategy {
  id: string;
  label: string;
  kind: AdaptiveWallStrategyKind;
  wasteCaptureFraction: number;
}

export interface AdaptiveWallOptimizationInput {
  mode?: AdaptiveWallMode;
  wallName?: string;
  wallAreaM2?: number;
  indoorTempC?: number;
  indoorRelativeHumidityPct?: number;
  outdoorLowTempC?: number;
  outdoorHighTempC?: number;
  outdoorPeakHour?: number;
  staticWallRValue?: number;
  wallThermalMassKJPerK?: number;
  hvacCop?: number;
  computeOrCompressorWasteHeatW?: number;
  wasteHeatDutyFraction?: number;
  wasteSourceTempC?: number;
  latticeAreaM2?: number;
  latticeMaterialConductivityWmK?: number;
  latticeFillFraction?: number;
  latticePathLengthM?: number;
  latticeOffConductanceFraction?: number;
  latticeSwitchEnergyWh?: number;
  latticePumpPowerW?: number;
  fluidChannel?: boolean;
  useFixedSink?: boolean;
  fixedSinkTempC?: number;
  inflatedRValue?: number;
  deflatedRValue?: number;
  bladderActuationEnergyWh?: number;
  bladderLeakReinflationsPerDay?: number;
  actuatorHeatReleasedIndoorsFraction?: number;
  conditioningDaysPerYear?: number;
  lifecycleYears?: number;
  latticeEmbodiedEnergyKWhPerM2?: number;
  bladderEmbodiedEnergyKWhPerM2?: number;
  controllerAndActuatorEmbodiedKWh?: number;
}

export interface AdaptiveWallTracePoint {
  hour: number;
  outdoorTempC: number;
  wallCoreTempC: number;
  wallRValue: number;
  latticeOpen: boolean;
  wasteHeatExportW: number;
  netRoomHeatW: number;
}

export interface AdaptiveWallEnergy {
  wallHeatToRoomKWh: number;
  latticeHeatToRoomKWh: number;
  wasteHeatGeneratedKWh: number;
  wasteHeatExportedKWh: number;
  actuatorHeatToRoomKWh: number;
  conditioningThermalKWh: number;
  hvacElectricalKWh: number;
  switchingElectricalKWh: number;
  pumpElectricalKWh: number;
  totalElectricalKWh: number;
}

export interface AdaptiveWallEvaluation {
  strategy: AdaptiveWallStrategy;
  energy: AdaptiveWallEnergy;
  manufacturingEnergyKWh: number;
  annualElectricalKWh: number;
  lifecycleElectricalAndManufacturingKWh: number;
  bladderTransitions: number;
  latticeTransitions: number;
  minimumWallCoreTempC: number;
  condensationMarginC: number;
  condensationRisk: boolean;
  trace: AdaptiveWallTracePoint[];
  score: number;
}

export interface AdaptiveWallOptimizationResult {
  wallName: string;
  mode: AdaptiveWallMode;
  baseline: AdaptiveWallEvaluation;
  best: AdaptiveWallEvaluation;
  candidatesEvaluated: number;
  verdict: 'reduces_heat_and_energy' | 'increases_heat_or_energy' | 'energy_shift_only';
  improvement: {
    qualifiesAsImprovement: boolean;
    dailyConditioningHeatReducedKWh: number;
    dailyElectricalSavedKWh: number;
    annualElectricalSavedKWh: number;
    electricalSavedPercent: number;
    lifecycleEnergySavedKWh: number;
    lifecycleEnergySavedPercent: number;
    manufacturingEnergyPaybackYears: number | null;
    reason: string;
  };
  physics: {
    baselineWallConductanceWPerK: number;
    latticeOnConductanceWPerK: number;
    latticeOffConductanceWPerK: number;
    indoorDewPointC: number;
    compressorWasteHeatMustExitEnvelope: boolean;
  };
  constraints: {
    indoorTempC: number;
    outdoorLowTempC: number;
    outdoorHighTempC: number;
    conditioningDaysPerYear: number;
    lifecycleYears: number;
  };
  assumptions: string[];
  learning?: {
    mode: 'anonymous_aggregate';
    similarStudiesAvailable: number;
    exactWallInputsShared: false;
  };
  sweep?: AdaptiveWallSweepSummary;
}

export interface AdaptiveWallSweepCandidate {
  rank: number;
  configurationId: string;
  strategy: AdaptiveWallStrategy;
  verdict: AdaptiveWallOptimizationResult['verdict'];
  qualifiesAsImprovement: boolean;
  dailyElectricalSavedKWh: number;
  lifecycleEnergySavedKWh: number;
  manufacturingEnergyPaybackYears: number | null;
  condensationRisk: boolean;
  score: number;
  parameters: {
    latticeAreaM2: number;
    latticeMaterialConductivityWmK: number;
    latticeFillFraction: number;
    latticePathLengthM: number;
    latticeOffConductanceFraction: number;
    fluidChannel: boolean;
    inflatedRValue: number;
    deflatedRValue: number;
    bladderActuationEnergyWh: number;
    bladderLeakReinflationsPerDay: number;
  };
}

export interface AdaptiveWallSweepSummary {
  mode: 'automatic_parameter_discovery';
  parameterSetsEvaluated: number;
  strategyEvaluations: number;
  automaticallySwept: string[];
  winningInput: AdaptiveWallSweepCandidate['parameters'];
  rankedCandidates: AdaptiveWallSweepCandidate[];
  resultRanges: {
    dailyElectricalSavedKWh: { minimum: number; maximum: number };
    lifecycleEnergySavedKWh: { minimum: number; maximum: number };
  };
}

interface NormalizedInput extends Required<AdaptiveWallOptimizationInput> {}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const round = (value: number, digits = 3) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

function normalizeInput(input: AdaptiveWallOptimizationInput): NormalizedInput {
  const mode = input.mode || 'cooling';
  const indoorTempC = clamp(Number(input.indoorTempC ?? 22), 8, 35);
  const wallAreaM2 = clamp(Number(input.wallAreaM2 ?? 25), 1, 1000);
  const outdoorLowTempC = clamp(Number(input.outdoorLowTempC ?? (mode === 'cooling' ? 18 : 1)), -40, 55);
  const outdoorHighTempC = clamp(Number(input.outdoorHighTempC ?? (mode === 'cooling' ? 36 : 13)), outdoorLowTempC, 65);
  return {
    mode,
    wallName: input.wallName || 'Selected exterior wall',
    wallAreaM2,
    indoorTempC,
    indoorRelativeHumidityPct: clamp(Number(input.indoorRelativeHumidityPct ?? 50), 5, 100),
    outdoorLowTempC,
    outdoorHighTempC,
    outdoorPeakHour: clamp(Number(input.outdoorPeakHour ?? 15), 0, 24),
    staticWallRValue: clamp(Number(input.staticWallRValue ?? 2.5), 0.15, 15),
    wallThermalMassKJPerK: clamp(Number(input.wallThermalMassKJPerK ?? wallAreaM2 * 220), 20, 500_000),
    hvacCop: clamp(Number(input.hvacCop ?? 3.6), 1, 9),
    computeOrCompressorWasteHeatW: clamp(Number(input.computeOrCompressorWasteHeatW ?? 600), 0, 100_000),
    wasteHeatDutyFraction: clamp(Number(input.wasteHeatDutyFraction ?? 0.5), 0, 1),
    wasteSourceTempC: clamp(Number(input.wasteSourceTempC ?? 45), indoorTempC, 180),
    latticeAreaM2: clamp(Number(input.latticeAreaM2 ?? wallAreaM2 * 0.8), 0.1, wallAreaM2),
    latticeMaterialConductivityWmK: clamp(Number(input.latticeMaterialConductivityWmK ?? 0.25), 0.015, 450),
    latticeFillFraction: clamp(Number(input.latticeFillFraction ?? 0.04), 0.001, 0.8),
    latticePathLengthM: clamp(Number(input.latticePathLengthM ?? 0.12), 0.005, 1),
    latticeOffConductanceFraction: clamp(Number(input.latticeOffConductanceFraction ?? 0.03), 0.0001, 1),
    latticeSwitchEnergyWh: clamp(Number(input.latticeSwitchEnergyWh ?? 8), 0, 1000),
    latticePumpPowerW: clamp(Number(input.latticePumpPowerW ?? 35), 0, 5000),
    fluidChannel: input.fluidChannel === true,
    useFixedSink: input.useFixedSink === true,
    fixedSinkTempC: clamp(Number(input.fixedSinkTempC ?? (mode === 'cooling' ? 16 : 32)), -20, 100),
    inflatedRValue: clamp(Number(input.inflatedRValue ?? 5), 0.2, 20),
    deflatedRValue: clamp(Number(input.deflatedRValue ?? 0.7), 0.1, 10),
    bladderActuationEnergyWh: clamp(Number(input.bladderActuationEnergyWh ?? 25), 0, 5000),
    bladderLeakReinflationsPerDay: clamp(Number(input.bladderLeakReinflationsPerDay ?? 0.2), 0, 24),
    actuatorHeatReleasedIndoorsFraction: clamp(Number(input.actuatorHeatReleasedIndoorsFraction ?? 0.1), 0, 1),
    conditioningDaysPerYear: clamp(Math.round(Number(input.conditioningDaysPerYear ?? 180)), 1, 365),
    lifecycleYears: clamp(Math.round(Number(input.lifecycleYears ?? 20)), 1, 60),
    latticeEmbodiedEnergyKWhPerM2: clamp(Number(input.latticeEmbodiedEnergyKWhPerM2 ?? 55), 0, 5000),
    bladderEmbodiedEnergyKWhPerM2: clamp(Number(input.bladderEmbodiedEnergyKWhPerM2 ?? 35), 0, 5000),
    controllerAndActuatorEmbodiedKWh: clamp(Number(input.controllerAndActuatorEmbodiedKWh ?? 180), 0, 20_000),
  };
}

function dewPointC(tempC: number, relativeHumidityPct: number) {
  const a = 17.62;
  const b = 243.12;
  const gamma = Math.log(relativeHumidityPct / 100) + a * tempC / (b + tempC);
  return b * gamma / (a - gamma);
}

function outsideTemperature(input: NormalizedInput, hour: number) {
  const mean = (input.outdoorHighTempC + input.outdoorLowTempC) / 2;
  const amplitude = (input.outdoorHighTempC - input.outdoorLowTempC) / 2;
  return mean + amplitude * Math.cos((hour - input.outdoorPeakHour) / 24 * Math.PI * 2);
}

function manufacturingEnergy(strategy: AdaptiveWallStrategy, input: NormalizedInput) {
  const hasLattice = strategy.kind === 'passive_lattice' || strategy.kind === 'switchable_lattice' || strategy.kind === 'bladder_lattice';
  const hasBladder = strategy.kind === 'bladder' || strategy.kind === 'bladder_lattice';
  if (!hasLattice && !hasBladder) return 0;
  return (hasLattice ? input.latticeAreaM2 * input.latticeEmbodiedEnergyKWhPerM2 : 0)
    + (hasBladder ? input.wallAreaM2 * input.bladderEmbodiedEnergyKWhPerM2 : 0)
    + (strategy.kind === 'passive_lattice' ? 0 : input.controllerAndActuatorEmbodiedKWh);
}

function emptyEnergy(): AdaptiveWallEnergy {
  return {
    wallHeatToRoomKWh: 0,
    latticeHeatToRoomKWh: 0,
    wasteHeatGeneratedKWh: 0,
    wasteHeatExportedKWh: 0,
    actuatorHeatToRoomKWh: 0,
    conditioningThermalKWh: 0,
    hvacElectricalKWh: 0,
    switchingElectricalKWh: 0,
    pumpElectricalKWh: 0,
    totalElectricalKWh: 0,
  };
}

function simulate(strategy: AdaptiveWallStrategy, input: NormalizedInput, baseline = false): AdaptiveWallEvaluation {
  const timestepMinutes = 5;
  const dtSeconds = timestepMinutes * 60;
  const warmupDays = 3;
  const totalSteps = warmupDays * 24 * 60 / timestepMinutes;
  const reportingStartStep = (warmupDays - 1) * 24 * 60 / timestepMinutes;
  const wallCapacityJPerK = input.wallThermalMassKJPerK * 1000;
  const latticeOnConductanceWPerK = input.latticeMaterialConductivityWmK
    * input.latticeAreaM2 * input.latticeFillFraction / input.latticePathLengthM;
  const latticeOffConductanceWPerK = latticeOnConductanceWPerK * input.latticeOffConductanceFraction;
  const dewPoint = dewPointC(input.indoorTempC, input.indoorRelativeHumidityPct);
  const energy = emptyEnergy();
  const trace: AdaptiveWallTracePoint[] = [];
  let wallCoreTempC = (input.indoorTempC + outsideTemperature(input, 0)) / 2;
  let bladderInflated = true;
  let latticeOpen = baseline ? false : strategy.kind === 'passive_lattice';
  let bladderTransitions = 0;
  let latticeTransitions = 0;
  let minimumWallCoreTempC = wallCoreTempC;

  for (let step = 0; step < totalSteps; step += 1) {
    const elapsedHour = step * timestepMinutes / 60;
    const hour = elapsedHour % 24;
    const reporting = step >= reportingStartStep;
    const outdoorTempC = outsideTemperature(input, hour);
    const sinkTempC = input.useFixedSink ? input.fixedSinkTempC : outdoorTempC;
    const adverseOutdoor = input.mode === 'cooling'
      ? outdoorTempC > input.indoorTempC + 0.4
      : outdoorTempC < input.indoorTempC - 0.4;
    const helpfulSink = input.mode === 'cooling'
      ? sinkTempC < input.indoorTempC - 0.4
      : sinkTempC > input.indoorTempC + 0.4;
    const hasBladder = !baseline && (strategy.kind === 'bladder' || strategy.kind === 'bladder_lattice');
    const hasSwitchableLattice = !baseline && (strategy.kind === 'switchable_lattice' || strategy.kind === 'bladder_lattice');
    const wasteActive = (hour / 24) < input.wasteHeatDutyFraction;
    const wasteHeatW = wasteActive ? input.computeOrCompressorWasteHeatW : 0;
    const wasteExportPossible = wasteHeatW > 0
      && strategy.wasteCaptureFraction > 0
      && input.wasteSourceTempC > sinkTempC + 1;
    let actuatorHeatToRoomW = 0;

    if (hasBladder) {
      const nextInflated = adverseOutdoor;
      if (nextInflated !== bladderInflated) {
        bladderInflated = nextInflated;
        if (reporting) {
          bladderTransitions += 1;
          energy.switchingElectricalKWh += input.bladderActuationEnergyWh / 1000;
          energy.actuatorHeatToRoomKWh += input.bladderActuationEnergyWh / 1000 * input.actuatorHeatReleasedIndoorsFraction;
          actuatorHeatToRoomW += input.bladderActuationEnergyWh * 3600 / dtSeconds * input.actuatorHeatReleasedIndoorsFraction;
        }
      }
    }

    if (hasSwitchableLattice) {
      const nextOpen = helpfulSink || wasteExportPossible;
      if (nextOpen !== latticeOpen) {
        latticeOpen = nextOpen;
        if (reporting) {
          latticeTransitions += 1;
          energy.switchingElectricalKWh += input.latticeSwitchEnergyWh / 1000;
          energy.actuatorHeatToRoomKWh += input.latticeSwitchEnergyWh / 1000 * input.actuatorHeatReleasedIndoorsFraction;
          actuatorHeatToRoomW += input.latticeSwitchEnergyWh * 3600 / dtSeconds * input.actuatorHeatReleasedIndoorsFraction;
        }
      }
    }

    const currentRValue = hasBladder
      ? (bladderInflated ? input.inflatedRValue : input.deflatedRValue)
      : input.staticWallRValue;
    const wholeWallConductanceWPerK = input.wallAreaM2 / currentRValue;
    const halfWallConductanceWPerK = wholeWallConductanceWPerK * 2;
    const qOutdoorToCoreW = halfWallConductanceWPerK * (outdoorTempC - wallCoreTempC);
    const qRoomToCoreW = halfWallConductanceWPerK * (input.indoorTempC - wallCoreTempC);
    wallCoreTempC += (qOutdoorToCoreW + qRoomToCoreW) * dtSeconds / wallCapacityJPerK;
    minimumWallCoreTempC = Math.min(minimumWallCoreTempC, wallCoreTempC);
    const qWallToRoomW = halfWallConductanceWPerK * (wallCoreTempC - input.indoorTempC);

    let latticeConductanceWPerK = 0;
    if (!baseline && strategy.kind === 'passive_lattice') latticeConductanceWPerK = latticeOnConductanceWPerK;
    if (hasSwitchableLattice) latticeConductanceWPerK = latticeOpen ? latticeOnConductanceWPerK : latticeOffConductanceWPerK;
    const qLatticeToRoomW = latticeConductanceWPerK * (sinkTempC - input.indoorTempC);
    const exportCapacityW = latticeOpen || strategy.kind === 'passive_lattice'
      ? Math.max(0, latticeOnConductanceWPerK * (input.wasteSourceTempC - sinkTempC))
      : 0;
    const wasteExportW = Math.min(wasteHeatW * strategy.wasteCaptureFraction, exportCapacityW);
    const qWasteToRoomW = wasteHeatW - wasteExportW;
    const leakActuationKWh = hasBladder
      ? input.bladderLeakReinflationsPerDay * input.bladderActuationEnergyWh / 1000 / (24 * 60 / timestepMinutes)
      : 0;
    actuatorHeatToRoomW += leakActuationKWh * 3_600_000 / dtSeconds * input.actuatorHeatReleasedIndoorsFraction;
    const qNetRoomW = qWallToRoomW + qLatticeToRoomW + qWasteToRoomW + actuatorHeatToRoomW;
    const conditioningThermalW = input.mode === 'cooling' ? Math.max(0, qNetRoomW) : Math.max(0, -qNetRoomW);

    if (reporting) {
      energy.wallHeatToRoomKWh += qWallToRoomW * dtSeconds / 3_600_000;
      energy.latticeHeatToRoomKWh += qLatticeToRoomW * dtSeconds / 3_600_000;
      energy.wasteHeatGeneratedKWh += wasteHeatW * dtSeconds / 3_600_000;
      energy.wasteHeatExportedKWh += wasteExportW * dtSeconds / 3_600_000;
      energy.conditioningThermalKWh += conditioningThermalW * dtSeconds / 3_600_000;
      energy.hvacElectricalKWh += conditioningThermalW / input.hvacCop * dtSeconds / 3_600_000;
      if (input.fluidChannel && latticeOpen) energy.pumpElectricalKWh += input.latticePumpPowerW * dtSeconds / 3_600_000;
      if (hasBladder) {
        energy.switchingElectricalKWh += leakActuationKWh;
        energy.actuatorHeatToRoomKWh += leakActuationKWh * input.actuatorHeatReleasedIndoorsFraction;
      }
      if (step % Math.max(1, Math.round(30 / timestepMinutes)) === 0 || step === totalSteps - 1) {
        trace.push({
          hour: round(hour, 2),
          outdoorTempC: round(outdoorTempC, 2),
          wallCoreTempC: round(wallCoreTempC, 2),
          wallRValue: round(currentRValue, 2),
          latticeOpen,
          wasteHeatExportW: round(wasteExportW),
          netRoomHeatW: round(qNetRoomW),
        });
      }
    }
  }

  energy.totalElectricalKWh = energy.hvacElectricalKWh + energy.switchingElectricalKWh + energy.pumpElectricalKWh;
  Object.keys(energy).forEach(key => {
    energy[key as keyof AdaptiveWallEnergy] = round(energy[key as keyof AdaptiveWallEnergy]);
  });
  const manufacturingEnergyKWh = manufacturingEnergy(strategy, input);
  const annualElectricalKWh = energy.totalElectricalKWh * input.conditioningDaysPerYear;
  const lifecycleElectricalAndManufacturingKWh = annualElectricalKWh * input.lifecycleYears + manufacturingEnergyKWh;
  const condensationMarginC = minimumWallCoreTempC - dewPoint;
  const condensationRisk = condensationMarginC < 1;
  const score = lifecycleElectricalAndManufacturingKWh + (condensationRisk ? 1_000_000 : 0);
  return {
    strategy,
    energy,
    manufacturingEnergyKWh: round(manufacturingEnergyKWh),
    annualElectricalKWh: round(annualElectricalKWh),
    lifecycleElectricalAndManufacturingKWh: round(lifecycleElectricalAndManufacturingKWh),
    bladderTransitions,
    latticeTransitions,
    minimumWallCoreTempC: round(minimumWallCoreTempC, 2),
    condensationMarginC: round(condensationMarginC, 2),
    condensationRisk,
    trace,
    score: round(score),
  };
}

function strategies() {
  const result: AdaptiveWallStrategy[] = [];
  const captures = [0, 0.25, 0.5, 0.75, 0.9];
  captures.forEach(capture => result.push({
    id: `passive-lattice-${capture}`,
    label: capture > 0 ? `Passive lattice · export ${capture * 100}% waste target` : 'Passive conductive lattice',
    kind: 'passive_lattice',
    wasteCaptureFraction: capture,
  }));
  captures.forEach(capture => result.push({
    id: `switchable-lattice-${capture}`,
    label: capture > 0 ? `Switchable lattice · export ${capture * 100}% waste target` : 'Switchable microlattice thermal valve',
    kind: 'switchable_lattice',
    wasteCaptureFraction: capture,
  }));
  result.push({ id: 'bladder', label: 'Expandable bladder variable insulation', kind: 'bladder', wasteCaptureFraction: 0 });
  captures.forEach(capture => result.push({
    id: `bladder-lattice-${capture}`,
    label: capture > 0 ? `Bladder + lattice · export ${capture * 100}% waste target` : 'Bladder + switchable microlattice',
    kind: 'bladder_lattice',
    wasteCaptureFraction: capture,
  }));
  return result;
}

export function evaluateAdaptiveWallStrategy(
  strategy: AdaptiveWallStrategy,
  rawInput: AdaptiveWallOptimizationInput = {},
) {
  return simulate(strategy, normalizeInput(rawInput));
}

export function optimizeAdaptiveWall(rawInput: AdaptiveWallOptimizationInput = {}): AdaptiveWallOptimizationResult {
  const input = normalizeInput(rawInput);
  const baselineStrategy: AdaptiveWallStrategy = { id: 'baseline', label: 'Existing static insulated wall', kind: 'bladder', wasteCaptureFraction: 0 };
  const baseline = simulate(baselineStrategy, input, true);
  const candidates = strategies().map(strategy => simulate(strategy, input));
  candidates.sort((a, b) => a.score - b.score || a.energy.totalElectricalKWh - b.energy.totalElectricalKWh);
  const best = candidates[0];
  const dailyHeatReduced = baseline.energy.conditioningThermalKWh - best.energy.conditioningThermalKWh;
  const dailyElectricalSaved = baseline.energy.totalElectricalKWh - best.energy.totalElectricalKWh;
  const annualSaved = baseline.annualElectricalKWh - best.annualElectricalKWh;
  const baselineLifecycle = baseline.annualElectricalKWh * input.lifecycleYears;
  const lifecycleSaved = baselineLifecycle - best.lifecycleElectricalAndManufacturingKWh;
  const qualifies = !best.condensationRisk && dailyElectricalSaved > 0.001 && lifecycleSaved > 0;
  const payback = annualSaved > 0 ? best.manufacturingEnergyKWh / annualSaved : null;
  const verdict = qualifies && dailyHeatReduced > 0
    ? 'reduces_heat_and_energy'
    : dailyElectricalSaved < -0.001 || dailyHeatReduced < -0.001
      ? 'increases_heat_or_energy'
      : 'energy_shift_only';
  const latticeOnConductance = input.latticeMaterialConductivityWmK
    * input.latticeAreaM2 * input.latticeFillFraction / input.latticePathLengthM;

  return {
    wallName: input.wallName,
    mode: input.mode,
    baseline,
    best,
    candidatesEvaluated: candidates.length,
    verdict,
    improvement: {
      qualifiesAsImprovement: qualifies,
      dailyConditioningHeatReducedKWh: round(dailyHeatReduced),
      dailyElectricalSavedKWh: round(dailyElectricalSaved),
      annualElectricalSavedKWh: round(annualSaved),
      electricalSavedPercent: round(dailyElectricalSaved / Math.max(0.001, baseline.energy.totalElectricalKWh) * 100, 2),
      lifecycleEnergySavedKWh: round(lifecycleSaved),
      lifecycleEnergySavedPercent: round(lifecycleSaved / Math.max(1, baselineLifecycle) * 100, 2),
      manufacturingEnergyPaybackYears: payback !== null && Number.isFinite(payback) ? round(payback, 2) : null,
      reason: qualifies
        ? `${best.strategy.label} reduced conditioning energy after switching, pumping and manufacturing energy were counted.`
        : best.condensationRisk
          ? `${best.strategy.label} had the lowest calculated energy but was rejected because the wall-core temperature approached the indoor dew point.`
          : `${best.strategy.label} did not repay its switching, pumping and manufacturing energy; the existing static wall remains the safer energy choice.`,
    },
    physics: {
      baselineWallConductanceWPerK: round(input.wallAreaM2 / input.staticWallRValue),
      latticeOnConductanceWPerK: round(latticeOnConductance),
      latticeOffConductanceWPerK: round(latticeOnConductance * input.latticeOffConductanceFraction),
      indoorDewPointC: round(dewPointC(input.indoorTempC, input.indoorRelativeHumidityPct), 2),
      compressorWasteHeatMustExitEnvelope: input.mode === 'cooling',
    },
    constraints: {
      indoorTempC: input.indoorTempC,
      outdoorLowTempC: input.outdoorLowTempC,
      outdoorHighTempC: input.outdoorHighTempC,
      conditioningDaysPerYear: input.conditioningDaysPerYear,
      lifecycleYears: input.lifecycleYears,
    },
    assumptions: [
      'Heat is conserved. The lattice is a controllable path to a sink, not a heat-destruction mechanism.',
      'A passive conductive lattice spans the insulation continuously and is therefore evaluated as a thermal bridge in both helpful and harmful conditions.',
      'A switchable lattice opens only when the selected sink helps the requested heating/cooling mode or can accept captured waste heat.',
      'Bladder inflation increases wall R-value; deflation lowers it to exploit favourable outdoor conditions. Actuation, leakage reinflation and indoor motor heat are counted.',
      'Compute/compressor waste heat not exported through the lattice remains a room load. In heating mode it can be useful; in cooling mode it must ultimately be rejected outside.',
      'The transient wall core is warmed up for two representative days before the reported day. Moisture screening compares the minimum core temperature with indoor dew point.',
      'Manufacturing energy includes lattice material, bladder membrane and control/actuation hardware. Replace defaults with measured prototype and EPD data.',
      'This is an early feasibility screen. Fire spread, smoke/toxicity, acoustic, structural pressure, puncture, drainage, mould and NCC façade requirements need prototype testing and professional review.',
    ],
  };
}

const radicalInverse = (index: number, base: number) => {
  let value = 0;
  let fraction = 1 / base;
  let cursor = index;
  while (cursor > 0) {
    value += (cursor % base) * fraction;
    cursor = Math.floor(cursor / base);
    fraction /= base;
  }
  return value;
};

const sweepCandidateFrom = (
  result: AdaptiveWallOptimizationResult,
  input: NormalizedInput,
  configurationId: string,
): AdaptiveWallSweepCandidate => ({
  rank: 0,
  configurationId,
  strategy: result.best.strategy,
  verdict: result.verdict,
  qualifiesAsImprovement: result.improvement.qualifiesAsImprovement,
  dailyElectricalSavedKWh: result.improvement.dailyElectricalSavedKWh,
  lifecycleEnergySavedKWh: result.improvement.lifecycleEnergySavedKWh,
  manufacturingEnergyPaybackYears: result.improvement.manufacturingEnergyPaybackYears,
  condensationRisk: result.best.condensationRisk,
  score: result.best.score,
  parameters: {
    latticeAreaM2: round(input.latticeAreaM2),
    latticeMaterialConductivityWmK: round(input.latticeMaterialConductivityWmK, 4),
    latticeFillFraction: round(input.latticeFillFraction, 4),
    latticePathLengthM: round(input.latticePathLengthM, 4),
    latticeOffConductanceFraction: round(input.latticeOffConductanceFraction, 4),
    fluidChannel: input.fluidChannel,
    inflatedRValue: round(input.inflatedRValue, 2),
    deflatedRValue: round(input.deflatedRValue, 2),
    bladderActuationEnergyWh: round(input.bladderActuationEnergyWh, 2),
    bladderLeakReinflationsPerDay: round(input.bladderLeakReinflationsPerDay, 3),
  },
});

/**
 * Search wall geometry and actuator parameters as well as controller strategy.
 * A low-discrepancy deterministic sweep avoids both random-repeat behaviour and
 * an impractically large Cartesian grid. Climate, comfort and manufacturing
 * intensity remain tied to the selected room; the design variables are free.
 */
export function discoverAdaptiveWall(
  rawInput: AdaptiveWallOptimizationInput = {},
  parameterSetCount = 72,
): AdaptiveWallOptimizationResult {
  const base = normalizeInput(rawInput);
  const inputs: NormalizedInput[] = [base];
  const count = clamp(Math.round(parameterSetCount), 12, 160);
  for (let index = 1; index < count; index += 1) {
    const latticeAreaFraction = 0.25 + radicalInverse(index, 2) * 0.7;
    const conductivity = Math.exp(Math.log(0.04) + radicalInverse(index, 3) * (Math.log(3.2) - Math.log(0.04)));
    const fillFraction = 0.008 + radicalInverse(index, 5) * 0.13;
    const pathLengthM = 0.045 + radicalInverse(index, 7) * 0.24;
    const inflatedRValue = Math.max(base.staticWallRValue + 0.6, 3.2 + radicalInverse(index, 11) * 5.8);
    const deflatedRValue = 0.35 + radicalInverse(index, 13) * 1.35;
    inputs.push(normalizeInput({
      ...base,
      latticeAreaM2: base.wallAreaM2 * latticeAreaFraction,
      latticeMaterialConductivityWmK: conductivity,
      latticeFillFraction: fillFraction,
      latticePathLengthM: pathLengthM,
      latticeOffConductanceFraction: 0.004 + radicalInverse(index, 17) * 0.1,
      latticeSwitchEnergyWh: 2 + radicalInverse(index, 19) * 35,
      latticePumpPowerW: 8 + radicalInverse(index, 23) * 85,
      fluidChannel: index % 3 === 0,
      inflatedRValue,
      deflatedRValue: Math.min(deflatedRValue, inflatedRValue - 0.2),
      bladderActuationEnergyWh: 4 + radicalInverse(index, 29) * 85,
      bladderLeakReinflationsPerDay: 0.01 + radicalInverse(index, 31) * 0.7,
      actuatorHeatReleasedIndoorsFraction: 0.03 + radicalInverse(index, 37) * 0.32,
    }));
  }

  const evaluated = inputs.map((input, index) => {
    const result = optimizeAdaptiveWall(input);
    return { input, result, compact: sweepCandidateFrom(result, input, `auto-${String(index + 1).padStart(3, '0')}`) };
  });
  evaluated.sort((a, b) => a.result.best.score - b.result.best.score
    || b.result.improvement.lifecycleEnergySavedKWh - a.result.improvement.lifecycleEnergySavedKWh);

  // Keep the shortlist meaningfully diverse instead of returning tiny numeric
  // variations of one configuration eight times.
  const shortlist: AdaptiveWallSweepCandidate[] = [];
  const signatures = new Set<string>();
  for (const entry of evaluated) {
    const p = entry.compact.parameters;
    const signature = [
      entry.compact.strategy.kind,
      p.fluidChannel ? 'fluid' : 'solid',
      Math.round(p.latticeAreaM2 / Math.max(1, base.wallAreaM2) * 4),
      Math.round(p.inflatedRValue),
    ].join(':');
    if (signatures.has(signature) && shortlist.length < 4) continue;
    signatures.add(signature);
    shortlist.push({ ...entry.compact, rank: shortlist.length + 1 });
    if (shortlist.length >= 8) break;
  }
  const winner = evaluated[0];
  const dailyValues = evaluated.map(entry => entry.result.improvement.dailyElectricalSavedKWh);
  const lifecycleValues = evaluated.map(entry => entry.result.improvement.lifecycleEnergySavedKWh);
  return {
    ...winner.result,
    candidatesEvaluated: evaluated.length * strategies().length,
    sweep: {
      mode: 'automatic_parameter_discovery',
      parameterSetsEvaluated: evaluated.length,
      strategyEvaluations: evaluated.length * strategies().length,
      automaticallySwept: [
        'lattice coverage', 'material conductivity', 'solid fill fraction', 'heat-path length',
        'closed-state leakage', 'solid vs fluid channel', 'inflated/deflated R-value',
        'switching energy', 'bladder actuation energy', 'leak reinflation rate', 'indoor actuator heat',
      ],
      winningInput: winner.compact.parameters,
      rankedCandidates: shortlist,
      resultRanges: {
        dailyElectricalSavedKWh: { minimum: round(Math.min(...dailyValues)), maximum: round(Math.max(...dailyValues)) },
        lifecycleEnergySavedKWh: { minimum: round(Math.min(...lifecycleValues)), maximum: round(Math.max(...lifecycleValues)) },
      },
    },
  };
}
