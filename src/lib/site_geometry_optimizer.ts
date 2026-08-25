export type HouseForm = 'rectangle' | 'elongated' | 'l_shape' | 'courtyard';
export type StructuralSystem = 'braced_timber' | 'reinforced_masonry' | 'steel_frame';
export type ResilientShell = 'standard' | 'enhanced' | 'hardened';
export type BushfireAttackLevel = 'none' | 'BAL-12.5' | 'BAL-19' | 'BAL-29' | 'BAL-40' | 'BAL-FZ';

export interface SiteLocationProfile {
  name: string;
  latitudeDeg: number;
  longitudeDeg: number;
  averageDailySolarMJm2: number;
  summerDesignTempC: number;
  winterDesignTempC: number;
  heatingDegreeDays: number;
  coolingDegreeDays: number;
}

export interface SiteResilienceRequirements {
  designWindSpeedMs: number;
  floodFloorElevationM: number;
  bushfireAttackLevel: BushfireAttackLevel;
  seismicClass: 'low' | 'moderate' | 'high';
  snowLoadKPa: number;
  minWallRValue: number;
  maxWindowToWallRatio: number;
  minRoofPitchDeg: number;
  maxRoofPitchDeg: number;
  maxUnsupportedSpanM: number;
  minimumSetbackM: number;
}

export interface SiteHouseDesign {
  form: HouseForm;
  orientationDeg: number;
  floorAreaM2: number;
  widthM: number;
  depthM: number;
  ceilingHeightM: number;
  wingRatio: number;
  eaveEquatorM: number;
  eaveOtherM: number;
  roofPitchDeg: number;
  equatorGlazingRatio: number;
  otherGlazingRatio: number;
  floorElevationM: number;
  structuralSystem: StructuralSystem;
  resilientShell: ResilientShell;
}

export interface SiteRoomGeometry {
  id: string;
  name: string;
  role: 'living' | 'kitchen' | 'bedroom' | 'bathroom' | 'service';
  x: number;
  y: number;
  width: number;
  depth: number;
  targetTempC: number;
  internalLoadW: number;
  windowOrientation: 'N' | 'S' | 'E' | 'W';
}

export interface FootprintPoint { x: number; y: number }

export interface SunPathPoint {
  label: string;
  dayOfYear: number;
  hour: number;
  altitudeDeg: number;
  azimuthDeg: number;
}

export interface ComplianceCheck {
  id: string;
  label: string;
  passed: boolean;
  value: string;
  requirement: string;
}

export interface EvaluatedSiteHouseDesign {
  design: SiteHouseDesign;
  footprintPolygons: FootprintPoint[][];
  rooms: SiteRoomGeometry[];
  perimeterM: number;
  externalWallAreaM2: number;
  windowAreaM2: number;
  surfaceToFloorRatio: number;
  solar: {
    annualIncidentOnWindowsKWh: number;
    annualTransmittedKWh: number;
    annualSelfShadedKWh: number;
    annualEaveShadedKWh: number;
    summerShadePercent: number;
    winterSolarAccessPercent: number;
    heatingSolarBenefitKWh: number;
    coolingSolarPenaltyKWh: number;
    equatorDirection: 'N' | 'S';
  };
  operational: {
    envelopeHeatingKWh: number;
    envelopeCoolingKWh: number;
    naturalVentilationCreditKWh: number;
    annualHeatingElectricalKWh: number;
    annualCoolingElectricalKWh: number;
    annualTotalKWh: number;
  };
  manufacturing: {
    envelopeKWh: number;
    roofAndEavesKWh: number;
    foundationKWh: number;
    resilienceKWh: number;
    complexityKWh: number;
    totalKWh: number;
    difficultyScore: number;
  };
  complianceChecks: ComplianceCheck[];
  feasible: boolean;
  totalLifecycleEnergyKWh: number;
  score: number;
}

export interface SiteGeometryOptimizationInput {
  location?: Partial<SiteLocationProfile>;
  requirements?: Partial<SiteResilienceRequirements>;
  targetFloorAreaM2?: number;
  minFloorAreaM2?: number;
  maxFloorAreaM2?: number;
  lotWidthM?: number;
  lotDepthM?: number;
  targetIndoorTempC?: number;
  wallRValue?: number;
  roofRValue?: number;
  floorRValue?: number;
  windowUValue?: number;
  windowSHGC?: number;
  airLeakageACH?: number;
  heatingCOP?: number;
  coolingCOP?: number;
  lifecycleYears?: number;
  baseline?: Partial<SiteHouseDesign>;
  /** Trusted, previously successful designs used to warm-start the local search. */
  learnedDesigns?: SiteHouseDesign[];
  iterations?: number;
  seed?: number;
}

export interface SiteGeometryOptimizationResult {
  location: SiteLocationProfile;
  requirements: SiteResilienceRequirements;
  baseline: EvaluatedSiteHouseDesign;
  best: EvaluatedSiteHouseDesign;
  sunPath: SunPathPoint[];
  candidatesEvaluated: number;
  improvement: {
    qualifiesAsImprovement: boolean;
    annualOperationalEnergySavedKWh: number;
    manufacturingEnergyDifferenceKWh: number;
    lifecycleEnergySavedKWh: number;
    lifecycleEnergySavedPercent: number;
    energyPaybackYears: number | null;
    reason: string;
  };
  assumptions: string[];
  learning?: {
    mode: 'anonymous_aggregate';
    priorDesignsUsed: number;
    sharedDesignsAvailable: number;
    exactLocationShared: false;
  };
}

