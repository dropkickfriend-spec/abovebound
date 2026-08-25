export interface HeightAirflowInput {
  roomId?: string;
  roomName?: string;
  ceilingHeightM: number;
  floorAreaM2: number;
  roomTempC: number;
  outsideTempC: number;
  supplyTempC: number;
  intakeHeightM: number;
  exhaustHeightM: number;
  designFlowM3s: number;
  ventDiameterM: number;
  powered: boolean;
  internalHeatW?: number;
  layerCount?: number;
}

export interface HeightAirflowLayer {
  zBottomM: number;
  zCenterM: number;
  zTopM: number;
  temperatureC: number;
  verticalVelocityMs: number;
  relativePressurePa: number;
}

export interface HeightAirflowProfile {
  roomId: string;
  roomName: string;
  ceilingHeightM: number;
  intakeHeightM: number;
  exhaustHeightM: number;
  heightSeparationM: number;
  neutralPressureHeightM: number;
  stackPressurePa: number;
  stackFlowM3s: number;
  effectiveFlowM3s: number;
  airChangesPerHour: number;
  displacementEffectiveness: number;
  stratificationC: number;
  shortCircuitRisk: boolean;
  reverseStackRisk: boolean;
  layers: HeightAirflowLayer[];
}

export interface HeightAirflowSweepCandidate {
  rank: number;
  intakeHeightM: number;
  exhaustHeightM: number;
  designFlowM3s: number;
  ventDiameterM: number;
  powered: boolean;
  estimatedFanPowerW: number;
  usefulConditioningW: number;
  unmetConditioningW: number;
  objectiveScore: number;
  profile: HeightAirflowProfile;
}

export interface HeightAirflowSweepResult {
  roomId: string;
  roomName: string;
  mode: 'heating' | 'cooling';
  parameterSetsEvaluated: number;
  best: HeightAirflowSweepCandidate;
  rankedCandidates: HeightAirflowSweepCandidate[];
  automaticallySwept: string[];
}

export interface HeightAirflowSweepInput {
  roomId?: string;
  roomName?: string;
  mode: 'heating' | 'cooling';
  ceilingHeightM: number;
  floorAreaM2: number;
  roomTempC: number;
  targetTempC: number;
  outsideTempC: number;
  hvacSupplyTempC: number;
  internalHeatW?: number;
  envelopeLoadW?: number;
}

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const round = (value: number, digits = 4) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

/**
 * Resolve the vertical part of room airflow that a plan-view CFD field cannot
 * represent. Stack pressure is calculated from the hydrostatic density
 * difference across the actual intake/exhaust height separation. The returned
 * layers are a compact displacement-ventilation model used by V12 and the 3D
 * cutaway; they are not a replacement for commissioned CFD.
 */