export const SITE_LOCATION_PRESETS: Record<string, SiteLocationProfile> = {
  bendigo: { name: 'Bendigo, Victoria', latitudeDeg: -36.76, longitudeDeg: 144.28, averageDailySolarMJm2: 17.2, summerDesignTempC: 40, winterDesignTempC: 1, heatingDegreeDays: 1700, coolingDegreeDays: 360 },
  melbourne: { name: 'Melbourne, Victoria', latitudeDeg: -37.81, longitudeDeg: 144.96, averageDailySolarMJm2: 15.4, summerDesignTempC: 40, winterDesignTempC: 3, heatingDegreeDays: 1500, coolingDegreeDays: 400 },
  sydney: { name: 'Sydney, New South Wales', latitudeDeg: -33.87, longitudeDeg: 151.21, averageDailySolarMJm2: 16.8, summerDesignTempC: 35, winterDesignTempC: 6, heatingDegreeDays: 900, coolingDegreeDays: 800 },
  brisbane: { name: 'Brisbane, Queensland', latitudeDeg: -27.47, longitudeDeg: 153.03, averageDailySolarMJm2: 18.2, summerDesignTempC: 34, winterDesignTempC: 8, heatingDegreeDays: 400, coolingDegreeDays: 1800 },
  darwin: { name: 'Darwin, Northern Territory', latitudeDeg: -12.46, longitudeDeg: 130.84, averageDailySolarMJm2: 21.2, summerDesignTempC: 35, winterDesignTempC: 19, heatingDegreeDays: 0, coolingDegreeDays: 3200 },
  alice_springs: { name: 'Alice Springs, Northern Territory', latitudeDeg: -23.7, longitudeDeg: 133.88, averageDailySolarMJm2: 22.9, summerDesignTempC: 42, winterDesignTempC: 2, heatingDegreeDays: 800, coolingDegreeDays: 2500 },
  hobart: { name: 'Hobart, Tasmania', latitudeDeg: -42.88, longitudeDeg: 147.33, averageDailySolarMJm2: 13.2, summerDesignTempC: 30, winterDesignTempC: 1, heatingDegreeDays: 2200, coolingDegreeDays: 120 },
  custom: { name: 'Custom site', latitudeDeg: -36.76, longitudeDeg: 144.28, averageDailySolarMJm2: 17.2, summerDesignTempC: 38, winterDesignTempC: 2, heatingDegreeDays: 1500, coolingDegreeDays: 500 },
};

export const DEFAULT_SITE_REQUIREMENTS: SiteResilienceRequirements = {
  designWindSpeedMs: 40,
  floodFloorElevationM: 0,
  bushfireAttackLevel: 'none',
  seismicClass: 'low',
  snowLoadKPa: 0,
  minWallRValue: 2.8,
  maxWindowToWallRatio: 0.32,
  minRoofPitchDeg: 15,
  maxRoofPitchDeg: 45,
  maxUnsupportedSpanM: 8,
  minimumSetbackM: 1.5,
};

interface NormalizedInput extends Required<Omit<SiteGeometryOptimizationInput, 'location' | 'requirements' | 'baseline' | 'learnedDesigns'>> {
  location: SiteLocationProfile;
  requirements: SiteResilienceRequirements;
  baseline: SiteHouseDesign;
  learnedDesigns: SiteHouseDesign[];
}

interface SolarSample {
  month: number;
  dayOfYear: number;
  hour: number;
  altitudeRad: number;
  azimuthRad: number;
  horizontalEnergyKWhM2: number;
  season: 'summer' | 'winter' | 'shoulder';
}

interface FacadeSegment {
  a: FootprintPoint;
  b: FootprintPoint;
  length: number;
  normalAzimuthRad: number;
}

const DEG = Math.PI / 180;
const round = (value: number, digits = 2) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const angularDifference = (a: number, b: number) => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI);

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

export function calculateSolarPosition(latitudeDeg: number, dayOfYear: number, solarHour: number) {
  const latitude = latitudeDeg * DEG;
  const declination = 23.45 * DEG * Math.sin((360 / 365 * (284 + dayOfYear)) * DEG);
  const hourAngle = (solarHour - 12) * 15 * DEG;
  const up = Math.sin(latitude) * Math.sin(declination)
    + Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle);
  const altitudeRad = Math.asin(clamp(up, -1, 1));
  const east = -Math.cos(declination) * Math.sin(hourAngle);
  const north = Math.cos(latitude) * Math.sin(declination)
    - Math.sin(latitude) * Math.cos(declination) * Math.cos(hourAngle);
  const azimuthRad = (Math.atan2(east, north) + Math.PI * 2) % (Math.PI * 2);
  return { altitudeRad, azimuthRad };
}

function extraterrestrialDailyFactor(latitudeDeg: number, dayOfYear: number) {
  const latitude = latitudeDeg * DEG;
  const declination = 23.45 * DEG * Math.sin((360 / 365 * (284 + dayOfYear)) * DEG);
  const cosSunset = clamp(-Math.tan(latitude) * Math.tan(declination), -1, 1);
  const sunset = Math.acos(cosSunset);
  return Math.max(0.05,
    sunset * Math.sin(latitude) * Math.sin(declination)
    + Math.cos(latitude) * Math.cos(declination) * Math.sin(sunset));
}

function buildSolarSamples(location: SiteLocationProfile): SolarSample[] {
  const monthDays = [17, 47, 75, 105, 135, 162, 198, 228, 258, 288, 318, 344];
  const rawFactors = monthDays.map(day => extraterrestrialDailyFactor(location.latitudeDeg, day) ** 0.72);
  const meanFactor = rawFactors.reduce((sum, value) => sum + value, 0) / rawFactors.length;
  const annualDailyKWhM2 = location.averageDailySolarMJm2 / 3.6;
  const southern = location.latitudeDeg < 0;
  const samples: SolarSample[] = [];

  monthDays.forEach((dayOfYear, monthIndex) => {
    const monthlyDailyKWhM2 = annualDailyKWhM2 * rawFactors[monthIndex] / meanFactor;
    const daylight = [] as { hour: number; altitudeRad: number; azimuthRad: number; weight: number }[];
    for (let hour = 5.5; hour <= 19.5; hour += 1) {
      const position = calculateSolarPosition(location.latitudeDeg, dayOfYear, hour);
      if (position.altitudeRad <= 0) continue;
      daylight.push({ hour, ...position, weight: Math.sin(position.altitudeRad) });
    }
    const weightTotal = daylight.reduce((sum, item) => sum + item.weight, 0) || 1;
    const month = monthIndex + 1;
    const isSummer = southern ? [12, 1, 2].includes(month) : [6, 7, 8].includes(month);
    const isWinter = southern ? [6, 7, 8].includes(month) : [12, 1, 2].includes(month);
    for (const item of daylight) {
      samples.push({
        month,
        dayOfYear,
        hour: item.hour,
        altitudeRad: item.altitudeRad,
        azimuthRad: item.azimuthRad,
        horizontalEnergyKWhM2: monthlyDailyKWhM2 * item.weight / weightTotal * 30.4375,
        season: isSummer ? 'summer' : isWinter ? 'winter' : 'shoulder',
      });
    }
  });
  return samples;
}

function rotatePoint(point: FootprintPoint, orientationDeg: number): FootprintPoint {
  const angle = orientationDeg * DEG;
  return {
    x: point.x * Math.sin(angle) + point.y * Math.cos(angle),
    y: point.x * Math.cos(angle) - point.y * Math.sin(angle),
  };
}

function footprintForDesign(design: SiteHouseDesign): FootprintPoint[][] {
  const w = design.widthM;
  const d = design.depthM;
  const outer: FootprintPoint[] = design.form === 'l_shape'
    ? [
        { x: -w / 2, y: -d / 2 }, { x: w / 2, y: -d / 2 },
        { x: w / 2, y: -d / 2 + d * design.wingRatio },
        { x: -w / 2 + w * design.wingRatio, y: -d / 2 + d * design.wingRatio },
        { x: -w / 2 + w * design.wingRatio, y: d / 2 }, { x: -w / 2, y: d / 2 },
      ]
    : [
        { x: -w / 2, y: -d / 2 }, { x: w / 2, y: -d / 2 },
        { x: w / 2, y: d / 2 }, { x: -w / 2, y: d / 2 },
      ];
  const polygons = [outer];
  if (design.form === 'courtyard') {
    const courtyardScale = clamp(1 - design.wingRatio, 0.35, 0.62);
    const cw = w * courtyardScale;
    const cd = d * courtyardScale;
    polygons.push([
      { x: -cw / 2, y: -cd / 2 }, { x: -cw / 2, y: cd / 2 },
      { x: cw / 2, y: cd / 2 }, { x: cw / 2, y: -cd / 2 },
    ]);
  }
  return polygons.map(polygon => polygon.map(point => rotatePoint(point, design.orientationDeg)));
}

function polygonArea(points: FootprintPoint[]) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

function facadeSegments(polygons: FootprintPoint[][]): FacadeSegment[] {
  const segments: FacadeSegment[] = [];
  for (const polygon of polygons) {
    const orientationSign = polygonArea(polygon) >= 0 ? 1 : -1;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      const nx = orientationSign * dy / Math.max(length, 0.001);
      const ny = orientationSign * -dx / Math.max(length, 0.001);
      segments.push({ a, b, length, normalAzimuthRad: (Math.atan2(nx, ny) + Math.PI * 2) % (Math.PI * 2) });
    }
  }
  return segments;
}

function raySegmentDistance(origin: FootprintPoint, direction: FootprintPoint, a: FootprintPoint, b: FootprintPoint) {
  const sx = b.x - a.x;
  const sy = b.y - a.y;
  const cross = direction.x * sy - direction.y * sx;
  if (Math.abs(cross) < 1e-8) return null;
  const qx = a.x - origin.x;
  const qy = a.y - origin.y;
  const t = (qx * sy - qy * sx) / cross;
  const u = (qx * direction.y - qy * direction.x) / cross;
  return t > 0.08 && u >= 0 && u <= 1 ? t : null;
}

function selfShadowFraction(
  segment: FacadeSegment,
  allSegments: FacadeSegment[],
  sunAzimuthRad: number,
  sunAltitudeRad: number,
  heightM: number,
) {
  const midpoint = { x: (segment.a.x + segment.b.x) / 2, y: (segment.a.y + segment.b.y) / 2 };
  const direction = { x: Math.sin(sunAzimuthRad), y: Math.cos(sunAzimuthRad) };
  let nearest = Infinity;
  for (const blocker of allSegments) {
    if (blocker === segment) continue;
    const distance = raySegmentDistance(midpoint, direction, blocker.a, blocker.b);
    if (distance !== null) nearest = Math.min(nearest, distance);
  }
  if (!Number.isFinite(nearest)) return 0;
  const windowHeights = [0.8, 1.4, 2.0];
  const blocked = windowHeights.filter(z => z + nearest * Math.tan(sunAltitudeRad) < heightM).length;
  return blocked / windowHeights.length;
}

function solarPerformance(design: SiteHouseDesign, input: NormalizedInput, samples: SolarSample[], segments: FacadeSegment[]) {
  const equatorAzimuth = input.location.latitudeDeg < 0 ? 0 : Math.PI;
  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0) || 1;
  let incident = 0;
  let transmitted = 0;
  let selfShaded = 0;
  let eaveShaded = 0;
  let summerAvailable = 0;
  let summerShaded = 0;
  let winterAvailable = 0;
  let winterAdmitted = 0;
  let heatingBenefit = 0;
  let coolingPenalty = 0;

  for (const sample of samples) {
    const horizontal = sample.horizontalEnergyKWhM2;
    const directNormal = horizontal * 0.72 / Math.max(Math.sin(sample.altitudeRad), 0.12);
    const diffuseVertical = horizontal * 0.28 * 0.5;
    for (const segment of segments) {
      const incidence = Math.max(0, Math.cos(sample.altitudeRad)
        * Math.cos(sample.azimuthRad - segment.normalAzimuthRad));
      if (incidence <= 0 && diffuseVertical <= 0) continue;
      const equatorFacing = angularDifference(segment.normalAzimuthRad, equatorAzimuth) <= Math.PI / 3;
      const glazingRatio = equatorFacing ? design.equatorGlazingRatio : design.otherGlazingRatio;
      const windowArea = segment.length * design.ceilingHeightM * glazingRatio;
      const facadeIncident = (directNormal * incidence + diffuseVertical) * windowArea;
      const directShare = directNormal * incidence / Math.max(directNormal * incidence + diffuseVertical, 0.001);
      const eaveDepth = equatorFacing ? design.eaveEquatorM : design.eaveOtherM;
      const horizontalIncidence = Math.max(0.18, Math.cos(sample.azimuthRad - segment.normalAzimuthRad));
      const shadowHeight = eaveDepth * Math.tan(sample.altitudeRad) / horizontalIncidence;
      const eaveShade = clamp(shadowHeight / 1.5, 0, 1) * directShare;
      const selfShade = selfShadowFraction(segment, segments, sample.azimuthRad, sample.altitudeRad, design.ceilingHeightM) * directShare;
      const combinedShade = 1 - (1 - eaveShade) * (1 - selfShade);
      const admitted = facadeIncident * (1 - combinedShade) * input.windowSHGC;

      incident += facadeIncident;
      transmitted += admitted;
      eaveShaded += facadeIncident * eaveShade;
      selfShaded += facadeIncident * (1 - eaveShade) * selfShade;
      if (sample.season === 'summer') {
        summerAvailable += facadeIncident;
        summerShaded += facadeIncident * combinedShade;
        coolingPenalty += admitted;
      } else if (sample.season === 'winter') {
        winterAvailable += facadeIncident;
        winterAdmitted += facadeIncident * (1 - combinedShade);
        heatingBenefit += admitted;
      } else {
        coolingPenalty += admitted * input.location.coolingDegreeDays
          / Math.max(input.location.coolingDegreeDays + input.location.heatingDegreeDays, 1);
        heatingBenefit += admitted * input.location.heatingDegreeDays
          / Math.max(input.location.coolingDegreeDays + input.location.heatingDegreeDays, 1);
      }
    }
  }

  return {
    annualIncidentOnWindowsKWh: incident,
    annualTransmittedKWh: transmitted,
    annualSelfShadedKWh: selfShaded,
    annualEaveShadedKWh: eaveShaded,
    summerShadePercent: summerAvailable > 0 ? summerShaded / summerAvailable * 100 : 0,
    winterSolarAccessPercent: winterAvailable > 0 ? winterAdmitted / winterAvailable * 100 : 0,
    heatingSolarBenefitKWh: heatingBenefit,
    coolingSolarPenaltyKWh: coolingPenalty,
    equatorDirection: input.location.latitudeDeg < 0 ? 'N' as const : 'S' as const,
    totalFacadeLength: totalLength,
  };
}