export function calculateHeightAwareAirflow(raw: HeightAirflowInput): HeightAirflowProfile {
  const ceilingHeightM = clamp(Number(raw.ceilingHeightM || 2.7), 1.8, 12);
  const floorAreaM2 = clamp(Number(raw.floorAreaM2 || 20), 2, 2000);
  const roomTempC = clamp(Number(raw.roomTempC || 22), -20, 70);
  const outsideTempC = clamp(Number(raw.outsideTempC || 20), -50, 70);
  const supplyTempC = clamp(Number(raw.supplyTempC || roomTempC), -30, 80);
  const intakeHeightM = clamp(Number(raw.intakeHeightM || 0.15), 0.05, ceilingHeightM - 0.05);
  const exhaustHeightM = clamp(Number(raw.exhaustHeightM || ceilingHeightM - 0.15), 0.05, ceilingHeightM - 0.05);
  const heightSeparationM = Math.abs(exhaustHeightM - intakeHeightM);
  const direction = exhaustHeightM >= intakeHeightM ? 1 : -1;
  const designFlowM3s = clamp(Number(raw.designFlowM3s || 0), 0, 20);
  const ventDiameterM = clamp(Number(raw.ventDiameterM || 0.15), 0.04, 2);
  const internalHeatW = clamp(Number(raw.internalHeatW || 0), 0, 500_000);
  const layerCount = clamp(Math.round(Number(raw.layerCount || 12)), 4, 40);
  const absoluteRoomTempK = roomTempC + 273.15;
  const airDensityKgM3 = 1.204;
  const gravityMs2 = 9.80665;
  const dischargeCoefficient = 0.62;
  const areaM2 = Math.PI * (ventDiameterM / 2) ** 2;

  // Positive pressure supports flow from the declared intake toward exhaust.
  const stackPressurePa = airDensityKgM3 * gravityMs2 * heightSeparationM
    * (roomTempC - outsideTempC) / absoluteRoomTempK * direction;
  const stackFlowMagnitudeM3s = dischargeCoefficient * areaM2
    * Math.sqrt(2 * Math.abs(stackPressurePa) / airDensityKgM3);
  const signedStackFlowM3s = Math.sign(stackPressurePa) * stackFlowMagnitudeM3s;
  const reverseStackRisk = !raw.powered && signedStackFlowM3s < -0.0001;
  const effectiveFlowM3s = raw.powered
    ? Math.max(0, designFlowM3s + signedStackFlowM3s)
    : Math.abs(signedStackFlowM3s);
  const heightFraction = heightSeparationM / ceilingHeightM;
  const shortCircuitRisk = heightFraction < 0.25;
  const displacementEffectiveness = clamp(0.35 + heightFraction * 0.75, 0.35, 1);
  const roomVolumeM3 = floorAreaM2 * ceilingHeightM;
  const airChangesPerHour = effectiveFlowM3s * 3600 / roomVolumeM3;
  const neutralPressureHeightM = (intakeHeightM + exhaustHeightM) / 2;

  // Internal gains and low-level cool supply create a warm upper layer. High
  // supply or reversed flow mixes that advantage away. Bound the screening
  // gradient to avoid claiming precision beyond this reduced-order model.
  const supplyBuoyancy = (roomTempC - supplyTempC) * (1 - intakeHeightM / ceilingHeightM) * 0.35;
  const internalGainGradient = internalHeatW / Math.max(80, floorAreaM2 * 180) * ceilingHeightM;
  const outsideGradient = (roomTempC - outsideTempC) * 0.06 * heightFraction;
  const mixingReduction = 1 / (1 + airChangesPerHour * 0.2);
  const stratificationC = clamp(
    (internalGainGradient + supplyBuoyancy + outsideGradient) * mixingReduction,
    -6,
    8,
  );
  const layerHeightM = ceilingHeightM / layerCount;
  const naturalDirection = Math.sign(signedStackFlowM3s) || direction;
  const actualFlowDirection = raw.powered ? direction : naturalDirection;
  const bulkVerticalVelocityMs = effectiveFlowM3s / floorAreaM2 * actualFlowDirection;
  const layers: HeightAirflowLayer[] = [];

  for (let index = 0; index < layerCount; index += 1) {
    const zBottomM = index * layerHeightM;
    const zTopM = (index + 1) * layerHeightM;
    const zCenterM = (zBottomM + zTopM) / 2;
    const normalizedHeight = zCenterM / ceilingHeightM;
    const intakeInfluence = Math.exp(-Math.abs(zCenterM - intakeHeightM) / Math.max(0.12, ceilingHeightM * 0.16));
    const baseTemperatureC = roomTempC + stratificationC * (normalizedHeight - 0.5);
    const temperatureC = baseTemperatureC + (supplyTempC - baseTemperatureC)
      * intakeInfluence * clamp(airChangesPerHour / 8, 0, 0.7);
    const pathVelocityFactor = 0.45 + 0.75 * Math.sin(Math.PI * normalizedHeight) ** 2;
    const relativePressurePa = stackPressurePa
      * (zCenterM - neutralPressureHeightM) / Math.max(0.1, heightSeparationM);
    layers.push({
      zBottomM: round(zBottomM),
      zCenterM: round(zCenterM),
      zTopM: round(zTopM),
      temperatureC: round(temperatureC, 3),
      verticalVelocityMs: round(bulkVerticalVelocityMs * pathVelocityFactor, 5),
      relativePressurePa: round(relativePressurePa, 4),
    });
  }

  return {
    roomId: raw.roomId || 'room',
    roomName: raw.roomName || 'Room',
    ceilingHeightM: round(ceilingHeightM),
    intakeHeightM: round(intakeHeightM),
    exhaustHeightM: round(exhaustHeightM),
    heightSeparationM: round(heightSeparationM),
    neutralPressureHeightM: round(neutralPressureHeightM),
    stackPressurePa: round(stackPressurePa, 4),
    stackFlowM3s: round(signedStackFlowM3s, 5),
    effectiveFlowM3s: round(effectiveFlowM3s, 5),
    airChangesPerHour: round(airChangesPerHour, 3),
    displacementEffectiveness: round(displacementEffectiveness, 3),
    stratificationC: round(stratificationC, 3),
    shortCircuitRisk,
    reverseStackRisk,
    layers,
  };
}

/**
 * Deterministically sweep the parameters that control vertical room airflow.
 * This is intentionally bounded: it is fast enough to rerun whenever climate
 * or room geometry changes, but broad enough to compare natural stack flow,
 * powered displacement flow, vent heights, diameters and flow rates.
 */