function systemWindCapacity(system: StructuralSystem) {
  return system === 'braced_timber' ? 50 : system === 'reinforced_masonry' ? 65 : 82;
}

function systemSeismicCapacity(system: StructuralSystem) {
  return system === 'braced_timber' ? 2 : system === 'steel_frame' ? 3 : 1;
}

function shellCapacity(shell: ResilientShell) {
  return shell === 'standard' ? 1 : shell === 'enhanced' ? 2 : 3;
}

function requiredShell(level: BushfireAttackLevel) {
  if (level === 'BAL-40' || level === 'BAL-FZ') return 3;
  if (level === 'BAL-29') return 2;
  return 1;
}

function complianceChecks(design: SiteHouseDesign, input: NormalizedInput, windowToWallRatio: number): ComplianceCheck[] {
  const req = input.requirements;
  const availableWidth = input.lotWidthM - req.minimumSetbackM * 2;
  const availableDepth = input.lotDepthM - req.minimumSetbackM * 2;
  const span = Math.min(design.widthM, design.depthM);
  const requiredSeismic = req.seismicClass === 'high' ? 3 : req.seismicClass === 'moderate' ? 2 : 1;
  return [
    { id: 'site_width', label: 'Lot width and setbacks', passed: design.widthM <= availableWidth, value: `${round(design.widthM, 1)} m`, requirement: `≤ ${round(availableWidth, 1)} m buildable width` },
    { id: 'site_depth', label: 'Lot depth and setbacks', passed: design.depthM <= availableDepth, value: `${round(design.depthM, 1)} m`, requirement: `≤ ${round(availableDepth, 1)} m buildable depth` },
    { id: 'floor_area', label: 'Usable floor area', passed: design.floorAreaM2 >= input.minFloorAreaM2 && design.floorAreaM2 <= input.maxFloorAreaM2, value: `${round(design.floorAreaM2, 1)} m²`, requirement: `${input.minFloorAreaM2}–${input.maxFloorAreaM2} m²` },
    { id: 'wall_r', label: 'Wall insulation', passed: input.wallRValue >= req.minWallRValue, value: `R-${round(input.wallRValue, 1)}`, requirement: `≥ R-${req.minWallRValue}` },
    { id: 'glazing', label: 'Window-to-wall ratio', passed: windowToWallRatio <= req.maxWindowToWallRatio, value: `${round(windowToWallRatio * 100, 1)}%`, requirement: `≤ ${round(req.maxWindowToWallRatio * 100, 0)}%` },
    { id: 'roof_pitch', label: 'Roof pitch range', passed: design.roofPitchDeg >= req.minRoofPitchDeg && design.roofPitchDeg <= req.maxRoofPitchDeg, value: `${round(design.roofPitchDeg, 0)}°`, requirement: `${req.minRoofPitchDeg}–${req.maxRoofPitchDeg}°` },
    { id: 'wind', label: 'Wind/cyclone structure', passed: systemWindCapacity(design.structuralSystem) >= req.designWindSpeedMs, value: `${systemWindCapacity(design.structuralSystem)} m/s capacity`, requirement: `≥ ${req.designWindSpeedMs} m/s design input` },
    { id: 'flood', label: 'Flood floor elevation', passed: design.floorElevationM >= req.floodFloorElevationM, value: `${round(design.floorElevationM, 2)} m`, requirement: `≥ ${req.floodFloorElevationM} m site input` },
    { id: 'bushfire', label: 'Bushfire shell', passed: shellCapacity(design.resilientShell) >= requiredShell(req.bushfireAttackLevel), value: design.resilientShell, requirement: `${req.bushfireAttackLevel} screening level` },
    { id: 'seismic', label: 'Seismic bracing', passed: systemSeismicCapacity(design.structuralSystem) >= requiredSeismic, value: design.structuralSystem.replace(/_/g, ' '), requirement: `${req.seismicClass} site class input` },
    { id: 'span', label: 'Unsupported span', passed: span <= req.maxUnsupportedSpanM, value: `${round(span, 1)} m`, requirement: `≤ ${req.maxUnsupportedSpanM} m` },
    { id: 'snow', label: 'Snow-shedding roof', passed: req.snowLoadKPa < 0.5 || design.roofPitchDeg >= 30, value: `${round(design.roofPitchDeg, 0)}° at ${req.snowLoadKPa} kPa`, requirement: req.snowLoadKPa < 0.5 ? 'No special screening constraint' : '≥ 30° preliminary screening pitch' },
  ];
}

function roomLayout(design: SiteHouseDesign, targetTempC: number, latitudeDeg: number): SiteRoomGeometry[] {
  const w = design.widthM;
  const d = design.depthM;
  const equatorOrientation = latitudeDeg < 0 ? 'N' as const : 'S' as const;
  const room = (id: string, name: string, role: SiteRoomGeometry['role'], x: number, y: number, width: number, depth: number, load: number): SiteRoomGeometry => ({
    id, name, role, x: round(x), y: round(y), width: round(Math.max(1.2, width)), depth: round(Math.max(1.2, depth)),
    targetTempC: role === 'bathroom' ? targetTempC + 2 : role === 'service' ? targetTempC - 3 : targetTempC,
    internalLoadW: load,
    windowOrientation: equatorOrientation,
  });

  if (design.form === 'l_shape') {
    const t = design.wingRatio;
    return [
      room('living', 'Living / Solar Zone', 'living', 0, 0, w * 0.58, d * t, 420),
      room('kitchen', 'Kitchen', 'kitchen', w * 0.58, 0, w * 0.42, d * t, 1000),
      room('bed1', 'Bedroom 1', 'bedroom', 0, d * t, w * t, d * 0.38, 140),
      room('bed2', 'Bedroom 2', 'bedroom', 0, d * (t + 0.38), w * t, d * 0.34, 100),
      room('bath', 'Bathroom / Service', 'bathroom', 0, d * 0.88, w * t, d * 0.12, 220),
    ];
  }
  if (design.form === 'courtyard') {
    const bar = Math.max(1.8, Math.min(w, d) * design.wingRatio / 2);
    return [
      room('living', 'Living / Solar Zone', 'living', 0, 0, w * 0.62, bar, 420),
      room('kitchen', 'Kitchen', 'kitchen', w * 0.62, 0, w * 0.38, bar, 1000),
      room('bed1', 'Bedroom 1', 'bedroom', 0, d - bar, w * 0.5, bar, 140),
      room('bed2', 'Bedroom 2', 'bedroom', w * 0.5, d - bar, w * 0.5, bar, 100),
      room('service_w', 'West Service Wing', 'service', 0, bar, bar, d - bar * 2, 120),
      room('bath_e', 'East Bathroom Wing', 'bathroom', w - bar, bar, bar, d - bar * 2, 220),
    ];
  }
  return [
    room('living', 'Living / Solar Zone', 'living', 0, 0, w * 0.58, d * 0.58, 420),
    room('kitchen', 'Kitchen', 'kitchen', w * 0.58, 0, w * 0.42, d * 0.58, 1000),
    room('bed1', 'Bedroom 1', 'bedroom', 0, d * 0.58, w * 0.38, d * 0.42, 140),
    room('bed2', 'Bedroom 2', 'bedroom', w * 0.38, d * 0.58, w * 0.36, d * 0.42, 100),
    room('bath', 'Bathroom / Service', 'bathroom', w * 0.74, d * 0.58, w * 0.26, d * 0.42, 220),
  ];
}

function normalizeInput(raw: SiteGeometryOptimizationInput): NormalizedInput {
  const location = { ...SITE_LOCATION_PRESETS.custom, ...(raw.location || {}) };
  location.latitudeDeg = clamp(Number(location.latitudeDeg), -66, 66);
  location.longitudeDeg = clamp(Number(location.longitudeDeg), -180, 180);
  location.averageDailySolarMJm2 = clamp(Number(location.averageDailySolarMJm2), 2, 35);
  const requirements = { ...DEFAULT_SITE_REQUIREMENTS, ...(raw.requirements || {}) };
  const targetFloorAreaM2 = clamp(Number(raw.targetFloorAreaM2 ?? 130), 35, 500);
  const minFloorAreaM2 = clamp(Number(raw.minFloorAreaM2 ?? targetFloorAreaM2 * 0.85), 30, targetFloorAreaM2);
  const maxFloorAreaM2 = clamp(Number(raw.maxFloorAreaM2 ?? targetFloorAreaM2 * 1.15), targetFloorAreaM2, 600);
  const wallRValue = clamp(Number(raw.wallRValue ?? Math.max(3, requirements.minWallRValue)), 0.5, 12);
  const baselineInput = raw.baseline || {};
  const baselineArea = clamp(Number(baselineInput.floorAreaM2 ?? targetFloorAreaM2), minFloorAreaM2, maxFloorAreaM2);
  const baselineForm = baselineInput.form || 'rectangle';
  const baselineWing = clamp(Number(baselineInput.wingRatio ?? 0.45), 0.3, 0.62);
  const formFactor = baselineForm === 'l_shape'
    ? 2 * baselineWing - baselineWing ** 2
    : baselineForm === 'courtyard' ? 1 - (1 - baselineWing) ** 2 : 1;
  const width = Number(baselineInput.widthM ?? Math.sqrt(baselineArea * 1.3 / formFactor));
  const depth = Number(baselineInput.depthM ?? baselineArea / Math.max(width * formFactor, 1));
  const baseline: SiteHouseDesign = {
    form: baselineForm,
    orientationDeg: ((Number(baselineInput.orientationDeg ?? 90) % 360) + 360) % 360,
    floorAreaM2: baselineArea,
    widthM: width,
    depthM: depth,
    ceilingHeightM: clamp(Number(baselineInput.ceilingHeightM ?? 2.7), 2.4, 4.2),
    wingRatio: baselineWing,
    eaveEquatorM: clamp(Number(baselineInput.eaveEquatorM ?? 0.45), 0.1, 2.2),
    eaveOtherM: clamp(Number(baselineInput.eaveOtherM ?? 0.3), 0.1, 1.5),
    roofPitchDeg: clamp(Number(baselineInput.roofPitchDeg ?? 22), 5, 60),
    equatorGlazingRatio: clamp(Number(baselineInput.equatorGlazingRatio ?? 0.26), 0.05, 0.45),
    otherGlazingRatio: clamp(Number(baselineInput.otherGlazingRatio ?? 0.14), 0.03, 0.3),
    floorElevationM: clamp(Number(baselineInput.floorElevationM ?? 0.15), 0, 4),
    structuralSystem: baselineInput.structuralSystem || 'braced_timber',
    resilientShell: baselineInput.resilientShell || 'standard',
  };
  return {
    location,
    requirements,
    targetFloorAreaM2,
    minFloorAreaM2,
    maxFloorAreaM2,
    lotWidthM: clamp(Number(raw.lotWidthM ?? 24), 8, 200),
    lotDepthM: clamp(Number(raw.lotDepthM ?? 40), 8, 300),
    targetIndoorTempC: clamp(Number(raw.targetIndoorTempC ?? 22), 16, 28),
    wallRValue,
    roofRValue: clamp(Number(raw.roofRValue ?? 5), 0.8, 18),
    floorRValue: clamp(Number(raw.floorRValue ?? 2.5), 0.4, 12),
    windowUValue: clamp(Number(raw.windowUValue ?? 1.6), 0.3, 7),
    windowSHGC: clamp(Number(raw.windowSHGC ?? 0.45), 0.1, 0.9),
    airLeakageACH: clamp(Number(raw.airLeakageACH ?? 0.6), 0.05, 8),
    heatingCOP: clamp(Number(raw.heatingCOP ?? 3.5), 1, 8),
    coolingCOP: clamp(Number(raw.coolingCOP ?? 3.2), 1, 8),
    lifecycleYears: clamp(Math.round(Number(raw.lifecycleYears ?? 30)), 1, 100),
    iterations: clamp(Math.round(Number(raw.iterations ?? 5200)), 300, 20000),
    seed: Math.round(Number(raw.seed ?? 481516)),
    baseline,
    learnedDesigns: Array.isArray(raw.learnedDesigns) ? raw.learnedDesigns.slice(0, 32) : [],
  };
}