export function optimizeHeightAwareAirflow(raw: HeightAirflowSweepInput): HeightAirflowSweepResult {
  const ceilingHeightM = clamp(Number(raw.ceilingHeightM || 2.7), 1.8, 12);
  const floorAreaM2 = clamp(Number(raw.floorAreaM2 || 20), 2, 2000);
  const roomTempC = clamp(Number(raw.roomTempC || 22), -20, 70);
  const targetTempC = clamp(Number(raw.targetTempC || 22), -20, 70);
  const outsideTempC = clamp(Number(raw.outsideTempC || 20), -50, 70);
  const internalHeatW = clamp(Number(raw.internalHeatW || 0), 0, 500_000);
  const envelopeLoadW = clamp(Number(raw.envelopeLoadW || 0), 0, 1_000_000);
  const intakeFractions = [0.06, 0.14, 0.28, 0.48];
  const exhaustFractions = [0.52, 0.72, 0.86, 0.94];
  const flowRates = [0.025, 0.05, 0.08, 0.12];
  const diameters = [0.1, 0.15, 0.2, 0.25];
  const candidates: HeightAirflowSweepCandidate[] = [];
  const modeDemandW = raw.mode === 'cooling'
    ? Math.max(0, internalHeatW + envelopeLoadW)
    : Math.max(0, envelopeLoadW - internalHeatW * 0.65);

  for (const powered of [false, true]) {
    for (const intakeFraction of intakeFractions) {
      for (const exhaustFraction of exhaustFractions) {
        for (const designFlowM3s of flowRates) {
          for (const ventDiameterM of diameters) {
            const supplyTempC = powered ? raw.hvacSupplyTempC : outsideTempC;
            const profile = calculateHeightAwareAirflow({
              roomId: raw.roomId,
              roomName: raw.roomName,
              ceilingHeightM,
              floorAreaM2,
              roomTempC,
              outsideTempC,
              supplyTempC,
              intakeHeightM: ceilingHeightM * intakeFraction,
              exhaustHeightM: ceilingHeightM * exhaustFraction,
              designFlowM3s,
              ventDiameterM,
              powered,
              internalHeatW,
            });
            const usefulDeltaC = raw.mode === 'cooling'
              ? Math.max(0, roomTempC - supplyTempC)
              : Math.max(0, supplyTempC - roomTempC);
            const usefulConditioningW = profile.effectiveFlowM3s * 1.204 * 1005
              * usefulDeltaC * profile.displacementEffectiveness;
            const unmetConditioningW = Math.max(0, modeDemandW - usefulConditioningW);
            const overConditioningW = Math.max(0, usefulConditioningW - modeDemandW);
            const estimatedFanPressurePa = powered
              ? 35 + 900 * profile.effectiveFlowM3s ** 2 + 12 * (0.15 / ventDiameterM) ** 2
              : 0;
            const estimatedFanPowerW = powered
              ? profile.effectiveFlowM3s * estimatedFanPressurePa / 0.58
              : 0;
            const comfortOffsetPenalty = Math.abs(roomTempC - targetTempC) * unmetConditioningW * 0.15;
            const airChangePenalty = profile.airChangesPerHour < 0.35
              ? (0.35 - profile.airChangesPerHour) * 220
              : profile.airChangesPerHour > 8 ? (profile.airChangesPerHour - 8) * 35 : 0;
            const geometryEnergyProxy = ventDiameterM ** 2 * 90
              + (profile.heightSeparationM / ceilingHeightM) * 4;
            const objectiveScore = unmetConditioningW * 2.5
              + overConditioningW * 0.18
              + estimatedFanPowerW * 9
              + Math.abs(profile.stratificationC) * 38
              + airChangePenalty
              + geometryEnergyProxy
              + comfortOffsetPenalty
              + (profile.shortCircuitRisk ? 600 : 0)
              + (profile.reverseStackRisk ? 900 : 0);
            candidates.push({
              rank: 0,
              intakeHeightM: round(profile.intakeHeightM),
              exhaustHeightM: round(profile.exhaustHeightM),
              designFlowM3s: round(designFlowM3s, 4),
              ventDiameterM: round(ventDiameterM, 3),
              powered,
              estimatedFanPowerW: round(estimatedFanPowerW, 2),
              usefulConditioningW: round(usefulConditioningW, 1),
              unmetConditioningW: round(unmetConditioningW, 1),
              objectiveScore: round(objectiveScore, 2),
              profile,
            });
          }
        }
      }
    }
  }

  candidates.sort((a, b) => a.objectiveScore - b.objectiveScore
    || a.estimatedFanPowerW - b.estimatedFanPowerW
    || b.profile.displacementEffectiveness - a.profile.displacementEffectiveness);
  const rankedCandidates = candidates.slice(0, 8).map((candidate, index) => ({ ...candidate, rank: index + 1 }));
  return {
    roomId: raw.roomId || 'room',
    roomName: raw.roomName || 'Room',
    mode: raw.mode,
    parameterSetsEvaluated: candidates.length,
    best: rankedCandidates[0],
    rankedCandidates,
    automaticallySwept: ['intake height', 'exhaust height', 'natural vs powered flow', 'airflow rate', 'vent diameter'],
  };
}

export function sampleHeightTemperature(profile: HeightAirflowProfile | undefined, heightM: number, fallbackC: number) {
  if (!profile || profile.layers.length === 0) return fallbackC;
  const clampedHeight = clamp(heightM, 0, profile.ceilingHeightM);
  return profile.layers.reduce((nearest, layer) => (
    Math.abs(layer.zCenterM - clampedHeight) < Math.abs(nearest.zCenterM - clampedHeight) ? layer : nearest
  )).temperatureC;
}