function dimensionsForArea(form: HouseForm, area: number, aspect: number, wingRatio: number) {
  const factor = form === 'l_shape'
    ? 2 * wingRatio - wingRatio ** 2
    : form === 'courtyard' ? 1 - (1 - wingRatio) ** 2 : 1;
  const widthM = Math.sqrt(area * aspect / Math.max(factor, 0.2));
  const depthM = area / Math.max(widthM * factor, 1);
  return { widthM, depthM };
}

function evaluateNormalized(design: SiteHouseDesign, input: NormalizedInput, samples: SolarSample[]): EvaluatedSiteHouseDesign {
  const footprintPolygons = footprintForDesign(design);
  const segments = facadeSegments(footprintPolygons);
  const perimeterM = segments.reduce((sum, segment) => sum + segment.length, 0);
  const externalWallAreaM2 = perimeterM * design.ceilingHeightM;
  const equatorAzimuth = input.location.latitudeDeg < 0 ? 0 : Math.PI;
  const windowAreaM2 = segments.reduce((sum, segment) => {
    const ratio = angularDifference(segment.normalAzimuthRad, equatorAzimuth) <= Math.PI / 3
      ? design.equatorGlazingRatio : design.otherGlazingRatio;
    return sum + segment.length * design.ceilingHeightM * ratio;
  }, 0);
  const windowToWallRatio = windowAreaM2 / Math.max(externalWallAreaM2, 1);
  const solarRaw = solarPerformance(design, input, samples, segments);
  const roofSlopeFactor = 1 / Math.max(Math.cos(design.roofPitchDeg * DEG), 0.5);
  const roofAreaM2 = design.widthM * design.depthM * roofSlopeFactor;
  const floorAreaM2 = design.floorAreaM2;
  const opaqueWallM2 = Math.max(0, externalWallAreaM2 - windowAreaM2);
  const volumeM3 = floorAreaM2 * design.ceilingHeightM;
  const envelopeUA = opaqueWallM2 / input.wallRValue
    + roofAreaM2 / input.roofRValue
    + floorAreaM2 / input.floorRValue
    + windowAreaM2 * input.windowUValue
    + 0.33 * input.airLeakageACH * volumeM3;
  const envelopeHeatingThermalKWh = envelopeUA * input.location.heatingDegreeDays * 24 / 1000;
  const envelopeCoolingThermalKWh = envelopeUA * input.location.coolingDegreeDays * 24 / 1000;
  const formVentilationFactor = design.form === 'elongated' ? 0.16 : design.form === 'l_shape' ? 0.12 : design.form === 'courtyard' ? 0.1 : 0.06;
  const naturalVentilationCreditKWh = envelopeCoolingThermalKWh
    * formVentilationFactor * clamp(windowToWallRatio / 0.22, 0.4, 1.3);
  const annualHeatingElectricalKWh = Math.max(0,
    envelopeHeatingThermalKWh - solarRaw.heatingSolarBenefitKWh * 0.78) / input.heatingCOP;
  const annualCoolingElectricalKWh = Math.max(0,
    envelopeCoolingThermalKWh + solarRaw.coolingSolarPenaltyKWh * 0.9 - naturalVentilationCreditKWh) / input.coolingCOP;
  const annualTotalKWh = annualHeatingElectricalKWh + annualCoolingElectricalKWh;

  const formComplexity = design.form === 'rectangle' ? 1 : design.form === 'elongated' ? 1.04 : design.form === 'l_shape' ? 1.2 : 1.38;
  const envelopeKWh = (opaqueWallM2 * 24 + windowAreaM2 * 105 + floorAreaM2 * 38) * formComplexity;
  const roofAndEavesKWh = roofAreaM2 * 29 * formComplexity
    + perimeterM * (design.eaveEquatorM + design.eaveOtherM) * 18;
  const foundationKWh = floorAreaM2 * (32 + design.floorElevationM * 42);
  const structureMultiplier = design.structuralSystem === 'braced_timber' ? 1 : design.structuralSystem === 'reinforced_masonry' ? 1.45 : 1.7;
  const shellMultiplier = design.resilientShell === 'standard' ? 1 : design.resilientShell === 'enhanced' ? 1.35 : 1.75;
  const resilienceKWh = floorAreaM2 * (
    Math.max(0, input.requirements.designWindSpeedMs - 35) * 0.8 * structureMultiplier
    + input.requirements.snowLoadKPa * 18
    + (shellMultiplier - 1) * 35
    + (input.requirements.seismicClass === 'high' ? 36 : input.requirements.seismicClass === 'moderate' ? 16 : 0)
  );
  const aspect = Math.max(design.widthM, design.depthM) / Math.max(1, Math.min(design.widthM, design.depthM));
  const complexityKWh = floorAreaM2 * (formComplexity - 1) * 45
    + Math.max(0, aspect - 1.8) * 900
    + Math.abs(design.roofPitchDeg - 22) * 12;
  const manufacturingTotal = envelopeKWh + roofAndEavesKWh + foundationKWh + resilienceKWh + complexityKWh;
  const difficultyScore = clamp(
    16 + (formComplexity - 1) * 82 + design.floorElevationM * 10
      + (structureMultiplier - 1) * 20 + (shellMultiplier - 1) * 18
      + Math.max(0, aspect - 1.5) * 12,
    0,
    100,
  );
  const checks = complianceChecks(design, input, windowToWallRatio);
  const feasible = checks.every(check => check.passed);
  const totalLifecycleEnergyKWh = annualTotalKWh * input.lifecycleYears + manufacturingTotal;
  const penalty = feasible ? 0 : 10_000_000 + checks.filter(check => !check.passed).length * 1_000_000;

  return {
    design: {
      ...design,
      orientationDeg: round(design.orientationDeg, 1), floorAreaM2: round(design.floorAreaM2, 1),
      widthM: round(design.widthM, 2), depthM: round(design.depthM, 2), ceilingHeightM: round(design.ceilingHeightM, 2),
      wingRatio: round(design.wingRatio, 3), eaveEquatorM: round(design.eaveEquatorM, 2), eaveOtherM: round(design.eaveOtherM, 2),
      roofPitchDeg: round(design.roofPitchDeg, 1), equatorGlazingRatio: round(design.equatorGlazingRatio, 3),
      otherGlazingRatio: round(design.otherGlazingRatio, 3), floorElevationM: round(design.floorElevationM, 2),
    },
    footprintPolygons: footprintPolygons.map(polygon => polygon.map(point => ({ x: round(point.x, 3), y: round(point.y, 3) }))),
    rooms: roomLayout(design, input.targetIndoorTempC, input.location.latitudeDeg),
    perimeterM: round(perimeterM, 1),
    externalWallAreaM2: round(externalWallAreaM2, 1),
    windowAreaM2: round(windowAreaM2, 1),
    surfaceToFloorRatio: round((externalWallAreaM2 + roofAreaM2 + floorAreaM2) / floorAreaM2, 2),
    solar: {
      annualIncidentOnWindowsKWh: round(solarRaw.annualIncidentOnWindowsKWh, 1),
      annualTransmittedKWh: round(solarRaw.annualTransmittedKWh, 1),
      annualSelfShadedKWh: round(solarRaw.annualSelfShadedKWh, 1),
      annualEaveShadedKWh: round(solarRaw.annualEaveShadedKWh, 1),
      summerShadePercent: round(solarRaw.summerShadePercent, 1),
      winterSolarAccessPercent: round(solarRaw.winterSolarAccessPercent, 1),
      heatingSolarBenefitKWh: round(solarRaw.heatingSolarBenefitKWh, 1),
      coolingSolarPenaltyKWh: round(solarRaw.coolingSolarPenaltyKWh, 1),
      equatorDirection: solarRaw.equatorDirection,
    },
    operational: {
      envelopeHeatingKWh: round(envelopeHeatingThermalKWh, 1),
      envelopeCoolingKWh: round(envelopeCoolingThermalKWh, 1),
      naturalVentilationCreditKWh: round(naturalVentilationCreditKWh, 1),
      annualHeatingElectricalKWh: round(annualHeatingElectricalKWh, 1),
      annualCoolingElectricalKWh: round(annualCoolingElectricalKWh, 1),
      annualTotalKWh: round(annualTotalKWh, 1),
    },
    manufacturing: {
      envelopeKWh: round(envelopeKWh, 1), roofAndEavesKWh: round(roofAndEavesKWh, 1),
      foundationKWh: round(foundationKWh, 1), resilienceKWh: round(resilienceKWh, 1),
      complexityKWh: round(complexityKWh, 1), totalKWh: round(manufacturingTotal, 1),
      difficultyScore: round(difficultyScore, 1),
    },
    complianceChecks: checks,
    feasible,
    totalLifecycleEnergyKWh: round(totalLifecycleEnergyKWh, 1),
    score: round(totalLifecycleEnergyKWh + penalty, 1),
  };
}

function randomDesign(input: NormalizedInput, rng: () => number): SiteHouseDesign {
  const forms: HouseForm[] = ['rectangle', 'elongated', 'l_shape', 'courtyard'];
  const systems: StructuralSystem[] = ['braced_timber', 'reinforced_masonry', 'steel_frame'];
  const shells: ResilientShell[] = ['standard', 'enhanced', 'hardened'];
  const form = forms[Math.floor(rng() * forms.length)];
  const wingRatio = lerp(0.32, 0.58, rng());
  const area = lerp(input.minFloorAreaM2, input.maxFloorAreaM2, rng() ** 1.45);
  const aspect = form === 'elongated' ? lerp(1.8, 3.1, rng()) : lerp(0.72, 1.65, rng());
  const dimensions = dimensionsForArea(form, area, aspect, wingRatio);
  return {
    form,
    orientationDeg: rng() * 360,
    floorAreaM2: area,
    ...dimensions,
    ceilingHeightM: lerp(2.4, 3.4, rng()),
    wingRatio,
    eaveEquatorM: lerp(0.15, 1.8, rng()),
    eaveOtherM: lerp(0.1, 1.1, rng()),
    roofPitchDeg: lerp(8, 52, rng()),
    equatorGlazingRatio: lerp(0.1, 0.4, rng()),
    otherGlazingRatio: lerp(0.04, 0.22, rng()),
    floorElevationM: lerp(0, Math.max(2.2, input.requirements.floodFloorElevationM + 0.5), rng()),
    structuralSystem: systems[Math.floor(rng() * systems.length)],
    resilientShell: shells[Math.floor(rng() * shells.length)],
  };
}

function mutateDesign(best: SiteHouseDesign, input: NormalizedInput, rng: () => number): SiteHouseDesign {
  const switchForm = rng() < 0.08;
  const forms: HouseForm[] = ['rectangle', 'elongated', 'l_shape', 'courtyard'];
  const form = switchForm ? forms[Math.floor(rng() * forms.length)] : best.form;
  const wingRatio = clamp(best.wingRatio + lerp(-0.045, 0.045, rng()), 0.3, 0.62);
  const area = clamp(best.floorAreaM2 * lerp(0.94, 1.06, rng()), input.minFloorAreaM2, input.maxFloorAreaM2);
  const aspect = clamp(best.widthM / Math.max(best.depthM, 0.1) * lerp(0.92, 1.08, rng()), form === 'elongated' ? 1.65 : 0.62, form === 'elongated' ? 3.3 : 1.8);
  const dimensions = dimensionsForArea(form, area, aspect, wingRatio);
  return {
    ...best,
    form,
    floorAreaM2: area,
    ...dimensions,
    orientationDeg: (best.orientationDeg + lerp(-12, 12, rng()) + 360) % 360,
    ceilingHeightM: clamp(best.ceilingHeightM + lerp(-0.08, 0.08, rng()), 2.4, 3.8),
    wingRatio,
    eaveEquatorM: clamp(best.eaveEquatorM + lerp(-0.12, 0.12, rng()), 0.1, 2.2),
    eaveOtherM: clamp(best.eaveOtherM + lerp(-0.1, 0.1, rng()), 0.08, 1.5),
    roofPitchDeg: clamp(best.roofPitchDeg + lerp(-3, 3, rng()), 5, 60),
    equatorGlazingRatio: clamp(best.equatorGlazingRatio + lerp(-0.025, 0.025, rng()), 0.05, 0.45),
    otherGlazingRatio: clamp(best.otherGlazingRatio + lerp(-0.02, 0.02, rng()), 0.03, 0.3),
    floorElevationM: clamp(best.floorElevationM + lerp(-0.12, 0.12, rng()), 0, 4),
  };
}

export function evaluateSiteHouseDesign(design: SiteHouseDesign, rawInput: SiteGeometryOptimizationInput): EvaluatedSiteHouseDesign {
  const input = normalizeInput(rawInput);
  return evaluateNormalized(design, input, buildSolarSamples(input.location));
}

function sunPathSummary(location: SiteLocationProfile): SunPathPoint[] {
  const days = [
    { label: 'June solstice', day: 172 },
    { label: 'Equinox', day: 266 },
    { label: 'December solstice', day: 355 },
  ];
  return days.flatMap(({ label, day }) => [9, 12, 15].map(hour => {
    const position = calculateSolarPosition(location.latitudeDeg, day, hour);
    return {
      label, dayOfYear: day, hour,
      altitudeDeg: round(Math.max(0, position.altitudeRad / DEG), 1),
      azimuthDeg: round(position.azimuthRad / DEG, 1),
    };
  }));
}

export function optimizeSiteGeometry(rawInput: SiteGeometryOptimizationInput = {}): SiteGeometryOptimizationResult {
  const input = normalizeInput(rawInput);
  const samples = buildSolarSamples(input.location);
  const rng = seededRandom(input.seed);
  const baseline = evaluateNormalized(input.baseline, input, samples);
  let best: EvaluatedSiteHouseDesign | null = baseline.feasible ? baseline : null;
  let candidatesEvaluated = 1;

  for (const learnedDesign of input.learnedDesigns) {
    const candidate = evaluateNormalized(learnedDesign, input, samples);
    candidatesEvaluated++;
    if (candidate.feasible && (!best || candidate.score < best.score)) best = candidate;
  }

  for (let i = 0; i < input.iterations; i++) {
    const candidate = evaluateNormalized(randomDesign(input, rng), input, samples);
    candidatesEvaluated++;
    if (candidate.feasible && (!best || candidate.score < best.score)) best = candidate;
  }
  if (!best) best = baseline;
  const refinementIterations = Math.max(300, Math.round(input.iterations * 0.25));
  for (let i = 0; i < refinementIterations; i++) {
    const candidate = evaluateNormalized(mutateDesign(best.design, input, rng), input, samples);
    candidatesEvaluated++;
    if (candidate.feasible && candidate.score < best.score) best = candidate;
  }

  const lifecycleEnergySavedKWh = baseline.totalLifecycleEnergyKWh - best.totalLifecycleEnergyKWh;
  const annualOperationalEnergySavedKWh = baseline.operational.annualTotalKWh - best.operational.annualTotalKWh;
  const manufacturingEnergyDifferenceKWh = best.manufacturing.totalKWh - baseline.manufacturing.totalKWh;
  const qualifiesAsImprovement = best.feasible
    && lifecycleEnergySavedKWh > Math.max(10, baseline.totalLifecycleEnergyKWh * 0.001);
  const energyPaybackYears = manufacturingEnergyDifferenceKWh > 0 && annualOperationalEnergySavedKWh > 0
    ? manufacturingEnergyDifferenceKWh / annualOperationalEnergySavedKWh
    : manufacturingEnergyDifferenceKWh <= 0 && lifecycleEnergySavedKWh > 0 ? 0 : null;
  const failedChecks = best.complianceChecks.filter(check => !check.passed);
  const reason = qualifiesAsImprovement
    ? `Accepted: saves ${round(lifecycleEnergySavedKWh, 0).toLocaleString()} kWh over ${input.lifecycleYears} years after construction and resilience energy are included.`
    : failedChecks.length > 0
      ? `Rejected: no searched design satisfied ${failedChecks.map(check => check.label).join(', ')}.`
      : 'Rejected: solar and operational savings do not repay added construction complexity within the selected lifecycle.';

  return {
    location: input.location,
    requirements: input.requirements,
    baseline,
    best,
    sunPath: sunPathSummary(input.location),
    candidatesEvaluated,
    improvement: {
      qualifiesAsImprovement,
      annualOperationalEnergySavedKWh: round(annualOperationalEnergySavedKWh, 1),
      manufacturingEnergyDifferenceKWh: round(manufacturingEnergyDifferenceKWh, 1),
      lifecycleEnergySavedKWh: round(lifecycleEnergySavedKWh, 1),
      lifecycleEnergySavedPercent: round(baseline.totalLifecycleEnergyKWh > 0 ? lifecycleEnergySavedKWh / baseline.totalLifecycleEnergyKWh * 100 : 0, 1),
      energyPaybackYears: energyPaybackYears === null ? null : round(energyPaybackYears, 2),
      reason,
    },
    assumptions: [
      'The annual sun path is calculated locally from latitude, day of year and solar hour; no weather or AI API is called.',
      'Average daily solar exposure is an editable climatology input. For Australia, replace screening presets with the latest Bureau of Meteorology grid value for the exact site.',
      'Self-shadowing uses ray intersections between façade samples and the generated L-shape or courtyard footprint; eave shading is calculated separately from sun altitude and façade incidence.',
      'Hazard and code fields are preliminary hard constraints supplied by the user or a screening preset. A certifier must confirm the planning scheme, NCC edition, site classification, BAL, flood level, wind region and engineering loads.',
      'Manufacturing energy covers envelope, glazing, roof, eaves, foundation, structural reinforcement and geometry complexity. Product EPD values should replace generic factors before construction.',
    ],
  };
}
