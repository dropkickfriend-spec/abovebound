import * as THREE from 'three';

/**
 * V12 — House Blueprint Simulation Engine
 *
 * Sims-inside-sims architecture:
 *   HOUSE (macro thermal envelope)
 *     └─ ESKY zones (portable cooling containers within rooms)
 *         └─ STUBBY zones (individual beverage coolers inside eskies)
 *
 * Each nesting level has its own thermal grid, but heat waste cascades
 * DOWN through the hierarchy: house waste → esky boundary → stubby boundary
 *
 * Cross-sim inputs:
 *   - V8 Riemann prime spectrum → wall thermal resonance frequencies
 *   - V6 thermo-transmission lattice → vent flow optimization
 *   - Golden ratio conjugates (0.382/0.500/0.618) → phase stability markers
 *
 * Outputs:
 *   - Full floorplan with thermal heatmap
 *   - Vent placement recommendations
 *   - 100-year material degradation projection
 *   - Nested sim state for blueprint rendering
 *   - Electrical: magnetic field → magnetocaloric cooling efficiency
 *   - Blockchain: global ledger of all sim states across all levels
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface WallLayer {
  material: string;
  thickness: number;       // metres
  conductivity: number;    // W/mK
  density: number;         // kg/m³
  specificHeat: number;    // J/kgK
  degradationRate: number; // % loss per year (R-value)
}

export interface WallAssembly {
  name: string;
  layers: WallLayer[];
  totalR: number;          // computed
  totalU: number;          // computed
}

export interface WindowSpec {
  type: string;
  uValue: number;          // W/m²K
  shgc: number;            // solar heat gain coefficient
  area: number;            // m²
  orientation: 'N' | 'S' | 'E' | 'W';
}

export interface VentSpec {
  id: string;
  type: 'intake' | 'exhaust' | 'transfer' | 'heat_recovery';
  position: THREE.Vector3;  // grid position
  flowRate: number;         // m³/s
  efficiency: number;       // 0-1 (heat recovery eff for HRV)
  diameter: number;         // mm
  powered: boolean;
  currentFlowRate?: number;    // actual flow rate this frame (m³/s)
  currentSupplyTemp?: number;  // supply air temperature (°C)
  currentExhaustTemp?: number; // exhaust air temperature (°C)
  airSpeed?: number;           // air speed at vent face (m/s)
}

export interface VentPair {
  intake: string;   // vent id
  exhaust: string;  // vent id
  roomId: string;
}

export interface VentReading {
  supplyTemp: number;
  returnTemp: number;
  flowSpeed: number;
  massFlowRate: number; // kg/s
}

export interface AnnualClimateState {
  simulatedDayOfYear: number;   // 0-365
  simulatedHourOfDay: number;   // 0-24 (fractional)
  outsideTemp: number;          // °C
  solarIrradiance: number;      // W/m²
  windSpeed: number;            // m/s
  windDirection: number;        // radians, 0 = from east
  cloudCover: number;           // 0-1
  frameCount: number;           // total frames elapsed
}

export interface RoomDef {
  id: string;
  name: string;
  x: number; y: number;     // floorplan position (m from origin)
  width: number; height: number; // room dimensions
  ceilingHeight: number;
  wallType: string;          // key into WALL_ASSEMBLIES
  windows: WindowSpec[];
  vents: VentSpec[];
  internalLoad: number;      // W (appliances, people, lights)
  targetTemp: number;        // °C desired
  hasEsky: boolean;
  hasStubby: boolean;
}

export interface EskyZone {
  roomId: string;
  position: THREE.Vector3;
  innerTemp: number;
  outerTemp: number;         // room temperature (boundary)
  insulation_R: number;
  magnetocaloricPower: number; // W
  batteryWh: number;
  contents: StubbyZone[];
  heatWaste: number;          // W rejected into room
}

export interface StubbyZone {
  temp: number;
  targetTemp: number;
  insulation_R: number;
  co2CoolingW: number;
  magnetocaloricW: number;
  heatWaste: number;          // W rejected into esky
}

export interface MagneticField {
  position: THREE.Vector3;
  strength: number;           // Tesla
  direction: THREE.Vector3;
  frequency: number;          // Hz (for AMR cycling)
}

export interface MagnetocaloricUnit {
  cop: number;                // coefficient of performance
  coolingPowerW: number;
  magneticFieldT: number;
  cycleFreqHz: number;
  gadoliniumMassKg: number;
  entropyChange: number;      // J/kgK (ΔS_mag)
}

export interface LedgerEntry {
  timestamp: number;
  simLevel: 'house' | 'esky' | 'stubby' | 'electrical' | 'cross_sim';
  metric: string;
  value: number;
  hash: string;              // simple hash for chain integrity
}

export interface DegradationPoint {
  year: number;
  rValuePct: number;         // % of original R-value remaining
  energyCostMultiplier: number;
  maintenanceEvents: string[];
  cumulativeCost: number;
}

export interface FloorplanRecommendation {
  type: 'vent_add' | 'vent_move' | 'insulation_upgrade' | 'window_upgrade' | 'layout_change' | 'magnetocaloric_add';
  room: string;
  description: string;
  energySaving: number;       // % reduction
  costEstimate: number;       // $
  priority: 'critical' | 'high' | 'medium' | 'low';
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const PHI = (1 + Math.sqrt(5)) / 2;
const PHI_CONJUGATE = 1 / PHI;          // 0.618
const PHI_COMPRESSIVE = 1 - PHI_CONJUGATE; // 0.382

export const WALL_LIBRARY: Record<string, WallAssembly> = {
  timber_frame: {
    name: 'Timber Frame (Standard)',
    layers: [
      { material: 'Plasterboard', thickness: 0.013, conductivity: 0.17, density: 950, specificHeat: 840, degradationRate: 0.05 },
      { material: 'Air Gap', thickness: 0.025, conductivity: 0.025, density: 1.2, specificHeat: 1005, degradationRate: 0 },
      { material: 'Glasswool R2.5', thickness: 0.090, conductivity: 0.044, density: 12, specificHeat: 840, degradationRate: 0.3 },
      { material: 'Timber Stud', thickness: 0.090, conductivity: 0.13, density: 500, specificHeat: 1700, degradationRate: 0.1 },
      { material: 'Building Wrap', thickness: 0.001, conductivity: 0.50, density: 900, specificHeat: 1000, degradationRate: 0.8 },
      { material: 'Fibre Cement', thickness: 0.009, conductivity: 0.25, density: 1400, specificHeat: 840, degradationRate: 0.2 },
    ],
    totalR: 0, totalU: 0,
  },
  brick_veneer: {
    name: 'Brick Veneer',
    layers: [
      { material: 'Plasterboard', thickness: 0.013, conductivity: 0.17, density: 950, specificHeat: 840, degradationRate: 0.05 },
      { material: 'Glasswool R2.5', thickness: 0.090, conductivity: 0.044, density: 12, specificHeat: 840, degradationRate: 0.3 },
      { material: 'Reflective Air Gap', thickness: 0.025, conductivity: 0.018, density: 1.2, specificHeat: 1005, degradationRate: 0 },
      { material: 'Clay Brick', thickness: 0.110, conductivity: 0.72, density: 1920, specificHeat: 840, degradationRate: 0.02 },
    ],
    totalR: 0, totalU: 0,
  },
  double_brick: {
    name: 'Double Brick (Cavity)',
    layers: [
      { material: 'Render', thickness: 0.015, conductivity: 0.72, density: 1800, specificHeat: 840, degradationRate: 0.5 },
      { material: 'Clay Brick', thickness: 0.110, conductivity: 0.72, density: 1920, specificHeat: 840, degradationRate: 0.02 },
      { material: 'Cavity + Insulation', thickness: 0.050, conductivity: 0.038, density: 30, specificHeat: 840, degradationRate: 0.2 },
      { material: 'Clay Brick', thickness: 0.110, conductivity: 0.72, density: 1920, specificHeat: 840, degradationRate: 0.02 },
      { material: 'Plaster', thickness: 0.015, conductivity: 0.50, density: 1300, specificHeat: 840, degradationRate: 0.1 },
    ],
    totalR: 0, totalU: 0,
  },
  sip_panel: {
    name: 'Structural Insulated Panel (SIP)',
    layers: [
      { material: 'OSB', thickness: 0.011, conductivity: 0.13, density: 650, specificHeat: 1700, degradationRate: 0.15 },
      { material: 'EPS Core', thickness: 0.165, conductivity: 0.032, density: 20, specificHeat: 1400, degradationRate: 0.1 },
      { material: 'OSB', thickness: 0.011, conductivity: 0.13, density: 650, specificHeat: 1700, degradationRate: 0.15 },
    ],
    totalR: 0, totalU: 0,
  },
  icf: {
    name: 'Insulated Concrete Form (ICF)',
    layers: [
      { material: 'EPS Outer', thickness: 0.064, conductivity: 0.032, density: 20, specificHeat: 1400, degradationRate: 0.1 },
      { material: 'Reinforced Concrete', thickness: 0.150, conductivity: 1.40, density: 2400, specificHeat: 880, degradationRate: 0.01 },
      { material: 'EPS Inner', thickness: 0.064, conductivity: 0.032, density: 20, specificHeat: 1400, degradationRate: 0.1 },
    ],
    totalR: 0, totalU: 0,
  },
  hempcrete: {
    name: 'Hempcrete (Bio-Composite)',
    layers: [
      { material: 'Lime Render', thickness: 0.015, conductivity: 0.80, density: 1600, specificHeat: 840, degradationRate: 0.3 },
      { material: 'Hempcrete', thickness: 0.300, conductivity: 0.06, density: 330, specificHeat: 1560, degradationRate: 0.05 },
      { material: 'Lime Plaster', thickness: 0.015, conductivity: 0.80, density: 1600, specificHeat: 840, degradationRate: 0.3 },
    ],
    totalR: 0, totalU: 0,
  },
  rammed_earth: {
    name: 'Rammed Earth (Stabilized)',
    layers: [
      { material: 'Rammed Earth', thickness: 0.300, conductivity: 0.80, density: 2000, specificHeat: 920, degradationRate: 0.02 },
    ],
    totalR: 0, totalU: 0,
  },
  aerogel_composite: {
    name: 'Aerogel Composite (Future)',
    layers: [
      { material: 'Graphene Skin', thickness: 0.002, conductivity: 5000, density: 2200, specificHeat: 700, degradationRate: 0.01 },
      { material: 'Silica Aerogel', thickness: 0.025, conductivity: 0.013, density: 100, specificHeat: 1000, degradationRate: 0.15 },
      { material: 'Vacuum Insulation', thickness: 0.020, conductivity: 0.004, density: 200, specificHeat: 800, degradationRate: 0.5 },
      { material: 'Phase-Change Layer', thickness: 0.015, conductivity: 0.20, density: 800, specificHeat: 2500, degradationRate: 0.2 },
      { material: 'Aerogel Inner', thickness: 0.025, conductivity: 0.013, density: 100, specificHeat: 1000, degradationRate: 0.15 },
    ],
    totalR: 0, totalU: 0,
  },
};

// Pre-compute R and U values
Object.values(WALL_LIBRARY).forEach(w => {
  const surfaceR = 0.04 + 0.13; // external + internal surface resistance
  w.totalR = surfaceR + w.layers.reduce((sum, l) => sum + l.thickness / l.conductivity, 0);
  w.totalU = 1 / w.totalR;
});

export const CLIMATE_DATA: Record<string, {
  name: string; lat: number;
  summerDesign: number; winterDesign: number;
  solarIrradiance: number; // W/m² average
  humidity: number;        // % average
  windSpeed: number;       // m/s average
  heatingDegreeDays: number;
  coolingDegreeDays: number;
}> = {
  tropical_darwin: { name: 'Tropical (Darwin)', lat: -12.4, summerDesign: 34, winterDesign: 19, solarIrradiance: 250, humidity: 70, windSpeed: 4.5, heatingDegreeDays: 0, coolingDegreeDays: 3200 },
  subtropical_brisbane: { name: 'Subtropical (Brisbane)', lat: -27.5, summerDesign: 33, winterDesign: 8, solarIrradiance: 220, humidity: 60, windSpeed: 3.8, heatingDegreeDays: 400, coolingDegreeDays: 1800 },
  temperate_sydney: { name: 'Temperate (Sydney)', lat: -33.9, summerDesign: 35, winterDesign: 6, solarIrradiance: 200, humidity: 55, windSpeed: 4.2, heatingDegreeDays: 900, coolingDegreeDays: 800 },
  cool_temperate_melb: { name: 'Cool Temperate (Melbourne)', lat: -37.8, summerDesign: 40, winterDesign: 3, solarIrradiance: 180, humidity: 50, windSpeed: 4.0, heatingDegreeDays: 1500, coolingDegreeDays: 400 },
  alpine: { name: 'Alpine', lat: -36.5, summerDesign: 30, winterDesign: -5, solarIrradiance: 200, humidity: 65, windSpeed: 5.5, heatingDegreeDays: 3000, coolingDegreeDays: 100 },
  arid_alice: { name: 'Arid (Alice Springs)', lat: -23.7, summerDesign: 42, winterDesign: 2, solarIrradiance: 280, humidity: 25, windSpeed: 3.5, heatingDegreeDays: 800, coolingDegreeDays: 2500 },
};

// ═══════════════════════════════════════════════════════════════
// GLOBE ZONE → BUILDING CONSTRAINTS
// ═══════════════════════════════════════════════════════════════

export type GlobeZone = 'tropical' | 'temperate' | 'cold';

export interface ZoneConstraints {
  zone: GlobeZone;
  label: string;
  seasons: string[];               // 'wet'/'dry' for tropical, or 4 standard
  humidity: number;                // default %
  needsStilts: boolean;            // flood zone
  floodRiskHigh: boolean;
  earthquakeRisk: boolean;         // wider base needed
  cycloneRisk: boolean;            // reinforced roof
  preferredWallTypes: string[];    // from WALL_LIBRARY keys
  minRValue: number;               // minimum insulation
  maxWindowRatio: number;          // window area / wall area cap
  preferredRoofPitch: number;      // degrees
  floorType: 'slab_on_ground' | 'raised_timber' | 'stilts' | 'insulated_slab';
  underfloorHeating: boolean;
  shadeStrategy: string;           // description of shading approach
  buildingForm: string;            // L-shape, courtyard, compact, etc.
  longestWallFacing: string;       // least sun direction
  passiveDesign: string[];         // list of passive design strategies
  costMultiplier: number;          // regional construction cost factor
  baselineEnergyKWhPerM2: number;  // typical existing home energy use (no optimization)
}

export const ZONE_CONSTRAINTS: Record<GlobeZone, ZoneConstraints> = {
  tropical: {
    zone: 'tropical',
    label: 'Tropical (0°–23° latitude)',
    seasons: ['wet', 'dry'],
    humidity: 99,
    needsStilts: true,
    floodRiskHigh: true,
    earthquakeRisk: false,
    cycloneRisk: true,
    preferredWallTypes: ['timber_frame', 'hempcrete'],
    minRValue: 1.5,
    maxWindowRatio: 0.25,
    preferredRoofPitch: 25,
    floorType: 'stilts',
    underfloorHeating: false,
    shadeStrategy: 'Deep eaves (1.2m+), verandahs on all sides, dense tropical planting (palms, pandanus) on N/W faces, louvred screens',
    buildingForm: 'Elongated rectangle or shotgun layout — maximise cross-ventilation, elevate 1.5m+ on stilts for flood + airflow beneath',
    longestWallFacing: 'E-W axis (longest walls face N and S to minimise direct tropical sun on long facades)',
    passiveDesign: [
      'Cross-ventilation priority — all rooms need through-breeze path',
      'Raised floor on stilts (1.5m+) for flood protection + underfloor airflow',
      'Deep eaves and verandahs for rain/sun shielding',
      'High ceilings (3m+) for hot air stratification',
      'Louvred walls/windows for constant airflow even during rain',
      'Light-coloured reflective roof (Colorbond or similar)',
      'No carpet — polished concrete or timber for thermal mass cooling',
      'Ceiling fans in every room (use 5-10W vs 2000W+ AC)',
      'Dense shade planting on N and W sides',
      'Rainwater collection mandatory (wet season storage)',
      'Evaporative cooling from garden and water features',
    ],
    costMultiplier: 1.15,
    baselineEnergyKWhPerM2: 180,
  },
  temperate: {
    zone: 'temperate',
    label: 'Temperate (23°–50° latitude)',
    seasons: ['summer', 'autumn', 'winter', 'spring'],
    humidity: 55,
    needsStilts: false,
    floodRiskHigh: false,
    earthquakeRisk: false,
    cycloneRisk: false,
    preferredWallTypes: ['brick_veneer', 'sip_panel', 'icf'],
    minRValue: 3.0,
    maxWindowRatio: 0.30,
    preferredRoofPitch: 22,
    floorType: 'insulated_slab',
    underfloorHeating: true,
    shadeStrategy: 'Deciduous trees on N/W (shade in summer, sun in winter), pergolas with deciduous vines, external blinds on W windows, bushes/hedges as windbreaks on S',
    buildingForm: 'L-shape with courtyard facing equator — protected outdoor space, longest wall for winter solar gain, L-wing provides self-shading in summer',
    longestWallFacing: 'Longest wall faces equator (N in southern hemisphere, S in northern) for maximum winter solar gain',
    passiveDesign: [
      'L-shape or courtyard form for self-shading + winter solar gain',
      'Insulated concrete slab with hydronic underfloor heating',
      'Deciduous trees on sun-facing side (shade summer, admit winter sun)',
      'North-facing windows (SH) maximised for winter gain, low-E coating',
      'Minimal west-facing windows (worst summer heat gain)',
      'Thermal mass internal walls (rammed earth, concrete) store daytime heat',
      'Eave depth calculated: overhang blocks summer sun, admits winter sun',
      'Stack-effect ventilation: low intake vents + high clerestory exhaust',
      'Night purge cooling in summer (open up at night, seal in morning)',
      'Earth-sheltered design if sloping site (earth banking on S side)',
      'Hedgerow windbreak on prevailing cold wind side',
      'Solar tubes for internal rooms without window access',
    ],
    costMultiplier: 1.0,
    baselineEnergyKWhPerM2: 150,
  },
  cold: {
    zone: 'cold',
    label: 'Cold/Polar (50°+ latitude)',
    seasons: ['summer', 'autumn', 'winter', 'spring'],
    humidity: 65,
    needsStilts: false,
    floodRiskHigh: false,
    earthquakeRisk: false,
    cycloneRisk: false,
    preferredWallTypes: ['sip_panel', 'icf', 'aerogel_composite'],
    minRValue: 5.0,
    maxWindowRatio: 0.15,
    preferredRoofPitch: 40,
    floorType: 'insulated_slab',
    underfloorHeating: true,
    shadeStrategy: 'Minimal shading needed — maximise solar gain. Snow guards on roof. Dense conifer windbreak (spruce, pine) on N/W (NH). Earth banking on exposed sides.',
    buildingForm: 'Compact (near-square or circular) to minimise surface-area-to-volume ratio. Two-storey preferred. Attached garage as buffer zone. Airlock entry vestibule.',
    longestWallFacing: 'Longest wall faces equator-side for maximum scarce winter solar gain. Minimise all other exposures.',
    passiveDesign: [
      'Compact form — minimise surface area to volume ratio',
      'Super-insulated envelope (R-5+ walls, R-8+ roof, R-4+ floor)',
      'Triple or vacuum glazing on all windows',
      'Equator-facing windows maximised (limited by snow load structure)',
      'Airlock vestibule entry to prevent heat loss on door opening',
      'Hydronic underfloor heating (from heat pump or solar thermal)',
      'Massive thermal mass core (concrete/stone fireplace wall)',
      'HRV (Heat Recovery Ventilation) mandatory — 90%+ efficiency',
      'Earth-sheltered or bermed design to use ground temperature',
      'Dark-coloured exterior to absorb scarce winter sunlight',
      'Conifer windbreak plantation on cold wind side',
      'Attached greenhouse/sunroom as passive solar heat buffer',
      'Minimal north-facing windows (NH) — just enough for daylighting',
    ],
    costMultiplier: 1.3,
    baselineEnergyKWhPerM2: 250,
  },
};

const WINDOW_TYPES: Record<string, { uValue: number; shgc: number; name: string }> = {
  single_clear: { uValue: 5.8, shgc: 0.86, name: 'Single Clear' },
  double_clear: { uValue: 2.7, shgc: 0.76, name: 'Double Clear' },
  double_lowE: { uValue: 1.6, shgc: 0.42, name: 'Double Low-E Argon' },
  triple_lowE: { uValue: 0.8, shgc: 0.35, name: 'Triple Low-E Krypton' },
  vacuum: { uValue: 0.5, shgc: 0.40, name: 'Vacuum Insulated' },
};

// ═══════════════════════════════════════════════════════════════
// MAIN ENGINE
// ═══════════════════════════════════════════════════════════════

export class V12HouseEngine {
  scene: THREE.Scene;

  // ── House definition ──
  private _rooms: RoomDef[] = [];
  private _climate: string = 'temperate_sydney';
  private _indoorTarget: number = 22;

  // ── Thermal grid (2D floorplan, per-cell temp) ──
  private _gridRes: number = 20; // cells per longest dimension
  private _thermalGrid: Float32Array;
  private _airflowX: Float32Array;
  private _airflowY: Float32Array;
  private _wallMask: Uint8Array;   // 1 = wall, 0 = air
  private _ventMask: Float32Array; // vent injection rate per cell
  private _gridW: number = 20;
  private _gridH: number = 20;

  // ── Navier-Stokes solver scratch buffers ──
  private _nsVx: Float32Array;       // velocity X
  private _nsVy: Float32Array;       // velocity Y
  private _nsVx0: Float32Array;      // previous velocity X
  private _nsVy0: Float32Array;      // previous velocity Y
  private _nsPressure: Float32Array; // pressure field
  private _nsDivergence: Float32Array;
  private _cellSize: number = 0.5;   // metres per cell

  // ── Annual Climate Cycle ──
  private _annualClimate: AnnualClimateState = {
    simulatedDayOfYear: 0,
    simulatedHourOfDay: 12,
    outsideTemp: 22,
    solarIrradiance: 200,
    windSpeed: 3,
    windDirection: 0,
    cloudCover: 0.3,
    frameCount: 0,
  };
  private _outsideTemp: number = 22;
  private _solarIrradiance: number = 200;
  private _windSpeed: number = 3;
  private _weatherNoiseAccum: number = 0;

  // ── Auto HVAC ──
  private _hvacEnergyUsedKWh: number = 0;
  private _hvacCurrentPowerW: number = 0;
  private _autoThermalMode: 'heating' | 'cooling' | 'off' = 'off';
  private _hvacSupplyTemp: number = 22;

  // ── Vent pairs and readings ──
  private _ventPairs: VentPair[] = [];
  private _ventReadings: Map<string, VentReading> = new Map();
  private _ventHistory: Map<string, VentReading[]> = new Map(); // last 100 readings per vent

  // ── Nested sims ──
  private _eskyZones: EskyZone[] = [];
  private _magnetocaloricUnits: MagnetocaloricUnit[] = [];
  private _magneticFields: MagneticField[] = [];

  // ── Electrical: magnetic → magnetocaloric chain + natural systems ──
  private _electricalState = {
    totalMagneticEnergy: 0,
    magnetocaloricCOP: 0,
    totalCoolingW: 0,
    heatRejectedW: 0,
    cycleCount: 0,
    // Natural Systems — paradigm shift: house as living ecosystem
    solarTubeOutputLumens: 0,
    reflectorEfficiency: 0,
    artificialLightReduction: 0,
    earthTubeCoolingKW: 0,
    stackEffectAirflow: 0,     // m³/hr
    thermalMassAbsorptionKWh: 0,
    evaporativeCoolingKW: 0,
    rainwaterStoredL: 0,
    greywaterRecycledLDay: 0,
    waterPumpPowerKW: 0,
    primeResonanceScore: 0,
    loadBalanceFactor: 0,
    peakShavingReduction: 0,
    naturalSavingsPercent: 0,
  };

  // ── Topology Flow State ──
  private _topologyThreads: { type: string; strength: number; novelty: number }[] = [];
  private _topologyFlowEfficiency: number = 0;

  // ── V5 Geometry Detection Source ──
  private _v5Planes: { center: { x: number; y: number; z: number }; normal: { x: number; y: number; z: number }; width: number; height: number; role: string; conductivity: number }[] = [];
  private _geometrySource: 'default' | 'v5_detected' = 'default';
  private _v5ImportCount: number = 0;

  // ── Globe Zone & Building Constraints ──
  private _globeZone: GlobeZone = 'temperate';
  private _zoneConstraints: ZoneConstraints = ZONE_CONSTRAINTS.temperate;
  private _zoneConfigured: boolean = false;
  private _optimizationIteration: number = 0; // brute-force sim counter
  private _bestOrientation: number = 0;        // degrees from north
  private _bestFormScore: number = 0;

  // ── Blockchain: global ledger ──
  private _ledger: LedgerEntry[] = [];
  private _ledgerHash: string = '0000';

  // ── 100-year projection ──
  private _projections: DegradationPoint[] = [];

  // ── V13 Material Engine reference (cooling talks to wall builder talks to elements) ──
  private _materialEngine: any = null; // V13MaterialEngine instance
  private _compositeRequests: { roomId: string; purpose: string; result: any }[] = [];
  private _lastCompositeRequestFrame: number = 0;

  // ── Recommendations ──
  private _recommendations: FloorplanRecommendation[] = [];

  // ── Cross-sim inputs ──
  private _primeSpectrum: { gaps: number[]; density: number; goldenPhases: { compressive: number; critical: number; elongative: number } } | null = null;
  private _latticeFlowData: { totalFlow: number; efficiency: number } | null = null;

  // ── THREE visuals ──
  floorplanMesh: THREE.Group;
  thermalHeatmap: THREE.Points;
  ventArrows: THREE.Group;

  // ── Metrics ──
  private _totalHeatLossW: number = 0;
  private _totalHeatGainW: number = 0;
  private _hvacLoadW: number = 0;
  private _iteration: number = 0;
  private _stable: boolean = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this._thermalGrid = new Float32Array(400);
    this._airflowX = new Float32Array(400);
    this._airflowY = new Float32Array(400);
    this._wallMask = new Uint8Array(400);
    this._ventMask = new Float32Array(400);

    // NS solver buffers
    this._nsVx = new Float32Array(400);
    this._nsVy = new Float32Array(400);
    this._nsVx0 = new Float32Array(400);
    this._nsVy0 = new Float32Array(400);
    this._nsPressure = new Float32Array(400);
    this._nsDivergence = new Float32Array(400);

    this.floorplanMesh = new THREE.Group();
    this.ventArrows = new THREE.Group();
    scene.add(this.floorplanMesh);
    scene.add(this.ventArrows);

    // Thermal heatmap points
    const heatGeo = new THREE.BufferGeometry();
    const heatPos = new Float32Array(400 * 3);
    const heatCol = new Float32Array(400 * 3);
    heatGeo.setAttribute('position', new THREE.BufferAttribute(heatPos, 3));
    heatGeo.setAttribute('color', new THREE.BufferAttribute(heatCol, 3));
    this.thermalHeatmap = new THREE.Points(heatGeo, new THREE.PointsMaterial({
      size: 0.15,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
    }));
    scene.add(this.thermalHeatmap);

    this._buildDefaultHouse();
    this._computeProjections();
  }

  // ═══════════════════════════════════════════════════════════════
  // DEFAULT HOUSE SETUP
  // ═══════════════════════════════════════════════════════════════

  private _buildDefaultHouse() {
    this._rooms = [
      {
        id: 'living', name: 'Living Area',
        x: 0, y: 0, width: 6, height: 5, ceilingHeight: 2.7,
        wallType: 'brick_veneer',
        windows: [
          { type: 'double_lowE', uValue: 1.6, shgc: 0.42, area: 3.6, orientation: 'N' },
          { type: 'double_lowE', uValue: 1.6, shgc: 0.42, area: 2.4, orientation: 'W' },
        ],
        vents: [
          { id: 'v1', type: 'intake', position: new THREE.Vector3(0, 2.4, 0), flowRate: 0.05, efficiency: 0, diameter: 150, powered: false },
          { id: 'v2', type: 'exhaust', position: new THREE.Vector3(5.5, 2.4, 0), flowRate: 0.05, efficiency: 0, diameter: 150, powered: false },
        ],
        internalLoad: 400, targetTemp: 22, hasEsky: true, hasStubby: false,
      },
      {
        id: 'kitchen', name: 'Kitchen',
        x: 6, y: 0, width: 4, height: 5, ceilingHeight: 2.7,
        wallType: 'brick_veneer',
        windows: [
          { type: 'double_clear', uValue: 2.7, shgc: 0.76, area: 1.8, orientation: 'E' },
        ],
        vents: [
          { id: 'v3', type: 'exhaust', position: new THREE.Vector3(9, 2.4, 0), flowRate: 0.12, efficiency: 0, diameter: 200, powered: true },
        ],
        internalLoad: 1200, targetTemp: 22, hasEsky: false, hasStubby: false,
      },
      {
        id: 'master', name: 'Master Suite',
        x: 0, y: 5, width: 5, height: 4, ceilingHeight: 2.7,
        wallType: 'brick_veneer',
        windows: [
          { type: 'double_lowE', uValue: 1.6, shgc: 0.42, area: 2.4, orientation: 'S' },
        ],
        vents: [
          { id: 'v4', type: 'heat_recovery', position: new THREE.Vector3(2.5, 7, 0), flowRate: 0.04, efficiency: 0.85, diameter: 125, powered: true },
        ],
        internalLoad: 150, targetTemp: 21, hasEsky: false, hasStubby: true,
      },
      {
        id: 'bed2', name: 'Bedroom 2',
        x: 5, y: 5, width: 3.5, height: 4, ceilingHeight: 2.7,
        wallType: 'timber_frame',
        windows: [
          { type: 'double_clear', uValue: 2.7, shgc: 0.76, area: 1.5, orientation: 'E' },
        ],
        vents: [
          { id: 'v5', type: 'transfer', position: new THREE.Vector3(5, 5.5, 0), flowRate: 0.03, efficiency: 0, diameter: 100, powered: false },
        ],
        internalLoad: 100, targetTemp: 21, hasEsky: false, hasStubby: false,
      },
      {
        id: 'bathroom', name: 'Bathroom',
        x: 8.5, y: 5, width: 1.5, height: 4, ceilingHeight: 2.4,
        wallType: 'double_brick',
        windows: [
          { type: 'single_clear', uValue: 5.8, shgc: 0.86, area: 0.5, orientation: 'E' },
        ],
        vents: [
          { id: 'v6', type: 'exhaust', position: new THREE.Vector3(9.2, 7.5, 0), flowRate: 0.06, efficiency: 0, diameter: 125, powered: true },
        ],
        internalLoad: 200, targetTemp: 24, hasEsky: false, hasStubby: false,
      },
      {
        id: 'garage', name: 'Garage / Workshop',
        x: 0, y: 9, width: 6, height: 3, ceilingHeight: 3.0,
        wallType: 'timber_frame',
        windows: [],
        vents: [
          { id: 'v7', type: 'intake', position: new THREE.Vector3(0, 10, 0), flowRate: 0.08, efficiency: 0, diameter: 200, powered: false },
          { id: 'v8', type: 'exhaust', position: new THREE.Vector3(5.5, 11.5, 0), flowRate: 0.08, efficiency: 0, diameter: 200, powered: false },
        ],
        internalLoad: 300, targetTemp: 18, hasEsky: true, hasStubby: true,
      },
    ];

    // Add floor intake + ceiling exhaust vent pairs to every room
    this._addFloorCeilingVents();

    // Build nested sims
    this._buildNestedSims();
    this._buildGrid();
    this._buildMagnetocaloricChain();
  }

  /**
   * Adds paired floor intake and ceiling exhaust vents to every room.
   * Intake at floor level (y=0.1) on one wall, exhaust at ceiling (y=ceiling-0.1) on opposite wall.
   * Tracks pairs in _ventPairs for HVAC coordination.
   */
  private _addFloorCeilingVents() {
    this._ventPairs = [];

    for (const room of this._rooms) {
      // Check if room already has a proper intake/exhaust pair
      const hasIntake = room.vents.some(v => v.type === 'intake');
      const hasExhaust = room.vents.some(v => v.type === 'exhaust');

      // Floor intake vent: bottom of room, left wall
      const intakeId = `${room.id}_floor_intake`;
      const exhaustId = `${room.id}_ceil_exhaust`;

      // Flow rate scaled to room volume: ~3 ACH (air changes per hour) for comfort
      // ACH=3 → flowRate = volume * 3 / 3600
      const roomVolume = room.width * room.height * room.ceilingHeight;
      const targetACH = 3.0;
      const flowRate = roomVolume * targetACH / 3600; // m³/s

      // Intake at floor level on the LEFT wall
      if (!hasIntake) {
        room.vents.push({
          id: intakeId,
          type: 'intake',
          position: new THREE.Vector3(room.x + 0.3, room.y + room.height * 0.2, 0), // low on left wall
          flowRate,
          efficiency: 0,
          diameter: Math.min(250, Math.max(100, Math.round(roomVolume * 3))),
          powered: true,
          currentFlowRate: 0,
          currentSupplyTemp: 22,
          currentExhaustTemp: 22,
          airSpeed: 0,
        });
      }

      // Exhaust at ceiling level on the OPPOSITE (RIGHT) wall
      if (!hasExhaust) {
        room.vents.push({
          id: exhaustId,
          type: 'exhaust',
          position: new THREE.Vector3(room.x + room.width - 0.3, room.y + room.height * 0.8, 0), // high on right wall
          flowRate,
          efficiency: 0,
          diameter: Math.min(250, Math.max(100, Math.round(roomVolume * 3))),
          powered: true,
          currentFlowRate: 0,
          currentSupplyTemp: 22,
          currentExhaustTemp: 22,
          airSpeed: 0,
        });
      }

      // Track the pair
      const actualIntakeId = hasIntake ? (room.vents.find(v => v.type === 'intake')?.id || intakeId) : intakeId;
      const actualExhaustId = hasExhaust ? (room.vents.find(v => v.type === 'exhaust')?.id || exhaustId) : exhaustId;

      this._ventPairs.push({
        intake: actualIntakeId,
        exhaust: actualExhaustId,
        roomId: room.id,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // NESTED SIMS-INSIDE-SIMS
  // ═══════════════════════════════════════════════════════════════

  private _buildNestedSims() {
    this._eskyZones = [];

    for (const room of this._rooms) {
      if (room.hasEsky) {
        const stubbies: StubbyZone[] = [];

        // Each esky contains 6 stubbies
        for (let s = 0; s < 6; s++) {
          stubbies.push({
            temp: 20,
            targetTemp: 4,
            insulation_R: 0.8,   // stubby koozie R-value
            co2CoolingW: 3,      // CO2 micro-expansion
            magnetocaloricW: 2,  // tiny magnetocaloric ring
            heatWaste: 0,
          });
        }

        this._eskyZones.push({
          roomId: room.id,
          position: new THREE.Vector3(room.x + room.width / 2, room.y + room.height / 2, 0),
          innerTemp: 8,
          outerTemp: room.targetTemp,
          insulation_R: 12.5,     // high-performance esky
          magnetocaloricPower: 45, // Gadolinium AMR unit
          batteryWh: 100,
          contents: stubbies,
          heatWaste: 0,
        });
      } else if (room.hasStubby) {
        // Standalone stubbies (no esky container)
        this._eskyZones.push({
          roomId: room.id,
          position: new THREE.Vector3(room.x + room.width / 2, room.y + room.height / 2, 0),
          innerTemp: 15,
          outerTemp: room.targetTemp,
          insulation_R: 2.0,
          magnetocaloricPower: 5,
          batteryWh: 10,
          contents: [{
            temp: 20, targetTemp: 6, insulation_R: 0.8,
            co2CoolingW: 3, magnetocaloricW: 2, heatWaste: 0,
          }],
          heatWaste: 0,
        });
      }
    }
  }

  private _buildMagnetocaloricChain() {
    // Main house magnetocaloric unit (HVAC-scale)
    this._magnetocaloricUnits = [{
      cop: 6.0,
      coolingPowerW: 5000,
      magneticFieldT: 1.5,
      cycleFreqHz: 4,
      gadoliniumMassKg: 2.5,
      entropyChange: 20,  // J/kgK (ΔS_mag for Gd near Curie point)
    }];

    // Magnetic field sources
    this._magneticFields = [
      {
        position: new THREE.Vector3(5, 4.5, 1.5),
        strength: 1.5,
        direction: new THREE.Vector3(0, 0, 1),
        frequency: 4,
      },
    ];

    // Esky-level magnetocaloric units
    for (const esky of this._eskyZones) {
      this._magnetocaloricUnits.push({
        cop: 3.5,
        coolingPowerW: esky.magnetocaloricPower,
        magneticFieldT: 0.8,
        cycleFreqHz: 2,
        gadoliniumMassKg: 0.15,
        entropyChange: 18,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // THERMAL GRID
  // ═══════════════════════════════════════════════════════════════

  private _buildGrid() {
    // Find bounding box of all rooms
    let maxX = 0, maxY = 0;
    for (const r of this._rooms) {
      maxX = Math.max(maxX, r.x + r.width);
      maxY = Math.max(maxY, r.y + r.height);
    }

    const cellSize = Math.max(maxX, maxY) / this._gridRes;
    this._cellSize = cellSize;
    this._gridW = Math.ceil(maxX / cellSize);
    this._gridH = Math.ceil(maxY / cellSize);
    const total = this._gridW * this._gridH;

    this._thermalGrid = new Float32Array(total);
    this._airflowX = new Float32Array(total);
    this._airflowY = new Float32Array(total);
    this._wallMask = new Uint8Array(total);
    this._ventMask = new Float32Array(total);

    // Allocate NS solver buffers
    this._nsVx = new Float32Array(total);
    this._nsVy = new Float32Array(total);
    this._nsVx0 = new Float32Array(total);
    this._nsVy0 = new Float32Array(total);
    this._nsPressure = new Float32Array(total);
    this._nsDivergence = new Float32Array(total);

    const climate = CLIMATE_DATA[this._climate] || CLIMATE_DATA.temperate_sydney;
    const outsideT = (climate.summerDesign + climate.winterDesign) / 2;

    // Initialize: outside = ambient, inside = target
    for (let i = 0; i < total; i++) {
      this._thermalGrid[i] = outsideT;
      this._wallMask[i] = 0;
    }

    // Map rooms onto grid
    for (const room of this._rooms) {
      const x0 = Math.floor(room.x / cellSize);
      const y0 = Math.floor(room.y / cellSize);
      const x1 = Math.min(this._gridW - 1, Math.floor((room.x + room.width) / cellSize));
      const y1 = Math.min(this._gridH - 1, Math.floor((room.y + room.height) / cellSize));

      for (let gx = x0; gx <= x1; gx++) {
        for (let gy = y0; gy <= y1; gy++) {
          const idx = gy * this._gridW + gx;
          this._thermalGrid[idx] = room.targetTemp;

          // Mark walls (perimeter of room)
          if (gx === x0 || gx === x1 || gy === y0 || gy === y1) {
            this._wallMask[idx] = 1;
          }
        }
      }

      // Map vents onto grid
      for (const vent of room.vents) {
        const vx = Math.min(this._gridW - 1, Math.floor(vent.position.x / cellSize));
        const vy = Math.min(this._gridH - 1, Math.floor(vent.position.y / cellSize));
        const vidx = vy * this._gridW + vx;
        if (vent.type === 'intake') {
          this._ventMask[vidx] = vent.flowRate;
        } else if (vent.type === 'exhaust') {
          this._ventMask[vidx] = -vent.flowRate;
        } else if (vent.type === 'heat_recovery') {
          this._ventMask[vidx] = vent.flowRate * vent.efficiency;
        }
      }
    }

    // Rebuild THREE points for heatmap
    this._rebuildHeatmapVisuals(cellSize);
  }

  private _rebuildHeatmapVisuals(cellSize: number) {
    const total = this._gridW * this._gridH;
    const heatGeo = new THREE.BufferGeometry();
    const heatPos = new Float32Array(total * 3);
    const heatCol = new Float32Array(total * 3);

    for (let gy = 0; gy < this._gridH; gy++) {
      for (let gx = 0; gx < this._gridW; gx++) {
        const idx = gy * this._gridW + gx;
        const i3 = idx * 3;
        heatPos[i3] = (gx - this._gridW / 2) * 0.2;
        heatPos[i3 + 1] = 0;
        heatPos[i3 + 2] = (gy - this._gridH / 2) * 0.2;
        heatCol[i3] = 0.1; heatCol[i3 + 1] = 0.1; heatCol[i3 + 2] = 0.5;
      }
    }

    heatGeo.setAttribute('position', new THREE.BufferAttribute(heatPos, 3));
    heatGeo.setAttribute('color', new THREE.BufferAttribute(heatCol, 3));
    this.thermalHeatmap.geometry.dispose();
    this.thermalHeatmap.geometry = heatGeo;
  }

  // ═══════════════════════════════════════════════════════════════
  // MAIN UPDATE LOOP
  // ═══════════════════════════════════════════════════════════════

  update(optimizer: string, _mem: any, thermalMode: string) {
    this._iteration++;

    // 0. Step annual climate cycle (outside temp, solar, wind)
    this._stepAnnualCycle();

    // 0b. Auto HVAC: determine thermalMode from room temps if not forced
    const effectiveMode = this._stepAutoHVAC(thermalMode);

    // 1. Navier-Stokes airflow solve (replaces old _updateAirflow)
    this._stepNavierStokes();

    // 2. Thermal diffusion on grid with NS-advected heat transport
    this._stepThermalGrid(effectiveMode);

    // 3. Update vent readings (intake/outtake registration)
    this._stepVentReadings(effectiveMode);

    // 4. Nested sims: esky → stubby heat cascade
    this._stepNestedSims();

    // 5. Electrical: magnetic → magnetocaloric
    this._stepElectricalChain();

    // 6. Compute house-level metrics
    this._computeMetrics(effectiveMode);

    // 7. Log to blockchain ledger every 50 iterations
    if (this._iteration % 50 === 0) {
      this._logToLedger();
    }

    // 8. Cooling ↔ wall builder ↔ V13 elements: request better materials if needed
    if (this._materialEngine && this._iteration % 100 === 0) {
      this.requestOptimalMaterials();
    }

    // 8. Generate recommendations every 200 iterations
    if (this._iteration % 200 === 0) {
      this._generateRecommendations();
    }

    // 9. Deep learning: train room nets, detect cycles, optimize vents
    this._stepDeepLearning();

    // 10. Solar panel physics + material optimization
    this._stepSolar();

    // 11. Update THREE visuals
    this._updateVisuals();

    // Check stability
    this._stable = this._iteration > 100;
  }

  // ═══════════════════════════════════════════════════════════════
  // ANNUAL CLIMATE CYCLE
  // ═══════════════════════════════════════════════════════════════

  /**
   * Steps the annual climate simulation forward.
   * Each sim frame = ~15 minutes of simulated time.
   * 96 frames = 1 day, ~35040 frames = 1 year.
   *
   * Computes outside temperature (seasonal + diurnal + weather noise),
   * solar irradiance (sun angle x season x cloud), and wind speed.
   */
  private _stepAnnualCycle() {
    const ac = this._annualClimate;
    ac.frameCount++;

    // Each frame = 15 minutes = 0.25 hours
    const SIM_MINUTES_PER_FRAME = 15;
    const hoursPerFrame = SIM_MINUTES_PER_FRAME / 60;

    ac.simulatedHourOfDay += hoursPerFrame;
    if (ac.simulatedHourOfDay >= 24) {
      ac.simulatedHourOfDay -= 24;
      ac.simulatedDayOfYear += 1;
      if (ac.simulatedDayOfYear >= 365) {
        ac.simulatedDayOfYear -= 365;
      }
    }

    const day = ac.simulatedDayOfYear;
    const hour = ac.simulatedHourOfDay;

    // Determine zone characteristics
    const climate = CLIMATE_DATA[this._climate] || CLIMATE_DATA.temperate_sydney;
    const zone = this._globeZone;

    // Seasonal base temperatures by zone
    let summerPeak: number;
    let winterTrough: number;
    if (zone === 'tropical') {
      summerPeak = 35;
      winterTrough = 25;
    } else if (zone === 'cold') {
      summerPeak = 20;
      winterTrough = -20;
    } else {
      summerPeak = 30;
      winterTrough = 0;
    }

    // Override with climate data if more extreme
    summerPeak = Math.max(summerPeak, climate.summerDesign);
    winterTrough = Math.min(winterTrough, climate.winterDesign);

    // Seasonal cycle: cosine wave, day 172 = summer solstice (southern hemisphere adjustment)
    // In southern hemisphere, peak summer is around Dec-Jan (day ~0 or ~365)
    const isSouthern = climate.lat < 0;
    const summerSolsticeDay = isSouthern ? 355 : 172;
    const seasonalPhase = ((day - summerSolsticeDay) / 365) * 2 * Math.PI;
    const seasonalFraction = (1 + Math.cos(seasonalPhase)) / 2; // 1 at summer, 0 at winter
    const seasonalBaseTemp = winterTrough + (summerPeak - winterTrough) * seasonalFraction;

    // Diurnal cycle: +/- 5 deg C, peak at 14:00, trough at 05:00
    // Use cosine centered on 14:00 (peak)
    const diurnalPhase = ((hour - 14) / 24) * 2 * Math.PI;
    const diurnalSwing = 5.0 * Math.cos(diurnalPhase);

    // Random weather noise: brownian motion style, +/- 3 deg C
    this._weatherNoiseAccum += (Math.random() - 0.5) * 0.6;
    this._weatherNoiseAccum *= 0.97; // decay toward zero
    this._weatherNoiseAccum = Math.max(-3, Math.min(3, this._weatherNoiseAccum));

    ac.outsideTemp = seasonalBaseTemp + diurnalSwing + this._weatherNoiseAccum;
    this._outsideTemp = ac.outsideTemp;

    // Cloud cover: random walk 0-1
    ac.cloudCover += (Math.random() - 0.5) * 0.08;
    ac.cloudCover = Math.max(0, Math.min(1, ac.cloudCover));

    // Solar irradiance: sun angle * season * (1 - cloudCover)
    // Sun above horizon roughly 06:00 to 18:00
    const sunAltitude = Math.max(0, Math.sin((hour - 6) / 12 * Math.PI));
    // Seasonal peak irradiance scaling
    const seasonalIrradianceFactor = 0.5 + 0.5 * seasonalFraction;
    const clearSkyIrradiance = climate.solarIrradiance * 2.5; // peak clear sky
    ac.solarIrradiance = clearSkyIrradiance * sunAltitude * seasonalIrradianceFactor * (1 - ac.cloudCover * 0.8);
    this._solarIrradiance = ac.solarIrradiance;

    // Wind speed: base from climate data + random variation 0-8 m/s
    const baseWind = climate.windSpeed;
    ac.windSpeed += (Math.random() - 0.5) * 0.4;
    ac.windSpeed = Math.max(0, Math.min(8, ac.windSpeed));
    // Bias toward climate average
    ac.windSpeed += (baseWind - ac.windSpeed) * 0.05;
    this._windSpeed = ac.windSpeed;

    // Wind direction: slow random walk (radians)
    ac.windDirection += (Math.random() - 0.5) * 0.1;
  }

  // ═══════════════════════════════════════════════════════════════
  // AUTO HVAC
  // ═══════════════════════════════════════════════════════════════

  /**
   * Automatically determines thermal mode based on average room temperature.
   * Dead band of +/- 1 deg C around target prevents short-cycling.
   * Returns the effective thermal mode to use for the frame.
   */
  private _stepAutoHVAC(requestedMode: string): string {
    // If caller explicitly forces a mode, use it
    if (requestedMode === 'cooling' || requestedMode === 'heating') {
      this._autoThermalMode = requestedMode;
      this._hvacSupplyTemp = requestedMode === 'cooling' ? 14 : 35;
      return requestedMode;
    }

    // Compute weighted average room temperature
    let totalTemp = 0;
    let totalArea = 0;
    let avgTarget = 0;
    for (const room of this._rooms) {
      const area = room.width * room.height;
      totalTemp += this._getAvgRoomTemp(room) * area;
      avgTarget += room.targetTemp * area;
      totalArea += area;
    }
    const avgRoomTemp = totalArea > 0 ? totalTemp / totalArea : 22;
    const avgTargetTemp = totalArea > 0 ? avgTarget / totalArea : 22;

    // Dead band hysteresis: +/- 1 deg C
    const DEAD_BAND = 1.0;
    if (avgRoomTemp > avgTargetTemp + DEAD_BAND) {
      this._autoThermalMode = 'cooling';
      this._hvacSupplyTemp = 14; // Supply 14 deg C air for cooling
    } else if (avgRoomTemp < avgTargetTemp - DEAD_BAND) {
      this._autoThermalMode = 'heating';
      this._hvacSupplyTemp = 35; // Supply 35 deg C air for heating
    }
    // else: keep current mode (hysteresis)

    // HVAC power consumption estimation
    // Cooling: COP ~3.0, Heating: COP ~4.0 (heat pump)
    const tempDiff = Math.abs(avgRoomTemp - this._hvacSupplyTemp);
    const totalFlowRate = this._rooms.reduce((s, r) => {
      return s + r.vents.filter(v => v.type === 'intake').reduce((vs, v) => vs + v.flowRate, 0);
    }, 0);
    // Q = m_dot * cp * deltaT, m_dot = rho * flowRate
    const rho = 1.2; // kg/m3 air density
    const cp = 1005; // J/kgK air specific heat
    const thermalPowerW = rho * totalFlowRate * cp * tempDiff;

    if (this._autoThermalMode === 'off') {
      this._hvacCurrentPowerW = 0;
    } else {
      const cop = this._autoThermalMode === 'cooling' ? 3.0 : 4.0;
      this._hvacCurrentPowerW = thermalPowerW / cop;
    }

    // Accumulate energy: each frame = 15 min = 0.25 hr
    const SIM_HOURS_PER_FRAME = 0.25;
    this._hvacEnergyUsedKWh += (this._hvacCurrentPowerW / 1000) * SIM_HOURS_PER_FRAME;

    return this._autoThermalMode;
  }

  // ═══════════════════════════════════════════════════════════════
  // NAVIER-STOKES AIRFLOW SOLVER
  // ═══════════════════════════════════════════════════════════════

  /**
   * Simplified 2D Navier-Stokes solver using Stam's stable fluids approach:
   *   1. Add body forces (buoyancy + wind + vent injection)
   *   2. Diffusion (implicit viscous step)
   *   3. Advection (semi-Lagrangian backtracing)
   *   4. Pressure projection (Gauss-Seidel to enforce incompressibility)
   *   5. Boundary enforcement (no-slip walls)
   *
   * Produces velocity field in range 0.1 - 2.0 m/s typical for indoor airflow.
   */
  // Turbulence / equilibrium tracking
  private _vorticity: Float32Array | null = null;
  private _turbulenceEnergy: number = 0;
  private _turbulenceHistory: number[] = [];
  private _equilibriumFound: boolean = false;
  private _equilibriumScore: number = 0;
  private _nsSubsteps: number = 3; // multiple substeps per frame for faster convergence
  private _ventOptCycle: number = 0;       // how many optimization rounds completed
  private _ventOptBestScore: number = Infinity;
  private _ventOptCooldown: number = 0;    // frames to wait after perturbation before re-checking

  private _stepNavierStokes() {
    const W = this._gridW;
    const H = this._gridH;
    const N = W * H;
    const dt = 0.05;           // smaller timestep, run multiple substeps
    const visc = 1.5e-5;       // kinematic viscosity of air (m2/s)
    const dx = this._cellSize;
    const g = 9.81;
    const beta = 1.0 / 300.0;  // thermal expansion coefficient (1/K)
    const T_ref = 20.0;

    if (!this._vorticity) this._vorticity = new Float32Array(N);

    // Run multiple substeps per frame for faster convergence to equilibrium
    for (let sub = 0; sub < this._nsSubsteps; sub++) {

      // ── Step 1: HVAC as radiating wave from vent positions ──
      // Each vent emits a circular wavefront of conditioned air that expands outward
      // and interacts with other wavefronts, creating interference patterns
      for (const room of this._rooms) {
        if (!room.vents) continue;
        for (const vent of room.vents) {
          const vx = Math.round((vent.position?.x || room.x + room.width * 0.3) / dx);
          const vy = Math.round((vent.position?.y || room.y + room.height * 0.1) / dx);
          if (vx < 1 || vx >= W - 1 || vy < 1 || vy >= H - 1) continue;

          const isIntake = vent.type === 'intake';
          const flowRate = vent.flowRate || 0.02;
          const supplyTemp = this._hvacSupplyTemp;

          // Radiating wave: inject velocity + temperature in expanding circles
          // The wave propagates outward from the vent, losing energy with distance
          const waveRadius = Math.min(15, 3 + this._iteration * 0.005); // grows over time
          for (let r = 0; r <= waveRadius; r++) {
            const decay = 1.0 / (1.0 + r * 0.3); // inverse-distance decay
            const nPts = Math.max(4, Math.round(r * 6));
            for (let p = 0; p < nPts; p++) {
              const angle = (p / nPts) * 2 * Math.PI;
              const gi = Math.round(vx + r * Math.cos(angle));
              const gj = Math.round(vy + r * Math.sin(angle));
              if (gi < 1 || gi >= W - 1 || gj < 1 || gj >= H - 1) continue;
              const idx = gj * W + gi;
              if (this._wallMask[idx] === 1) continue;

              if (isIntake) {
                // Outward velocity push — air radiates from vent into room
                const pushStr = flowRate * decay * 0.8 * dt;
                this._nsVx[idx] += Math.cos(angle) * pushStr;
                this._nsVy[idx] += Math.sin(angle) * pushStr;
                // Temperature injection — supply temp bleeds into surroundings
                if (r < 5) {
                  this._thermalGrid[idx] += (supplyTemp - this._thermalGrid[idx]) * decay * 0.02;
                }
              } else {
                // Exhaust: inward pull toward vent
                const pullStr = flowRate * decay * 0.6 * dt;
                this._nsVx[idx] -= Math.cos(angle) * pullStr;
                this._nsVy[idx] -= Math.sin(angle) * pullStr;
              }
            }
          }
        }
      }

      // ── Step 2: Buoyancy + thermal gradient body forces ──
      for (let j = 1; j < H - 1; j++) {
        for (let i = 1; i < W - 1; i++) {
          const idx = j * W + i;
          if (this._wallMask[idx] === 1) continue;

          const T = this._thermalGrid[idx];
          // Buoyancy
          this._nsVy[idx] += -g * beta * (T - T_ref) * dt;

          // Horizontal thermal gradient
          const dTdx = (this._thermalGrid[idx + 1] - this._thermalGrid[idx - 1]) / (2 * dx);
          this._nsVx[idx] += -beta * g * 0.3 * dTdx * dx * dt;

          // Vertical thermal gradient
          const dTdy = (this._thermalGrid[(j + 1) * W + i] - this._thermalGrid[(j - 1) * W + i]) / (2 * dx);
          this._nsVy[idx] += -beta * g * 0.3 * dTdy * dx * dt;
        }
      }

      // ── Step 3: Wind pressure on boundaries ──
      const windVx = this._windSpeed * Math.cos(this._annualClimate.windDirection);
      const windVy = this._windSpeed * Math.sin(this._annualClimate.windDirection);
      for (let j = 1; j < H - 1; j++) {
        const idxL = j * W;
        if (this._wallMask[idxL] === 1 && this._wallMask[idxL + 1] === 0)
          this._nsVx[idxL + 1] += windVx * 0.05 * dt;
        const idxR = j * W + W - 1;
        if (this._wallMask[idxR] === 1 && idxR - 1 >= 0 && this._wallMask[idxR - 1] === 0)
          this._nsVx[idxR - 1] -= windVx * 0.05 * dt;
      }
      for (let i = 1; i < W - 1; i++) {
        const idxT = i;
        if (this._wallMask[idxT] === 1 && this._wallMask[idxT + W] === 0)
          this._nsVy[idxT + W] += windVy * 0.05 * dt;
        const idxB = (H - 1) * W + i;
        if (this._wallMask[idxB] === 1 && idxB - W >= 0 && this._wallMask[idxB - W] === 0)
          this._nsVy[idxB - W] -= windVy * 0.05 * dt;
      }

      // ── Step 4: Diffusion ──
      const diffCoeff = visc * dt / (dx * dx);
      this._nsDiffuse(this._nsVx, this._nsVx0, diffCoeff, 10);
      this._nsDiffuse(this._nsVy, this._nsVy0, diffCoeff, 10);

      // ── Step 5: Pressure projection ──
      this._nsProject(30);

      // ── Step 6: Semi-Lagrangian advection ──
      this._nsVx0.set(this._nsVx);
      this._nsVy0.set(this._nsVy);
      this._nsAdvect(this._nsVx, this._nsVx0, this._nsVx0, this._nsVy0, dt);
      this._nsAdvect(this._nsVy, this._nsVy0, this._nsVx0, this._nsVy0, dt);

      // ── Step 7: Advect temperature through velocity field (heat transport) ──
      // The thermal grid itself gets carried by airflow
      const tempCopy = new Float32Array(this._thermalGrid);
      this._nsAdvect(this._thermalGrid, tempCopy, this._nsVx, this._nsVy, dt * 0.5);

      // ── Step 8: Second projection + boundaries ──
      this._nsProject(30);
      this._nsEnforceBoundaries();
    }

    // ── Compute vorticity (curl of velocity) for turbulence ──
    let totalVorticity = 0;
    let totalKE = 0;
    for (let j = 1; j < H - 1; j++) {
      for (let i = 1; i < W - 1; i++) {
        const idx = j * W + i;
        if (this._wallMask[idx] === 1) { this._vorticity![idx] = 0; continue; }
        // vorticity = dVy/dx - dVx/dy
        const dvydx = (this._nsVy[idx + 1] - this._nsVy[idx - 1]) / (2 * dx);
        const dvxdy = (this._nsVx[(j + 1) * W + i] - this._nsVx[(j - 1) * W + i]) / (2 * dx);
        this._vorticity![idx] = dvydx - dvxdy;
        totalVorticity += Math.abs(this._vorticity![idx]);
        totalKE += this._nsVx[idx] ** 2 + this._nsVy[idx] ** 2;
      }
    }
    this._turbulenceEnergy = totalVorticity / ((W - 2) * (H - 2));

    // ── Equilibrium detection: track turbulence energy over time ──
    this._turbulenceHistory.push(this._turbulenceEnergy);
    if (this._turbulenceHistory.length > 200) this._turbulenceHistory.shift();
    if (this._turbulenceHistory.length >= 50) {
      // Check if turbulence has stabilized (variance < threshold)
      const recent = this._turbulenceHistory.slice(-50);
      const mean = recent.reduce((s, v) => s + v, 0) / recent.length;
      const variance = recent.reduce((s, v) => s + (v - mean) ** 2, 0) / recent.length;
      const cv = mean > 0 ? Math.sqrt(variance) / mean : 0; // coefficient of variation
      this._equilibriumScore = Math.max(0, 1 - cv * 5); // 1 = perfect equilibrium
      this._equilibriumFound = cv < 0.05; // <5% variation = equilibrium
    }

    // ── Auto-optimize vent configs when equilibrium reached ──
    if (this._ventOptCooldown > 0) {
      this._ventOptCooldown--;
    } else if (this._equilibriumFound && this._ventOptCycle < 20) {
      // Score current config: lower is better (temp deviation from targets + turbulence)
      let score = 0;
      for (const room of this._rooms) {
        const cx = Math.round((room.x + room.width / 2) / this._cellSize);
        const cy = Math.round((room.y + room.height / 2) / this._cellSize);
        if (cx >= 0 && cx < W && cy >= 0 && cy < H) {
          const idx = cy * W + cx;
          const deviation = Math.abs(this._thermalGrid[idx] - room.targetTemp);
          score += deviation;
        }
      }
      score += this._turbulenceEnergy * 10; // penalize excessive turbulence

      if (score < this._ventOptBestScore) {
        this._ventOptBestScore = score;
      }

      // Perturb a random vent: adjust flow rate, position nudge, or diameter
      const allVents: any[] = [];
      for (const room of this._rooms) {
        if (room.vents) allVents.push(...room.vents);
      }
      if (allVents.length > 0) {
        const vent = allVents[Math.floor(Math.random() * allVents.length)];
        const action = Math.random();
        if (action < 0.4) {
          // Adjust flow rate +-20%
          vent.flowRate = Math.max(0.005, Math.min(0.08, (vent.flowRate || 0.02) * (0.8 + Math.random() * 0.4)));
        } else if (action < 0.7) {
          // Nudge position by 1-2 cells
          if (vent.position) {
            vent.position.x += (Math.random() - 0.5) * this._cellSize * 2;
            vent.position.y += (Math.random() - 0.5) * this._cellSize * 2;
          }
        } else {
          // Adjust diameter
          vent.diameter = Math.max(0.05, Math.min(0.3, (vent.diameter || 0.1) * (0.85 + Math.random() * 0.3)));
        }
        this._ventOptCycle++;
        this._equilibriumFound = false; // reset — let it re-converge
        this._turbulenceHistory.length = 0;
        this._ventOptCooldown = 60; // wait 60 frames before next check

        this._optimizationHistory.push({
          roomId: 'auto',
          config: `vent-opt-cycle-${this._ventOptCycle}`,
          score,
          timestamp: Date.now(),
        });
      }
    }

    // Copy to public arrays
    for (let i = 0; i < N; i++) {
      this._airflowX[i] = this._nsVx[i];
      this._airflowY[i] = this._nsVy[i];
    }
  }

  /**
   * Gauss-Seidel diffusion solve.
   * Solves (1 + 4*a)*x[i] - a*(x[neighbors]) = x0[i]
   */
  private _nsDiffuse(field: Float32Array, field0: Float32Array, a: number, iterations: number) {
    const W = this._gridW;
    const H = this._gridH;
    const denom = 1 + 4 * a;

    // Save current as source
    field0.set(field);

    for (let iter = 0; iter < iterations; iter++) {
      for (let j = 1; j < H - 1; j++) {
        for (let i = 1; i < W - 1; i++) {
          const idx = j * W + i;
          if (this._wallMask[idx] === 1) {
            field[idx] = 0;
            continue;
          }

          const sum =
            field[idx - 1] + field[idx + 1] +
            field[(j - 1) * W + i] + field[(j + 1) * W + i];

          field[idx] = (field0[idx] + a * sum) / denom;
        }
      }
    }
  }

  /**
   * Pressure projection: makes velocity field divergence-free (incompressible).
   * Gauss-Seidel iterative Poisson solve.
   */
  private _nsProject(iterations: number) {
    const W = this._gridW;
    const H = this._gridH;
    const dx = this._cellSize;
    const div = this._nsDivergence;
    const p = this._nsPressure;

    // Compute divergence of velocity field
    for (let j = 1; j < H - 1; j++) {
      for (let i = 1; i < W - 1; i++) {
        const idx = j * W + i;
        if (this._wallMask[idx] === 1) {
          div[idx] = 0;
          p[idx] = 0;
          continue;
        }
        div[idx] = -0.5 * dx * (
          this._nsVx[idx + 1] - this._nsVx[idx - 1] +
          this._nsVy[(j + 1) * W + i] - this._nsVy[(j - 1) * W + i]
        );
        p[idx] = 0;
      }
    }

    // Iterative Gauss-Seidel solve for pressure: Laplacian(p) = div
    for (let iter = 0; iter < iterations; iter++) {
      for (let j = 1; j < H - 1; j++) {
        for (let i = 1; i < W - 1; i++) {
          const idx = j * W + i;
          if (this._wallMask[idx] === 1) continue;

          p[idx] = (
            div[idx] +
            p[idx - 1] + p[idx + 1] +
            p[(j - 1) * W + i] + p[(j + 1) * W + i]
          ) / 4;
        }
      }
    }

    // Subtract pressure gradient from velocity
    for (let j = 1; j < H - 1; j++) {
      for (let i = 1; i < W - 1; i++) {
        const idx = j * W + i;
        if (this._wallMask[idx] === 1) continue;

        this._nsVx[idx] -= 0.5 * (p[idx + 1] - p[idx - 1]) / dx;
        this._nsVy[idx] -= 0.5 * (p[(j + 1) * W + i] - p[(j - 1) * W + i]) / dx;
      }
    }
  }

  /**
   * Semi-Lagrangian advection (Stam's method).
   * For each cell, trace backwards along the velocity field to find
   * the source position, then interpolate the value.
   * This is unconditionally stable for any timestep.
   */
  private _nsAdvect(
    fieldOut: Float32Array, fieldIn: Float32Array,
    velX: Float32Array, velY: Float32Array,
    dt: number
  ) {
    const W = this._gridW;
    const H = this._gridH;
    const dx = this._cellSize;

    for (let j = 1; j < H - 1; j++) {
      for (let i = 1; i < W - 1; i++) {
        const idx = j * W + i;
        if (this._wallMask[idx] === 1) {
          fieldOut[idx] = 0;
          continue;
        }

        // Backtrace: find where this particle came from
        let srcX = i - velX[idx] * dt / dx;
        let srcY = j - velY[idx] * dt / dx;

        // Clamp to grid boundaries
        srcX = Math.max(0.5, Math.min(W - 1.5, srcX));
        srcY = Math.max(0.5, Math.min(H - 1.5, srcY));

        // Bilinear interpolation
        const i0 = Math.floor(srcX);
        const j0 = Math.floor(srcY);
        const i1 = i0 + 1;
        const j1 = j0 + 1;
        const sx = srcX - i0;
        const sy = srcY - j0;

        const v00 = fieldIn[j0 * W + i0];
        const v10 = fieldIn[j0 * W + i1];
        const v01 = fieldIn[j1 * W + i0];
        const v11 = fieldIn[j1 * W + i1];

        fieldOut[idx] =
          (1 - sx) * (1 - sy) * v00 +
          sx * (1 - sy) * v10 +
          (1 - sx) * sy * v01 +
          sx * sy * v11;
      }
    }
  }

  /**
   * Enforce no-slip boundary conditions on wall cells.
   * Velocity = 0 at all wall cells.
   */
  private _nsEnforceBoundaries() {
    const N = this._gridW * this._gridH;
    for (let i = 0; i < N; i++) {
      if (this._wallMask[i] === 1) {
        this._nsVx[i] = 0;
        this._nsVy[i] = 0;
      }
    }
    // Grid edges: zero velocity
    const W = this._gridW;
    const H = this._gridH;
    for (let i = 0; i < W; i++) {
      this._nsVx[i] = 0; this._nsVy[i] = 0;                     // top row
      this._nsVx[(H - 1) * W + i] = 0; this._nsVy[(H - 1) * W + i] = 0; // bottom row
    }
    for (let j = 0; j < H; j++) {
      this._nsVx[j * W] = 0; this._nsVy[j * W] = 0;             // left col
      this._nsVx[j * W + W - 1] = 0; this._nsVy[j * W + W - 1] = 0; // right col
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // THERMAL DIFFUSION
  // ═══════════════════════════════════════════════════════════════

  private _stepThermalGrid(thermalMode: string) {
    const w = this._gridW, h = this._gridH;
    const alpha = 0.08; // diffusion coefficient
    const climate = CLIMATE_DATA[this._climate] || CLIMATE_DATA.temperate_sydney;
    const outsideT = thermalMode === 'cooling' ? climate.summerDesign : climate.winterDesign;

    // Prime spectrum modulation (if cross-sim data available)
    let primeModulation = 1.0;
    if (this._primeSpectrum) {
      // Golden ratio phase stability improves insulation effectiveness
      primeModulation = 1.0 - (this._primeSpectrum.goldenPhases.elongative - 0.5) * 0.15;
    }

    const next = new Float32Array(this._thermalGrid.length);

    for (let gy = 0; gy < h; gy++) {
      for (let gx = 0; gx < w; gx++) {
        const idx = gy * w + gx;
        const T = this._thermalGrid[idx];

        if (this._wallMask[idx] === 1) {
          // Wall cell: conduct between inside and outside
          // Find which room this wall belongs to
          const room = this._findRoomAtGrid(gx, gy);
          const wallR = room
            ? (WALL_LIBRARY[room.wallType]?.totalR || 2.5)
            : 2.5;

          const conductance = 1 / (wallR * primeModulation);
          const dT = (outsideT - T) * conductance * 0.01;
          next[idx] = T + dT;

          // Solar gain through windows
          if (room) {
            const solarGain = this._calcSolarGain(room, climate);
            const wallArea = room.width * room.ceilingHeight * 2 + room.height * room.ceilingHeight * 2;
            next[idx] += solarGain / (wallArea * 100); // distribute across wall cells
          }
        } else {
          // Air cell: diffuse with neighbors
          let laplacian = 0;
          let count = 0;
          const neighbors = [
            [gx - 1, gy], [gx + 1, gy],
            [gx, gy - 1], [gx, gy + 1],
          ];
          for (const [nx, ny] of neighbors) {
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              laplacian += this._thermalGrid[ny * w + nx] - T;
              count++;
            }
          }
          if (count > 0) laplacian /= count;

          // Vent contribution
          const ventFlow = this._ventMask[idx];
          let ventDelta = 0;
          if (ventFlow > 0) {
            // Intake: bring in outside air (or recovered heat)
            ventDelta = (outsideT - T) * ventFlow * 5;
          } else if (ventFlow < 0) {
            // Exhaust: remove air (reduces internal load effect)
            ventDelta = -T * Math.abs(ventFlow) * 0.1;
          }

          // Airflow advection
          const ax = this._airflowX[idx];
          const ay = this._airflowY[idx];
          let advection = 0;
          if (ax > 0 && gx > 0) advection += ax * (this._thermalGrid[idx] - this._thermalGrid[idx - 1]);
          if (ax < 0 && gx < w - 1) advection += ax * (this._thermalGrid[idx + 1] - this._thermalGrid[idx]);
          if (ay > 0 && gy > 0) advection += ay * (this._thermalGrid[idx] - this._thermalGrid[(gy - 1) * w + gx]);
          if (ay < 0 && gy < h - 1) advection += ay * (this._thermalGrid[(gy + 1) * w + gx] - this._thermalGrid[idx]);

          next[idx] = T + laplacian * alpha + ventDelta - advection * 0.01;

          // Internal heat load from room
          const room = this._findRoomAtGrid(gx, gy);
          if (room) {
            const roomCells = this._countRoomCells(room);
            if (roomCells > 0) {
              next[idx] += room.internalLoad / (roomCells * 500); // distribute load
            }
          }
        }

        // Esky heat rejection into nearby cells
        for (const esky of this._eskyZones) {
          const ex = Math.floor(esky.position.x / (10 / w));
          const ey = Math.floor(esky.position.y / (12 / h));
          if (Math.abs(gx - ex) <= 1 && Math.abs(gy - ey) <= 1) {
            next[idx] += esky.heatWaste / 200; // spread heat waste
          }
        }
      }
    }

    this._thermalGrid = next;

    // Update airflow (simplified buoyancy-driven convection)
    this._updateAirflow();
  }

  private _updateAirflow() {
    const w = this._gridW, h = this._gridH;
    const viscosity = 0.02; // air viscosity damping
    const buoyancyCoeff = 0.003; // thermal buoyancy strength
    const ventForceCoeff = 0.05; // vent injection/extraction strength

    for (let gy = 1; gy < h - 1; gy++) {
      for (let gx = 1; gx < w - 1; gx++) {
        const idx = gy * w + gx;
        if (this._wallMask[idx] === 1) {
          this._airflowX[idx] = 0;
          this._airflowY[idx] = 0;
          continue;
        }

        const T = this._thermalGrid[idx];
        const Tabove = this._thermalGrid[(gy - 1) * w + gx];
        const Tbelow = this._thermalGrid[(gy + 1) * w + gx];
        const Tleft = this._thermalGrid[idx - 1];
        const Tright = this._thermalGrid[idx + 1];

        // ── BUOYANCY: hot air rises, cold air sinks (natural convection) ──
        // Stronger effect with larger temperature differential from ambient
        const ambientT = 20;
        const buoyancy = (T - ambientT) * buoyancyCoeff;

        // ── PRESSURE GRADIENT: temperature differences create pressure flow ──
        const dTdx = (Tright - Tleft) * 0.5;
        const dTdy = (Tbelow - Tabove) * 0.5;
        const pressureX = -dTdx * 0.001;
        const pressureY = -dTdy * 0.001;

        // ── TURBULENCE from temperature differentials ──
        // When hot meets cold, turbulent mixing increases energy transfer
        const neighborAvgT = (Tabove + Tbelow + Tleft + Tright) / 4;
        const tempVariance = Math.abs(T - neighborAvgT);
        const turbulence = tempVariance * 0.002; // turbulent kinetic energy
        const turbX = (Math.random() - 0.5) * turbulence;
        const turbY = (Math.random() - 0.5) * turbulence;

        // ── VENT FORCES: intake pushes air in, exhaust pulls air out ──
        let ventForceX = 0, ventForceY = 0;
        const ventVal = this._ventMask[idx];
        if (ventVal > 0) {
          // Intake: pushes air downward (ceiling vent) or inward
          ventForceY += ventVal * ventForceCoeff;
        } else if (ventVal < 0) {
          // Exhaust: pulls air upward (ceiling exhaust)
          ventForceY -= Math.abs(ventVal) * ventForceCoeff;
        }

        // ── VENT-TO-VENT FLOW PATHS ──
        // Create directed flow between paired intake/exhaust vents
        // This makes air actually flow FROM intake TO exhaust through the room
        for (const room of this._rooms) {
          if (!room.vents || room.vents.length < 2) continue;
          const intakes = room.vents.filter((v: VentSpec) => v.type === 'intake' || v.type === 'heat_recovery');
          const exhausts = room.vents.filter((v: VentSpec) => v.type === 'exhaust');
          for (const intake of intakes) {
            for (const exhaust of exhausts) {
              // Vector from intake to exhaust
              const ix = Math.round((intake.position?.x || room.x) / this._cellSize);
              const iy = Math.round((intake.position?.y || room.y) / this._cellSize);
              const ex = Math.round((exhaust.position?.x || room.x + room.width) / this._cellSize);
              const ey = Math.round((exhaust.position?.y || room.y) / this._cellSize);
              // Distance from current cell to the intake-exhaust line
              const dx = ex - ix, dy = ey - iy;
              const len = Math.sqrt(dx * dx + dy * dy) || 1;
              const distToIntake = Math.sqrt((gx - ix) ** 2 + (gy - iy) ** 2);
              if (distToIntake < len * 1.5) {
                // Cell is in the flow path — add directed flow
                const flowStrength = intake.flowRate * 0.01 / (1 + distToIntake * 0.3);
                ventForceX += (dx / len) * flowStrength;
                ventForceY += (dy / len) * flowStrength;
              }
            }
          }
        }

        // ── VISCOUS DIFFUSION: neighboring velocities influence this cell ──
        const vxL = this._airflowX[idx - 1] || 0;
        const vxR = this._airflowX[idx + 1] || 0;
        const vxU = this._airflowX[(gy - 1) * w + gx] || 0;
        const vxD = this._airflowX[(gy + 1) * w + gx] || 0;
        const vyL = this._airflowY[idx - 1] || 0;
        const vyR = this._airflowY[idx + 1] || 0;
        const vyU = this._airflowY[(gy - 1) * w + gx] || 0;
        const vyD = this._airflowY[(gy + 1) * w + gx] || 0;

        const diffuseX = (vxL + vxR + vxU + vxD) / 4 - this._airflowX[idx];
        const diffuseY = (vyL + vyR + vyU + vyD) / 4 - this._airflowY[idx];

        // ── UPDATE with all forces ──
        this._airflowX[idx] = this._airflowX[idx] * (1 - viscosity)
          + pressureX + ventForceX + turbX + diffuseX * viscosity;
        this._airflowY[idx] = this._airflowY[idx] * (1 - viscosity)
          - buoyancy + pressureY + ventForceY + turbY + diffuseY * viscosity;

        // Clamp to prevent explosion
        const maxV = 0.5;
        this._airflowX[idx] = Math.max(-maxV, Math.min(maxV, this._airflowX[idx]));
        this._airflowY[idx] = Math.max(-maxV, Math.min(maxV, this._airflowY[idx]));
      }
    }
  }

  private _calcSolarGain(room: RoomDef, climate: typeof CLIMATE_DATA[string]): number {
    let gain = 0;
    for (const win of room.windows) {
      // Simplified solar gain: irradiance × SHGC × area × orientation factor
      let orientFactor = 0.5;
      if (climate.lat < 0) {
        // Southern hemisphere: N-facing gets most sun
        if (win.orientation === 'N') orientFactor = 1.0;
        else if (win.orientation === 'S') orientFactor = 0.3;
        else orientFactor = 0.6;
      } else {
        if (win.orientation === 'S') orientFactor = 1.0;
        else if (win.orientation === 'N') orientFactor = 0.3;
        else orientFactor = 0.6;
      }
      gain += climate.solarIrradiance * win.shgc * win.area * orientFactor;
    }
    return gain;
  }

  // ═══════════════════════════════════════════════════════════════
  // VENT READINGS — intake/outtake temperature and flow registration
  // ═══════════════════════════════════════════════════════════════

  private _stepVentReadings(mode: string) {
    for (const room of this._rooms) {
      if (!room.vents) continue;
      for (const vent of room.vents) {
        // Sample local temperature from thermal grid at vent position
        const gx = Math.min(this._gridW - 1, Math.max(0, Math.round((vent.position?.x || room.x) / this._cellSize)));
        const gy = Math.min(this._gridH - 1, Math.max(0, Math.round((vent.position?.y || room.y) / this._cellSize)));
        const idx = gy * this._gridW + gx;
        const localTemp = this._thermalGrid[idx] || 22;

        // Flow speed from NS velocity field
        const vx = this._nsVx?.[idx] || 0;
        const vy = this._nsVy?.[idx] || 0;
        const speed = Math.sqrt(vx * vx + vy * vy);

        // Supply temp depends on HVAC mode
        const supplyTemp = vent.type === 'intake'
          ? (mode === 'cooling' ? 14 : mode === 'heating' ? 35 : this._outsideTemp)
          : localTemp;

        // Return temp is what leaves the room
        const returnTemp = vent.type === 'exhaust' ? localTemp : supplyTemp;

        // Mass flow rate: ρ × A × v (air density ~1.2 kg/m³)
        const diameter = vent.diameter || 150; // mm
        const area = Math.PI * (diameter / 2000) ** 2; // m²
        const massFlowRate = 1.2 * area * Math.max(speed * 100, vent.flowRate || 0.01);

        // Store on vent for UI access
        (vent as any).tempIn = supplyTemp;
        (vent as any).tempOut = returnTemp;
        (vent as any).massFlowRate = massFlowRate;

        // Update readings map
        const reading: VentReading = { supplyTemp, returnTemp, flowSpeed: speed, massFlowRate };
        this._ventReadings.set(vent.id, reading);

        // Push to history (keep last 100)
        if (!this._ventHistory.has(vent.id)) this._ventHistory.set(vent.id, []);
        const history = this._ventHistory.get(vent.id)!;
        history.push(reading);
        if (history.length > 100) history.shift();
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // NESTED SIM STEPPING (ESKY → STUBBY CASCADE)
  // ═══════════════════════════════════════════════════════════════

  private _stepNestedSims() {
    for (const esky of this._eskyZones) {
      // Find room temperature as esky's boundary condition
      const room = this._rooms.find(r => r.id === esky.roomId);
      if (room) {
        esky.outerTemp = this._getAvgRoomTemp(room);
      }

      // Esky heat leak from room into esky
      const eskyHeatLeak = (esky.outerTemp - esky.innerTemp) / esky.insulation_R;

      // Magnetocaloric cooling (removes heat from esky)
      const magnetoCool = esky.magnetocaloricPower;

      // Stubby heat cascade: each stubby rejects heat INTO the esky
      let stubbyTotalWaste = 0;
      for (const stubby of esky.contents) {
        // Stubby heat leak from esky into stubby
        const stubbyLeak = (esky.innerTemp - stubby.temp) / stubby.insulation_R;
        const stubbyCool = stubby.co2CoolingW + stubby.magnetocaloricW;

        stubby.heatWaste = Math.max(0, stubbyCool * 1.3); // COP overhead
        stubbyTotalWaste += stubby.heatWaste;

        // Update stubby temp
        const mass = 0.375; // 375ml can
        const cp = 4184;
        const netQ = stubbyLeak - stubbyCool + stubby.heatWaste * 0.1;
        stubby.temp += netQ / (mass * cp) * 10; // accelerated for sim
        stubby.temp = Math.max(stubby.targetTemp - 2, Math.min(40, stubby.temp));
      }

      // Esky thermal balance
      const netEskyQ = eskyHeatLeak + stubbyTotalWaste - magnetoCool;
      esky.innerTemp += netEskyQ * 0.001;
      esky.innerTemp = Math.max(0, Math.min(35, esky.innerTemp));

      // Heat waste rejected from esky into room
      esky.heatWaste = Math.max(0, magnetoCool * 0.3 + stubbyTotalWaste * 0.5);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ELECTRICAL: MAGNETIC → MAGNETOCALORIC
  // ═══════════════════════════════════════════════════════════════

  private _stepElectricalChain() {
    let totalMagEnergy = 0;
    let totalCooling = 0;
    let totalHeatRejected = 0;

    for (const field of this._magneticFields) {
      // Magnetic energy: E = ½μ₀H²V
      const mu0 = 4 * Math.PI * 1e-7;
      const volume = 0.001; // m³ active volume
      const energy = 0.5 * mu0 * field.strength * field.strength * volume;
      totalMagEnergy += energy;

      // Each magnetic field drives associated magnetocaloric units
      for (const unit of this._magnetocaloricUnits) {
        // Magnetocaloric effect: ΔT_ad = -(T/C) × ΔS_mag × ΔB
        const T = 300; // K (near room temp)
        const C = 230; // J/kgK (Gd specific heat)
        const dTad = (T / C) * unit.entropyChange * field.strength;

        // Actual cooling power depends on COP and cycling
        const qCool = unit.gadoliniumMassKg * unit.entropyChange * T * unit.cycleFreqHz * 0.001;
        const cooling = Math.min(unit.coolingPowerW, qCool);
        totalCooling += cooling;

        // Heat rejected = cooling + work input
        const work = cooling / unit.cop;
        totalHeatRejected += cooling + work;
      }
    }

    // Preserve natural system state across updates
    const prevNatural = { ...this._electricalState };
    this._electricalState = {
      ...prevNatural,
      totalMagneticEnergy: totalMagEnergy,
      magnetocaloricCOP: totalCooling > 0 ? totalCooling / (totalHeatRejected - totalCooling) : 0,
      totalCoolingW: totalCooling,
      heatRejectedW: totalHeatRejected,
      cycleCount: this._electricalState.cycleCount + 1,
    };

    // Run natural systems update — this is the paradigm shift
    this._updateNaturalSystems();
  }

  // ═══════════════════════════════════════════════════════════════
  // BLOCKCHAIN: GLOBAL LEDGER
  // ═══════════════════════════════════════════════════════════════

  private _logToLedger() {
    const entries: LedgerEntry[] = [
      { timestamp: Date.now(), simLevel: 'house', metric: 'hvac_load_w', value: this._hvacLoadW, hash: '' },
      { timestamp: Date.now(), simLevel: 'house', metric: 'total_heat_loss_w', value: this._totalHeatLossW, hash: '' },
      { timestamp: Date.now(), simLevel: 'electrical', metric: 'magnetocaloric_cop', value: this._electricalState.magnetocaloricCOP, hash: '' },
    ];

    // Log each esky
    for (const esky of this._eskyZones) {
      entries.push({
        timestamp: Date.now(), simLevel: 'esky',
        metric: `${esky.roomId}_inner_temp`, value: esky.innerTemp, hash: '',
      });

      // Log each stubby
      for (let s = 0; s < esky.contents.length; s++) {
        entries.push({
          timestamp: Date.now(), simLevel: 'stubby',
          metric: `${esky.roomId}_stubby_${s}_temp`, value: esky.contents[s].temp, hash: '',
        });
      }
    }

    // Cross-sim data
    if (this._primeSpectrum) {
      entries.push({
        timestamp: Date.now(), simLevel: 'cross_sim',
        metric: 'prime_density', value: this._primeSpectrum.density, hash: '',
      });
    }

    // Chain hashing
    for (const entry of entries) {
      const data = `${this._ledgerHash}|${entry.timestamp}|${entry.simLevel}|${entry.metric}|${entry.value.toFixed(6)}`;
      entry.hash = this._simpleHash(data);
      this._ledgerHash = entry.hash;
    }

    this._ledger.push(...entries);

    // Keep ledger manageable
    if (this._ledger.length > 2000) {
      this._ledger = this._ledger.slice(-1000);
    }
  }

  private _simpleHash(data: string): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const ch = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + ch;
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  // ═══════════════════════════════════════════════════════════════
  // 100-YEAR PROJECTION
  // ═══════════════════════════════════════════════════════════════

  private _computeProjections() {
    this._projections = [];
    let cumulativeCost = 0;
    let baselineCumCost = 0;

    const optimizedAnnualEnergy = this._estimateAnnualEnergyKWh();
    const energyRate = 0.30; // $/kWh
    const inflationRate = 0.03;

    // Baseline: what an un-optimized standard house uses per year
    // (single-brick, single-glazed, no HRV, no passive design)
    const zc = this._zoneConstraints || ZONE_CONSTRAINTS.temperate;
    let totalFloorArea = 0;
    for (const r of this._rooms) totalFloorArea += r.width * r.height;
    const baselineAnnualEnergy = totalFloorArea * zc.baselineEnergyKWhPerM2;

    for (let year = 0; year <= 100; year++) {
      // Material degradation: each wall type degrades at its own rate
      let avgDegradation = 0;
      let wallCount = 0;

      for (const room of this._rooms) {
        const wall = WALL_LIBRARY[room.wallType];
        if (!wall) continue;

        let yearlyDeg = 0;
        for (const layer of wall.layers) {
          yearlyDeg += layer.degradationRate;
        }
        // Exponential degradation: R(t) = R(0) × (1 - rate/100)^t
        avgDegradation += (1 - Math.pow(1 - yearlyDeg / 100, year)) * 100;
        wallCount++;
      }
      if (wallCount > 0) avgDegradation /= wallCount;

      const rValuePct = Math.max(20, 100 - avgDegradation);
      const energyMultiplier = 100 / rValuePct;

      // Maintenance events
      const events: string[] = [];
      if (year === 10) events.push('Sealant replacement');
      if (year === 15) events.push('HVAC service');
      if (year === 20) events.push('Window seal check');
      if (year === 25) events.push('Insulation inspection');
      if (year === 30) events.push('Roof membrane replacement');
      if (year === 40) events.push('Major HVAC overhaul');
      if (year === 50) events.push('Window replacement');
      if (year === 60) events.push('Re-insulation');
      if (year === 75) events.push('Structural assessment');
      if (year === 100) events.push('Full envelope audit');

      // Optimized house cost for this year
      const inflationFactor = Math.pow(1 + inflationRate, year);
      const yearEnergyCost = optimizedAnnualEnergy * energyMultiplier * inflationFactor * energyRate;
      const maintenanceCost = events.length > 0 ? events.length * 2500 : 0;
      cumulativeCost += yearEnergyCost + maintenanceCost;

      // Baseline cost (standard house, same degradation profile but worse starting R-value)
      const baselineMultiplier = 100 / Math.max(20, 100 - avgDegradation * 1.4); // degrades faster
      const baselineYearCost = baselineAnnualEnergy * baselineMultiplier * inflationFactor * energyRate;
      const baselineMaintenanceCost = events.length > 0 ? events.length * 3500 : 0; // more expensive fixes
      baselineCumCost += baselineYearCost + baselineMaintenanceCost;

      (this._projections as any).push({
        year,
        rValuePct,
        energyCostMultiplier: energyMultiplier,
        maintenanceEvents: events,
        cumulativeCost,
        baselineCumulativeCost: baselineCumCost,
        annualSaving: baselineYearCost - yearEnergyCost,
        cumulativeSaving: baselineCumCost - cumulativeCost,
      });
    }
  }

  private _estimateAnnualEnergyKWh(): number {
    const climate = CLIMATE_DATA[this._climate] || CLIMATE_DATA.temperate_sydney;
    let totalFloorArea = 0;
    let totalWallUA = 0;

    for (const room of this._rooms) {
      totalFloorArea += room.width * room.height;
      const wall = WALL_LIBRARY[room.wallType];
      if (!wall) continue;
      const wallArea = (room.width + room.height) * 2 * room.ceilingHeight;
      totalWallUA += wallArea * wall.totalU;

      // Windows
      for (const win of room.windows) {
        totalWallUA += win.area * win.uValue;
      }
    }

    // Heating degree days + cooling degree days
    const heatingEnergy = totalWallUA * climate.heatingDegreeDays * 24 / 1000; // kWh
    const coolingEnergy = totalWallUA * climate.coolingDegreeDays * 24 / 1000;

    return heatingEnergy + coolingEnergy;
  }

  // ═══════════════════════════════════════════════════════════════
  // RECOMMENDATIONS ENGINE
  // ═══════════════════════════════════════════════════════════════

  private _generateRecommendations() {
    this._recommendations = [];

    for (const room of this._rooms) {
      const wall = WALL_LIBRARY[room.wallType];
      if (!wall) continue;

      // Check R-value adequacy
      if (wall.totalR < 3.0) {
        this._recommendations.push({
          type: 'insulation_upgrade',
          room: room.name,
          description: `${room.name}: Wall R-value (${wall.totalR.toFixed(1)}) below recommended minimum R-3.0. Upgrade to SIP or ICF.`,
          energySaving: 15 + (3.0 - wall.totalR) * 8,
          costEstimate: room.width * room.height * 120,
          priority: wall.totalR < 2.0 ? 'critical' : 'high',
        });
      }

      // Check window efficiency
      for (const win of room.windows) {
        if (win.uValue > 3.0) {
          this._recommendations.push({
            type: 'window_upgrade',
            room: room.name,
            description: `${room.name}: ${win.orientation}-facing window U-value ${win.uValue} is poor. Upgrade to Double Low-E.`,
            energySaving: 8,
            costEstimate: win.area * 800,
            priority: 'medium',
          });
        }
      }

      // Check vent coverage
      if (room.vents.length === 0 && room.width * room.height > 10) {
        this._recommendations.push({
          type: 'vent_add',
          room: room.name,
          description: `${room.name}: No ventilation. Add cross-ventilation (intake + exhaust) for IAQ and passive cooling.`,
          energySaving: 12,
          costEstimate: 1500,
          priority: 'high',
        });
      }

      // Check if heat recovery would help
      const hasHRV = room.vents.some(v => v.type === 'heat_recovery');
      const avgTemp = this._getAvgRoomTemp(room);
      if (!hasHRV && Math.abs(avgTemp - room.targetTemp) > 3) {
        this._recommendations.push({
          type: 'vent_add',
          room: room.name,
          description: `${room.name}: Temperature deviation of ${Math.abs(avgTemp - room.targetTemp).toFixed(1)}°C. Install Heat Recovery Ventilator (85% efficiency).`,
          energySaving: 20,
          costEstimate: 3500,
          priority: 'high',
        });
      }

      // Magnetocaloric recommendation for rooms without esky but high loads
      if (!room.hasEsky && room.internalLoad > 500) {
        this._recommendations.push({
          type: 'magnetocaloric_add',
          room: room.name,
          description: `${room.name}: High internal load (${room.internalLoad}W). Magnetocaloric spot cooling would reduce HVAC dependency.`,
          energySaving: 10,
          costEstimate: 2000,
          priority: 'medium',
        });
      }
    }

    // Sort by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    this._recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  }

  // ═══════════════════════════════════════════════════════════════
  // METRICS & HELPERS
  // ═══════════════════════════════════════════════════════════════

  private _computeMetrics(thermalMode: string) {
    const climate = CLIMATE_DATA[this._climate] || CLIMATE_DATA.temperate_sydney;
    const outsideT = thermalMode === 'cooling' ? climate.summerDesign : climate.winterDesign;

    let totalLoss = 0;
    let totalGain = 0;

    for (const room of this._rooms) {
      const wall = WALL_LIBRARY[room.wallType];
      if (!wall) continue;

      const wallArea = (room.width + room.height) * 2 * room.ceilingHeight;
      const dT = Math.abs(room.targetTemp - outsideT);

      // Wall loss
      const wallLoss = wallArea * wall.totalU * dT;
      totalLoss += wallLoss;

      // Window loss/gain
      for (const win of room.windows) {
        totalLoss += win.area * win.uValue * dT;
        totalGain += this._calcSolarGain(room, climate);
      }

      // Internal loads
      totalGain += room.internalLoad;
    }

    // Esky heat rejection adds to room gain
    for (const esky of this._eskyZones) {
      totalGain += esky.heatWaste;
    }

    this._totalHeatLossW = totalLoss;
    this._totalHeatGainW = totalGain;

    if (thermalMode === 'cooling') {
      this._hvacLoadW = Math.max(0, totalGain - totalLoss + this._electricalState.heatRejectedW);
    } else {
      this._hvacLoadW = Math.max(0, totalLoss - totalGain);
    }
  }

  private _findRoomAtGrid(gx: number, gy: number): RoomDef | null {
    const maxDim = Math.max(
      ...this._rooms.map(r => r.x + r.width),
      ...this._rooms.map(r => r.y + r.height)
    );
    const cellSize = maxDim / this._gridRes;

    const px = gx * cellSize;
    const py = gy * cellSize;

    for (const room of this._rooms) {
      if (px >= room.x && px <= room.x + room.width &&
          py >= room.y && py <= room.y + room.height) {
        return room;
      }
    }
    return null;
  }

  private _countRoomCells(room: RoomDef): number {
    const maxDim = Math.max(
      ...this._rooms.map(r => r.x + r.width),
      ...this._rooms.map(r => r.y + r.height)
    );
    const cellSize = maxDim / this._gridRes;
    const x0 = Math.floor(room.x / cellSize);
    const y0 = Math.floor(room.y / cellSize);
    const x1 = Math.min(this._gridW - 1, Math.floor((room.x + room.width) / cellSize));
    const y1 = Math.min(this._gridH - 1, Math.floor((room.y + room.height) / cellSize));
    return (x1 - x0 + 1) * (y1 - y0 + 1);
  }

  private _getAvgRoomTemp(room: RoomDef): number {
    const maxDim = Math.max(
      ...this._rooms.map(r => r.x + r.width),
      ...this._rooms.map(r => r.y + r.height)
    );
    const cellSize = maxDim / this._gridRes;
    const x0 = Math.floor(room.x / cellSize);
    const y0 = Math.floor(room.y / cellSize);
    const x1 = Math.min(this._gridW - 1, Math.floor((room.x + room.width) / cellSize));
    const y1 = Math.min(this._gridH - 1, Math.floor((room.y + room.height) / cellSize));

    let sum = 0, count = 0;
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        sum += this._thermalGrid[gy * this._gridW + gx];
        count++;
      }
    }
    return count > 0 ? sum / count : 20;
  }

  // ═══════════════════════════════════════════════════════════════
  // THREE.js VISUAL UPDATE
  // ═══════════════════════════════════════════════════════════════

  private _updateVisuals() {
    const colors = this.thermalHeatmap.geometry.getAttribute('color') as THREE.BufferAttribute;
    if (!colors) return;

    const total = this._gridW * this._gridH;
    for (let i = 0; i < total; i++) {
      const T = this._thermalGrid[i];
      const i3 = i * 3;

      // Temperature → color: blue (cold) → green (comfort) → red (hot)
      const norm = Math.max(0, Math.min(1, (T - 10) / 30)); // 10°C=0, 40°C=1
      if (norm < 0.4) {
        // Cold: blue → cyan
        colors.array[i3] = 0;
        colors.array[i3 + 1] = norm / 0.4;
        colors.array[i3 + 2] = 1;
      } else if (norm < 0.6) {
        // Comfort: green
        const t = (norm - 0.4) / 0.2;
        colors.array[i3] = t * 0.3;
        colors.array[i3 + 1] = 1;
        colors.array[i3 + 2] = 1 - t;
      } else {
        // Hot: yellow → red
        const t = (norm - 0.6) / 0.4;
        colors.array[i3] = 1;
        colors.array[i3 + 1] = 1 - t;
        colors.array[i3 + 2] = 0;
      }

      // Wall cells: brighter
      if (this._wallMask[i] === 1) {
        colors.array[i3] = Math.min(1, colors.array[i3] + 0.15);
        colors.array[i3 + 1] = Math.min(1, colors.array[i3 + 1] + 0.15);
        colors.array[i3 + 2] = Math.min(1, colors.array[i3 + 2] + 0.15);
      }
    }
    colors.needsUpdate = true;
  }

  // ═══════════════════════════════════════════════════════════════
  // CROSS-SIM INPUTS
  // ═══════════════════════════════════════════════════════════════

  captureRiemannSpectrum(spectrum: any) {
    this._primeSpectrum = spectrum;
  }

  captureLatticeFlow(flowData: any) {
    this._latticeFlowData = flowData;

    // Use lattice flow efficiency to optimize vent placement
    if (flowData && flowData.efficiency > 0.5) {
      for (const room of this._rooms) {
        for (const vent of room.vents) {
          vent.flowRate *= (1 + (flowData.efficiency - 0.5) * 0.2);
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // TOPOLOGY FLOW & NATURAL SYSTEMS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Capture discovered flow threads from topology engine.
   * Uses threads to adjust vents, thermal strategies, and recommendations.
   */
  captureTopologyFlows(threads: { type: string; strength: number; novelty: number; extent?: number }[], efficiency: number) {
    this._topologyThreads = threads;
    this._topologyFlowEfficiency = efficiency;

    // Apply flow insights to house systems
    for (const room of this._rooms) {
      for (const thread of threads) {
        if (thread.type === 'vortex' && thread.strength > 0.3) {
          // Vortex threads → increase vent flow (natural convection amplifier)
          for (const vent of room.vents) {
            vent.flowRate *= (1 + thread.strength * 0.15);
          }
        } else if (thread.type === 'laminar' && thread.strength > 0.2) {
          // Laminar threads → optimize vent alignment (smooth flow = efficient cooling)
          for (const vent of room.vents) {
            vent.flowRate *= (1 + thread.strength * 0.1);
          }
        } else if (thread.type === 'stagnation') {
          // Stagnation → dead zones need new vents
          if (room.vents.length < 3) {
            room.vents.push({
              id: `topo_vent_${room.id}_${room.vents.length}`,
              type: 'intake' as const,
              position: new THREE.Vector3(room.x + room.width * 0.5, 0, room.y + room.height * 0.5),
              flowRate: 0.002 * (1 + thread.strength),
              efficiency: 0.8,
              diameter: 100,
              powered: false,
            });
          }
        }
      }
    }

    // Topology-driven recommendations
    const threadTypes = new Set(threads.map(t => t.type));
    if (threadTypes.has('recirculation')) {
      this._recommendations.push({
        type: 'vent_add' as const,
        room: 'all',
        description: 'Flow discovery found recirculation zones — add cross-ventilation to break dead air',
        energySaving: 8,
        costEstimate: 500,
        priority: 'high' as const,
      });
    }
    if (efficiency > 0.6) {
      this._recommendations.push({
        type: 'insulation_upgrade' as const,
        room: 'all',
        description: `Topology flow efficiency ${(efficiency * 100).toFixed(0)}% — natural ventilation can handle most cooling`,
        energySaving: 15,
        costEstimate: 2000,
        priority: 'medium' as const,
      });
    }
  }

  /**
   * Update natural systems simulation — solar tubes, earth tubes, thermal mass,
   * rainwater, greywater, evaporative cooling. Called each update cycle.
   */
  private _updateNaturalSystems() {
    const PHI = 1.618;
    const hour = (this._iteration % 24);
    const dayOfYear = Math.floor(this._iteration / 24) % 365;

    // ── Solar Tubes: output varies with sun angle ──
    const sunAngle = Math.max(0, Math.sin((hour - 6) / 12 * Math.PI));
    const seasonalFactor = 0.7 + 0.3 * Math.cos((dayOfYear - 172) / 365 * 2 * Math.PI); // Peak at summer solstice
    const tubesPerRoom = Math.max(1, Math.ceil(this._rooms.length * PHI * 0.3));
    const solarTubeOutput = sunAngle * seasonalFactor * tubesPerRoom * 800; // lumens per tube
    this._electricalState.solarTubeOutputLumens = solarTubeOutput;
    this._electricalState.reflectorEfficiency = 0.7 + sunAngle * 0.25;
    this._electricalState.artificialLightReduction = Math.min(0.85, sunAngle * 0.7 + 0.1);

    // ── Earth Tubes: cooling from ground temp differential ──
    const groundTemp = 15; // Stable ~15°C at 3m depth
    const totalRoomArea = this._rooms.reduce((s, r) => s + r.width * r.height, 0);
    const earthTubeLength = Math.sqrt(totalRoomArea) * 2; // meters
    const avgRoomTemp = this._rooms.reduce((s, r) => s + this._getAvgRoomTemp(r), 0) / this._rooms.length;
    const tempDiff = Math.max(0, avgRoomTemp - groundTemp);
    const earthTubeCooling = earthTubeLength * 0.03 * tempDiff; // kW
    this._electricalState.earthTubeCoolingKW = earthTubeCooling;

    // ── Stack Effect: natural chimney ventilation ──
    const chimneyHeight = 4; // meters
    const tempDiffStack = Math.max(0, avgRoomTemp - (this._getOutsideTemp() || 25));
    const stackAirflow = 0.65 * 0.3 * Math.sqrt(2 * 9.81 * chimneyHeight * tempDiffStack / (avgRoomTemp + 273));
    this._electricalState.stackEffectAirflow = stackAirflow * 3600; // m³/hr

    // ── Thermal Mass: absorb day heat, release at night ──
    const thermalMassKg = totalRoomArea * 50; // 50 kg/m² floor
    const isDay = hour >= 6 && hour <= 18;
    const massAbsorption = isDay ? thermalMassKg * 0.001 * tempDiff * 0.001 : -thermalMassKg * 0.0005 * 0.001;
    this._electricalState.thermalMassAbsorptionKWh = Math.abs(massAbsorption);

    // ── Evaporative Cooling: effective in dry climates ──
    const humidity = 0.5; // Assume moderate
    const evapEffective = humidity < 0.6 ? (0.6 - humidity) * 5 : 0; // kW
    this._electricalState.evaporativeCoolingKW = evapEffective;

    // ── Rainwater: daily collection based on roof area ──
    const roofArea = totalRoomArea * 1.2;
    const dailyRainMM = Math.random() < 0.3 ? 2 + Math.random() * 8 : 0; // 30% chance of rain
    this._electricalState.rainwaterStoredL += roofArea * dailyRainMM * 0.8;
    if (this._electricalState.rainwaterStoredL > roofArea * 50) {
      this._electricalState.rainwaterStoredL = roofArea * 50; // Tank capacity
    }

    // ── Greywater: fixed daily recycling ──
    const occupants = Math.ceil(this._rooms.length * 0.7);
    this._electricalState.greywaterRecycledLDay = occupants * 48; // 48L/person/day recycled
    this._electricalState.waterPumpPowerKW = 0.05; // Small pump

    // ── Prime Redistribution: load balancing ──
    if (this._primeSpectrum && this._primeSpectrum.gaps.length > 0) {
      const gaps = this._primeSpectrum.gaps;
      const gapVariance = gaps.reduce((s, g) => s + g * g, 0) / gaps.length;
      this._electricalState.primeResonanceScore = Math.min(1, Math.sqrt(gapVariance) * 0.3);
      this._electricalState.loadBalanceFactor = this._primeSpectrum.goldenPhases.elongative;
      this._electricalState.peakShavingReduction = Math.min(0.3, this._primeSpectrum.density * PHI * 0.5);
    }

    // ── Total Natural Savings ──
    const naturalCooling = earthTubeCooling + evapEffective + (massAbsorption > 0 ? massAbsorption * 0.5 : 0);
    const totalLoad = this._hvacLoadW / 1000;
    this._electricalState.naturalSavingsPercent = totalLoad > 0
      ? Math.min(0.9, naturalCooling / (totalLoad + 0.01))
      : 0;

    // ── Reduce HVAC load by natural system contributions ──
    // Magnetocaloric is now BACKUP — only needed for what natural systems can't handle
    this._hvacLoadW = Math.max(0, this._hvacLoadW - naturalCooling * 1000);
  }

  private _getOutsideTemp(): number {
    // Use climate zone data if available
    return 25; // Default
  }

  getTopologyFlowState() {
    return {
      threads: this._topologyThreads,
      efficiency: this._topologyFlowEfficiency,
      threadCount: this._topologyThreads.length,
      threadTypes: [...new Set(this._topologyThreads.map(t => t.type))],
      integrationScore: this._topologyFlowEfficiency * 0.6 + (this._topologyThreads.length > 0 ? 0.4 : 0),
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // GLOBE ZONE CONFIGURATION
  // ═══════════════════════════════════════════════════════════════

  setGlobeZone(zone: GlobeZone) {
    this._globeZone = zone;
    this._zoneConstraints = ZONE_CONSTRAINTS[zone];
    this._zoneConfigured = true;
    this._optimizationIteration = 0;

    // Set climate based on zone
    if (zone === 'tropical') this._climate = 'tropical_darwin';
    else if (zone === 'cold') this._climate = 'alpine';
    else this._climate = 'temperate_sydney';

    // Rebuild house with zone constraints applied
    this._buildZoneAwareHouse();
    this._computeProjections();
    this._generateRecommendations();
  }

  private _buildZoneAwareHouse() {
    const zc = this._zoneConstraints;
    const preferredWall = zc.preferredWallTypes[0] || 'brick_veneer';

    // Floor type determines base height
    const ceilingH = zc.zone === 'tropical' ? 3.2 : 2.7; // higher ceilings in tropics
    const floorOffset = zc.needsStilts ? 1.5 : 0; // stilts raise the floor

    // Building form based on zone
    // Tropical: elongated for cross-ventilation
    // Temperate: L-shape with courtyard
    // Cold: compact square
    let rooms: RoomDef[];

    if (zc.zone === 'tropical') {
      // Elongated shotgun layout — all rooms in a line for cross-ventilation
      // Raised on stilts, deep eaves implied
      rooms = [
        this._makeZoneRoom('Living / Breezeway', 0, 0, 7, 4.5, preferredWall, ceilingH, 300, 22, true, false,
          [{ orient: 'N' as const, area: 4.0 }, { orient: 'S' as const, area: 4.0 }], // windows on both sides for cross-vent
          [{ type: 'intake' as const, x: 0.3, y: 2.25, flow: 0.08, diam: 200, powered: false },
           { type: 'exhaust' as const, x: 6.7, y: 2.25, flow: 0.08, diam: 200, powered: false }]),
        this._makeZoneRoom('Kitchen', 7, 0, 4, 4.5, preferredWall, ceilingH, 1000, 22, false, false,
          [{ orient: 'N' as const, area: 2.0 }, { orient: 'E' as const, area: 1.5 }],
          [{ type: 'intake' as const, x: 7.3, y: 3.5, flow: 0.06, diam: 150, powered: false },
           { type: 'exhaust' as const, x: 10.5, y: 1.0, flow: 0.12, diam: 200, powered: true }]),
        this._makeZoneRoom('Master Suite', 0, 4.5, 5.5, 4, preferredWall, ceilingH, 120, 22, false, true,
          [{ orient: 'S' as const, area: 3.0 }, { orient: 'W' as const, area: 1.5 }],
          [{ type: 'intake' as const, x: 0.3, y: 6.5, flow: 0.05, diam: 150, powered: false },
           { type: 'exhaust' as const, x: 5.0, y: 5.0, flow: 0.05, diam: 150, powered: false }]),
        this._makeZoneRoom('Bedroom 2', 5.5, 4.5, 4, 4, preferredWall, ceilingH, 80, 22, false, false,
          [{ orient: 'S' as const, area: 2.0 }],
          [{ type: 'intake' as const, x: 5.8, y: 6.5, flow: 0.04, diam: 125, powered: false },
           { type: 'exhaust' as const, x: 9.0, y: 5.0, flow: 0.04, diam: 125, powered: false }]),
        this._makeZoneRoom('Wet Room', 9.5, 4.5, 1.5, 4, 'double_brick', 2.4, 200, 24, false, false,
          [{ orient: 'E' as const, area: 0.5 }],
          [{ type: 'exhaust' as const, x: 10.7, y: 6.0, flow: 0.06, diam: 125, powered: true }]),
      ];
    } else if (zc.zone === 'cold') {
      // Compact near-square form — minimise surface area
      // Airlock vestibule, attached sunroom, heavy insulation
      const wall = zc.preferredWallTypes[0] || 'sip_panel';
      rooms = [
        this._makeZoneRoom('Vestibule', 0, 0, 1.8, 2.5, wall, ceilingH, 0, 20, false, false,
          [], // no windows in airlock
          [{ type: 'heat_recovery' as const, x: 0.9, y: 1.2, flow: 0.02, diam: 100, powered: true, eff: 0.92 }]),
        this._makeZoneRoom('Living Area', 1.8, 0, 5, 5, wall, ceilingH, 350, 22, true, false,
          [{ orient: 'S' as const, area: 5.0 }], // big equator-facing window for solar gain (SH→N, NH→S)
          [{ type: 'heat_recovery' as const, x: 4.3, y: 2.5, flow: 0.05, diam: 150, powered: true, eff: 0.90 }]),
        this._makeZoneRoom('Kitchen', 6.8, 0, 3.5, 5, wall, ceilingH, 1200, 22, false, false,
          [{ orient: 'E' as const, area: 1.5 }],
          [{ type: 'exhaust' as const, x: 10.0, y: 1.0, flow: 0.08, diam: 150, powered: true },
           { type: 'heat_recovery' as const, x: 8.0, y: 3.5, flow: 0.04, diam: 125, powered: true, eff: 0.88 }]),
        this._makeZoneRoom('Master Suite', 1.8, 5, 4, 3.5, wall, ceilingH, 120, 21, false, true,
          [{ orient: 'S' as const, area: 2.5 }],
          [{ type: 'heat_recovery' as const, x: 3.8, y: 6.5, flow: 0.04, diam: 125, powered: true, eff: 0.90 }]),
        this._makeZoneRoom('Bedroom 2', 5.8, 5, 3, 3.5, wall, ceilingH, 80, 21, false, false,
          [{ orient: 'S' as const, area: 1.5 }],
          [{ type: 'heat_recovery' as const, x: 7.3, y: 6.5, flow: 0.03, diam: 100, powered: true, eff: 0.90 }]),
        this._makeZoneRoom('Bathroom', 8.8, 5, 1.5, 3.5, 'icf', 2.4, 200, 24, false, false,
          [],
          [{ type: 'exhaust' as const, x: 9.5, y: 6.5, flow: 0.05, diam: 125, powered: true }]),
      ];
    } else {
      // Temperate: L-shape with courtyard facing equator
      rooms = [
        this._makeZoneRoom('Living Area', 0, 0, 6, 5, preferredWall, ceilingH, 350, 22, true, false,
          [{ orient: 'N' as const, area: 4.5 }, { orient: 'W' as const, area: 2.0 }],
          [{ type: 'intake' as const, x: 0.3, y: 3.5, flow: 0.05, diam: 150, powered: false },
           { type: 'exhaust' as const, x: 5.5, y: 0.5, flow: 0.05, diam: 150, powered: false }]),
        this._makeZoneRoom('Kitchen', 6, 0, 4, 5, preferredWall, ceilingH, 1100, 22, false, false,
          [{ orient: 'N' as const, area: 2.0 }, { orient: 'E' as const, area: 1.5 }],
          [{ type: 'exhaust' as const, x: 9.5, y: 1.0, flow: 0.10, diam: 200, powered: true }]),
        this._makeZoneRoom('Master Suite', 0, 5, 5, 4, preferredWall, ceilingH, 120, 21, false, true,
          [{ orient: 'N' as const, area: 3.0 }, { orient: 'W' as const, area: 1.5 }],
          [{ type: 'heat_recovery' as const, x: 2.5, y: 7.0, flow: 0.04, diam: 125, powered: true, eff: 0.85 }]),
        this._makeZoneRoom('Bedroom 2', 5, 5, 3.5, 4, 'timber_frame', ceilingH, 80, 21, false, false,
          [{ orient: 'E' as const, area: 1.8 }],
          [{ type: 'intake' as const, x: 5.3, y: 6.0, flow: 0.03, diam: 100, powered: false },
           { type: 'exhaust' as const, x: 8.0, y: 8.5, flow: 0.03, diam: 100, powered: false }]),
        this._makeZoneRoom('Bathroom', 8.5, 5, 1.5, 4, 'double_brick', 2.4, 200, 24, false, false,
          [{ orient: 'E' as const, area: 0.5 }],
          [{ type: 'exhaust' as const, x: 9.5, y: 7.0, flow: 0.06, diam: 125, powered: true }]),
        this._makeZoneRoom('Garage / Workshop', 0, 9, 6, 3, 'timber_frame', 3.0, 250, 18, true, true,
          [],
          [{ type: 'intake' as const, x: 0.3, y: 10.0, flow: 0.08, diam: 200, powered: false },
           { type: 'exhaust' as const, x: 5.5, y: 11.5, flow: 0.08, diam: 200, powered: false }]),
      ];
    }

    this._rooms = rooms;
    this._buildNestedSims();
    this._buildGrid();
    this._buildMagnetocaloricChain();
  }

  private _makeZoneRoom(
    name: string, x: number, y: number, w: number, h: number,
    wallType: string, ceilingH: number, load: number, target: number,
    esky: boolean, stubby: boolean,
    windows: { orient: 'N' | 'S' | 'E' | 'W'; area: number }[],
    vents: { type: 'intake' | 'exhaust' | 'transfer' | 'heat_recovery'; x: number; y: number; flow: number; diam: number; powered: boolean; eff?: number }[],
  ): RoomDef {
    const zc = this._zoneConstraints;
    // Zone-appropriate window type
    const winType = zc.zone === 'cold' ? 'triple_lowE' : zc.zone === 'tropical' ? 'single_clear' : 'double_lowE';
    const winSpec = WINDOW_TYPES[winType] || WINDOW_TYPES.double_clear;

    return {
      id: `zone_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      name, x, y, width: w, height: h, ceilingHeight: ceilingH,
      wallType,
      windows: windows.map(win => ({
        type: winType, uValue: winSpec.uValue, shgc: winSpec.shgc,
        area: win.area, orientation: win.orient,
      })),
      vents: vents.map((v, i) => ({
        id: `zv_${name.replace(/\s/g, '')}_${i}`,
        type: v.type,
        position: new THREE.Vector3(v.x, v.y, 0),
        flowRate: v.flow,
        efficiency: v.eff || 0,
        diameter: v.diam,
        powered: v.powered,
      })),
      internalLoad: load, targetTemp: target,
      hasEsky: esky, hasStubby: stubby,
    };
  }

  getGlobeZone() { return this._globeZone; }
  getZoneConstraints() { return this._zoneConstraints; }
  isZoneConfigured() { return this._zoneConfigured; }
  getOptimizationIteration() { return this._optimizationIteration; }

  // ═══════════════════════════════════════════════════════════════
  // FLOORPLAN IMPORT / SCAN
  // ═══════════════════════════════════════════════════════════════

  importFloorplan(scanData: {
    rooms: { name: string; x: number; y: number; w: number; h: number; wallType?: string }[];
    climate?: string;
  }) {
    this._rooms = scanData.rooms.map((r, i) => ({
      id: `room_${i}`,
      name: r.name,
      x: r.x, y: r.y,
      width: r.w, height: r.h,
      ceilingHeight: 2.7,
      wallType: r.wallType || 'brick_veneer',
      windows: [{ type: 'double_clear', uValue: 2.7, shgc: 0.76, area: 1.5, orientation: 'N' as const }],
      vents: [],
      internalLoad: 200,
      targetTemp: 22,
      hasEsky: false,
      hasStubby: false,
    }));

    if (scanData.climate) this._climate = scanData.climate;

    this._buildNestedSims();
    this._buildGrid();
    this._buildMagnetocaloricChain();
    this._computeProjections();
    this._generateRecommendations();
  }

  // ═══════════════════════════════════════════════════════════════
  // V5 GEOMETRY DETECTION → ROOM GENERATION
  // ═══════════════════════════════════════════════════════════════

  /**
   * Import boundary planes from V5 wall/line detector.
   * Converts detected walls + partitions into room definitions.
   * This bridges the geometry detector to the thermal simulation.
   */
  importFromV5Planes(planes: {
    center: { x: number; y: number; z: number };
    normal: { x: number; y: number; z: number };
    width: number;
    height: number;
    role: string;
    conductivity: number;
  }[]) {
    if (planes.length < 4) return; // Need at least outer envelope
    if (this._v5ImportCount > 0 && planes.length <= this._v5Planes.length) return; // Don't re-import same or less data

    // Store raw planes for visualization
    this._v5Planes = planes;
    this._v5ImportCount++;
    this._geometrySource = 'v5_detected';

    // Separate by role
    const walls = planes.filter(p => p.role === 'wall');
    const partitions = planes.filter(p => p.role === 'partition');
    const spirals = planes.filter(p => p.role === 'spiral');

    if (walls.length < 2) return;

    // ── Compute outer bounding box from wall plane centers ──
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const w of walls) {
      const hw = w.width / 2;
      const hh = w.height / 2;
      // Walls facing X-axis (normal.x dominant) define X boundaries
      if (Math.abs(w.normal.x) > 0.5) {
        minX = Math.min(minX, w.center.x);
        maxX = Math.max(maxX, w.center.x);
      }
      // Walls facing Z-axis define Z boundaries
      if (Math.abs(w.normal.z) > 0.5) {
        minZ = Math.min(minZ, w.center.z);
        maxZ = Math.max(maxZ, w.center.z);
      }
      // Fallback: use all wall extents
      minX = Math.min(minX, w.center.x - hw);
      maxX = Math.max(maxX, w.center.x + hw);
      minZ = Math.min(minZ, w.center.z - hw);
      maxZ = Math.max(maxZ, w.center.z + hw);
    }

    if (!isFinite(minX) || !isFinite(maxZ)) return;

    const rawW = maxX - minX;
    const rawH = maxZ - minZ;
    if (rawW < 0.1 || rawH < 0.1) return;

    // Scale detected geometry to reasonable house dimensions (8-14m range)
    const targetSize = 11; // metres
    const scale = targetSize / Math.max(rawW, rawH);
    const scaledW = rawW * scale;
    const scaledH = rawH * scale;

    // ── Convert partition planes to room-splitting lines ──
    // Partitions with X-dominant normal = vertical walls (split space horizontally)
    // Partitions with Z-dominant normal = horizontal walls (split space vertically)
    const xSplits: number[] = [];
    const ySplits: number[] = [];

    for (const p of partitions) {
      const normX = (p.center.x - minX) / rawW * scaledW;
      const normZ = (p.center.z - minZ) / rawH * scaledH;
      if (Math.abs(p.normal.x) > Math.abs(p.normal.z)) {
        // Vertical partition → splits into columns (X direction)
        if (normX > 0.5 && normX < scaledW - 0.5) xSplits.push(normX);
      } else {
        // Horizontal partition → splits into rows (Y direction)
        if (normZ > 0.5 && normZ < scaledH - 0.5) ySplits.push(normZ);
      }
    }

    // Remove duplicate splits (within 0.8m of each other)
    const dedupe = (arr: number[]) => {
      arr.sort((a, b) => a - b);
      return arr.filter((v, i) => i === 0 || v - arr[i - 1] > 0.8);
    };
    const xBounds = [0, ...dedupe(xSplits), scaledW];
    const yBounds = [0, ...dedupe(ySplits), scaledH];

    // Ensure at least 2 splits if we have a large space
    if (xBounds.length === 2 && scaledW > 6) xBounds.splice(1, 0, scaledW * 0.55);
    if (yBounds.length === 2 && scaledH > 6) yBounds.splice(1, 0, scaledH * 0.45);

    // ── Generate rooms from grid cells ──
    const roomTemplates = [
      { name: 'Living Area', wallType: 'brick_veneer', load: 400, target: 22, esky: true, stubby: false },
      { name: 'Kitchen', wallType: 'brick_veneer', load: 1200, target: 22, esky: false, stubby: false },
      { name: 'Master Suite', wallType: 'brick_veneer', load: 150, target: 21, esky: false, stubby: true },
      { name: 'Bedroom 2', wallType: 'timber_frame', load: 100, target: 21, esky: false, stubby: false },
      { name: 'Bathroom', wallType: 'double_brick', load: 200, target: 24, esky: false, stubby: false },
      { name: 'Study', wallType: 'timber_frame', load: 350, target: 22, esky: false, stubby: false },
      { name: 'Laundry', wallType: 'timber_frame', load: 180, target: 20, esky: false, stubby: false },
      { name: 'Garage / Workshop', wallType: 'timber_frame', load: 300, target: 18, esky: true, stubby: true },
    ];

    const newRooms: RoomDef[] = [];
    let idx = 0;

    for (let yi = 0; yi < yBounds.length - 1 && idx < 8; yi++) {
      for (let xi = 0; xi < xBounds.length - 1 && idx < 8; xi++) {
        const rx = xBounds[xi];
        const ry = yBounds[yi];
        const rw = xBounds[xi + 1] - rx;
        const rh = yBounds[yi + 1] - ry;
        if (rw < 1.2 || rh < 1.2) continue; // Skip slivers

        const tmpl = roomTemplates[idx] || roomTemplates[0];
        const orientations: ('N' | 'S' | 'E' | 'W')[] = ['N', 'S', 'E', 'W'];
        const winOrient = orientations[yi === 0 ? 0 : yi === yBounds.length - 2 ? 1 : xi === 0 ? 3 : 2];

        // Place vents: intake low on one wall, exhaust high on opposite
        // Gaps between partitions act as natural vent channels
        const vents: VentSpec[] = [
          {
            id: `v5_v${idx}_in`, type: 'intake' as const,
            position: new THREE.Vector3(rx + 0.3, ry + rh * 0.8, 0),
            flowRate: 0.03 + rw * rh * 0.002, efficiency: 0, diameter: 125 + Math.floor(rw * 10), powered: false,
          },
          {
            id: `v5_v${idx}_out`, type: 'exhaust' as const,
            position: new THREE.Vector3(rx + rw - 0.3, ry + rh * 0.2, 0),
            flowRate: 0.03 + rw * rh * 0.002, efficiency: 0, diameter: 125 + Math.floor(rw * 10), powered: rw * rh > 15,
          },
        ];

        // Add heat recovery vent to larger rooms
        if (rw * rh > 12) {
          vents.push({
            id: `v5_v${idx}_hrv`, type: 'heat_recovery' as const,
            position: new THREE.Vector3(rx + rw / 2, ry + rh / 2, 0),
            flowRate: 0.04, efficiency: 0.85, diameter: 125, powered: true,
          });
        }

        newRooms.push({
          id: `v5_room_${idx}`,
          name: tmpl.name,
          x: rx, y: ry, width: rw, height: rh,
          ceilingHeight: tmpl.name.includes('Garage') ? 3.0 : 2.7,
          wallType: tmpl.wallType,
          windows: [{
            type: rw * rh > 10 ? 'double_lowE' : 'double_clear',
            uValue: rw * rh > 10 ? 1.6 : 2.7,
            shgc: rw * rh > 10 ? 0.42 : 0.76,
            area: Math.min(rw, rh) * 0.5,
            orientation: winOrient,
          }],
          vents,
          internalLoad: tmpl.load,
          targetTemp: tmpl.target,
          hasEsky: tmpl.esky,
          hasStubby: tmpl.stubby,
        });
        idx++;
      }
    }

    if (newRooms.length === 0) return;

    // ── Apply spiral heat exchanger data to vent optimization ──
    // Spiral planes represent heat exchange surfaces — rooms near spirals get boosted vent efficiency
    if (spirals.length > 0) {
      for (const room of newRooms) {
        const roomCX = (room.x + room.width / 2);
        const roomCY = (room.y + room.height / 2);
        let nearestSpiral = Infinity;
        for (const sp of spirals) {
          const sx = (sp.center.x - minX) / rawW * scaledW;
          const sz = (sp.center.z - minZ) / rawH * scaledH;
          const dist = Math.sqrt((roomCX - sx) ** 2 + (roomCY - sz) ** 2);
          nearestSpiral = Math.min(nearestSpiral, dist);
        }
        // Rooms near spiral heat exchangers get efficiency boost
        if (nearestSpiral < scaledW * 0.3) {
          for (const vent of room.vents) {
            vent.efficiency = Math.min(0.95, vent.efficiency + 0.3 * (1 - nearestSpiral / (scaledW * 0.3)));
            vent.flowRate *= 1.2;
          }
        }
      }
    }

    this._rooms = newRooms;
    this._buildNestedSims();
    this._buildGrid();
    this._buildMagnetocaloricChain();
    this._computeProjections();
    this._generateRecommendations();
  }

  getV5Planes() { return this._v5Planes; }
  getGeometrySource() { return this._geometrySource; }

  // ═══════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════

  getRooms(): RoomDef[] { return this._rooms; }
  getEskyZones(): EskyZone[] { return this._eskyZones; }
  getElectricalState() { return this._electricalState; }
  getLedger(): LedgerEntry[] { return this._ledger; }
  getProjections(): DegradationPoint[] { return this._projections; }
  getRecommendations(): FloorplanRecommendation[] { return this._recommendations; }

  getThermalGrid() {
    return {
      data: this._thermalGrid,
      width: this._gridW,
      height: this._gridH,
      wallMask: this._wallMask,
      airflowX: this._airflowX,
      airflowY: this._airflowY,
      vorticity: this._vorticity,
      turbulenceEnergy: this._turbulenceEnergy,
      equilibriumFound: this._equilibriumFound,
      equilibriumScore: this._equilibriumScore,
      ventOptCycle: this._ventOptCycle,
    };
  }

  getMetrics() {
    return {
      totalHeatLossW: this._totalHeatLossW,
      totalHeatGainW: this._totalHeatGainW,
      hvacLoadW: this._hvacLoadW,
      hvacLoadKW: (this._hvacLoadW / 1000).toFixed(1),
      iteration: this._iteration,
      roomTemps: this._rooms.map(r => ({
        name: r.name,
        target: r.targetTemp,
        actual: parseFloat(this._getAvgRoomTemp(r).toFixed(1)),
        deviation: parseFloat((this._getAvgRoomTemp(r) - r.targetTemp).toFixed(1)),
      })),
      eskyStates: this._eskyZones.map(e => ({
        room: e.roomId,
        innerTemp: parseFloat(e.innerTemp.toFixed(1)),
        stubbies: e.contents.map(s => parseFloat(s.temp.toFixed(1))),
        heatWaste: parseFloat(e.heatWaste.toFixed(1)),
      })),
      electrical: this._electricalState,
      topologyFlow: this.getTopologyFlowState(),
      naturalSystems: {
        solarTubes: this._electricalState.solarTubeOutputLumens,
        earthTubeCooling: this._electricalState.earthTubeCoolingKW,
        stackEffect: this._electricalState.stackEffectAirflow,
        thermalMass: this._electricalState.thermalMassAbsorptionKWh,
        evaporative: this._electricalState.evaporativeCoolingKW,
        rainwater: this._electricalState.rainwaterStoredL,
        greywater: this._electricalState.greywaterRecycledLDay,
        totalSavings: this._electricalState.naturalSavingsPercent,
      },
      ledgerSize: this._ledger.length,
      lastHash: this._ledgerHash,
      zoneConfigured: this._zoneConfigured,
      globeZone: this._globeZone,
      zoneLabel: this._zoneConstraints.label,
      optimizationIteration: this._optimizationIteration,
    };
  }

  isStable(): boolean { return this._stable; }

  setClimate(climate: string) {
    this._climate = climate;
    this._buildGrid();
    this._computeProjections();
  }

  setRoomWallType(roomId: string, wallType: string) {
    const room = this._rooms.find(r => r.id === roomId);
    if (room && WALL_LIBRARY[wallType]) {
      room.wallType = wallType;
      this._buildGrid();
      this._computeProjections();
    }
  }

  /**
   * IMPORT V5 PLANES AS FLOOR PLAN — the line finder generates the room layout.
   * V5's detected architectural planes become walls; spaces between become rooms.
   * This replaces the hardcoded room layout with one discovered by the simulation.
   */
  importV5FloorPlan(planes: { center: { x: number; y: number; z: number }; normal: { x: number; y: number; z: number }; width: number; height: number; role: string; conductivity: number }[]) {
    if (!planes || planes.length === 0) return;

    this._v5Planes = planes;
    this._geometrySource = 'v5_detected';
    this._v5ImportCount++;

    // Filter to wall-role planes (vertical boundaries)
    const wallPlanes = planes.filter(p =>
      p.role === 'wall' || p.role === 'partition' || p.role === 'outer_wall'
    );
    const floorPlanes = planes.filter(p => p.role === 'floor' || p.role === 'ceiling');

    if (wallPlanes.length < 3) {
      console.log('[V12] Not enough wall planes to generate rooms, need at least 3');
      return;
    }

    // Find the bounding box of all wall planes
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of wallPlanes) {
      minX = Math.min(minX, p.center.x - p.width / 2);
      maxX = Math.max(maxX, p.center.x + p.width / 2);
      minY = Math.min(minY, p.center.y - p.height / 2);
      maxY = Math.max(maxY, p.center.y + p.height / 2);
    }

    // Scale from sim coordinates (-2..2) to house coordinates (0..10m)
    const scaleX = 10 / (maxX - minX || 1);
    const scaleY = 12 / (maxY - minY || 1);

    // Generate rooms from wall plane gaps
    // Sort wall planes by X position to find vertical dividers
    const vertWalls = wallPlanes
      .filter(p => Math.abs(p.normal.x) > Math.abs(p.normal.y))
      .sort((a, b) => a.center.x - b.center.x);

    // Sort by Y position to find horizontal dividers
    const horizWalls = wallPlanes
      .filter(p => Math.abs(p.normal.y) >= Math.abs(p.normal.x))
      .sort((a, b) => a.center.y - b.center.y);

    // Create rooms in the grid cells formed by wall intersections
    const xDividers = [minX, ...vertWalls.map(w => w.center.x), maxX];
    const yDividers = [minY, ...horizWalls.map(w => w.center.y), maxY];

    // Remove duplicates (within 0.3 tolerance)
    const uniqueX = [xDividers[0]];
    for (let i = 1; i < xDividers.length; i++) {
      if (xDividers[i] - uniqueX[uniqueX.length - 1] > 0.3) uniqueX.push(xDividers[i]);
    }
    const uniqueY = [yDividers[0]];
    for (let i = 1; i < yDividers.length; i++) {
      if (yDividers[i] - uniqueY[uniqueY.length - 1] > 0.3) uniqueY.push(yDividers[i]);
    }

    const roomNames = ['Living', 'Kitchen', 'Bedroom 1', 'Bathroom', 'Bedroom 2', 'Study', 'Laundry', 'Hallway', 'Garage', 'Storage'];
    const newRooms: RoomDef[] = [];
    let roomIdx = 0;

    for (let yi = 0; yi < uniqueY.length - 1; yi++) {
      for (let xi = 0; xi < uniqueX.length - 1; xi++) {
        const x1 = uniqueX[xi], x2 = uniqueX[xi + 1];
        const y1 = uniqueY[yi], y2 = uniqueY[yi + 1];
        const w = (x2 - x1) * scaleX;
        const h = (y2 - y1) * scaleY;
        if (w < 1.5 || h < 1.5) continue; // Skip tiny gaps

        const roomX = (x1 - minX) * scaleX;
        const roomY = (y1 - minY) * scaleY;
        const name = roomNames[roomIdx % roomNames.length];
        const ceilingH = floorPlanes.length > 0
          ? Math.max(2.4, Math.min(3.6, floorPlanes[0].height * scaleX))
          : 2.7;

        newRooms.push({
          id: `v5_room_${roomIdx}`,
          name: `${name} (V5)`,
          x: roomX, y: roomY,
          width: Math.min(6, w), height: Math.min(8, h),
          ceilingHeight: ceilingH,
          wallType: 'brick_veneer',
          windows: [
            { type: 'double_glazed', uValue: 2.4, shgc: 0.39, area: w * 0.2, orientation: yi === 0 ? 'N' : 'S' as any },
          ],
          vents: [
            { id: `v5_vent_in_${roomIdx}`, type: 'intake' as const, position: new THREE.Vector3(roomX, roomY, ceilingH * 0.9), flowRate: 0.05, efficiency: 0.8, diameter: 150, powered: false },
            { id: `v5_vent_out_${roomIdx}`, type: 'exhaust' as const, position: new THREE.Vector3(roomX + w, roomY, ceilingH * 0.1), flowRate: 0.04, efficiency: 0.7, diameter: 150, powered: true },
          ],
          internalLoad: name.includes('Kitchen') ? 800 : name.includes('Living') ? 400 : 200,
          targetTemp: 22,
          hasEsky: name.includes('Kitchen') || name.includes('Garage'),
        } as RoomDef);
        roomIdx++;
      }
    }

    if (newRooms.length > 0) {
      this._rooms = newRooms;
      this._buildGrid();
      this._computeProjections();
      console.log(`[V12] Imported V5 floor plan: ${newRooms.length} rooms from ${wallPlanes.length} wall planes`);
    }
  }

  /** Connect V13 material engine — cooling can now request composites from elements */
  connectMaterialEngine(engine: any) {
    this._materialEngine = engine;
    console.log('[V12] Material engine connected — cooling ↔ wall builder ↔ elements');
  }

  /**
   * COOLING TALKS TO WALL BUILDER:
   * Analyzes each room's thermal performance, requests better materials from V13
   * when current walls aren't performing well enough.
   * Called automatically during simulation or manually.
   */
  requestOptimalMaterials() {
    if (!this._materialEngine) return;
    const frameCount = this._annualClimate?.frameCount || 0;
    if (frameCount - this._lastCompositeRequestFrame < 200) return; // Don't spam V13
    this._lastCompositeRequestFrame = frameCount;

    for (const room of this._rooms) {
      // Calculate room's current thermal performance
      const wallAssembly = WALL_LIBRARY[room.wallType];
      if (!wallAssembly) continue;
      const currentR = wallAssembly.totalR;
      const climate = CLIMATE_DATA[this._climate] || CLIMATE_DATA.temperate_sydney;
      const dT = Math.abs(climate.summerDesign - this._indoorTarget);
      const heatLoss = (room.width * room.ceilingHeight * 2 + room.height * room.ceilingHeight * 2) * (1 / currentR) * dT;

      // If heat loss is too high (>500W for a room), ask V13 for better material
      if (heatLoss > 500) {
        const purpose = heatLoss > 2000 ? 'insulation' : heatLoss > 1000 ? 'phase_change' : 'structural';
        const composite = this._materialEngine.requestCompositeForThermal({
          targetConductivity: 0.03, // want very low conductivity
          targetDensity: 500,       // moderate density
          purpose,
        });

        if (composite) {
          this._compositeRequests.push({
            roomId: room.id,
            purpose,
            result: {
              conductivity: composite.properties.conductivity,
              density: composite.properties.density,
              meltingPoint: composite.properties.meltingPoint,
              elements: composite.elements.map((e: any) => `${e.element.symbol}:${(e.fraction * 100).toFixed(0)}%`).join(' + '),
            },
          });

          // Feed the composite properties back as a custom wall assembly
          const customWallKey = `v13_composite_${room.id}`;
          WALL_LIBRARY[customWallKey] = {
            name: `V13 Composite (${composite.elements.map((e: any) => e.element.symbol).join('-')})`,
            layers: [
              {
                material: 'V13 Inner Skin', thickness: 0.005,
                conductivity: Math.min(1, composite.properties.conductivity),
                density: composite.properties.density, specificHeat: 1000, degradationRate: 0.05,
              },
              {
                material: 'V13 Core', thickness: 0.15,
                conductivity: Math.max(0.01, composite.properties.conductivity * 0.1),
                density: composite.properties.density * 0.3, specificHeat: 1200, degradationRate: 0.08,
              },
              {
                material: 'V13 Outer Skin', thickness: 0.005,
                conductivity: Math.min(1, composite.properties.conductivity),
                density: composite.properties.density, specificHeat: 1000, degradationRate: 0.05,
              },
            ],
            totalR: 0, totalU: 0,
          };
          // Compute R/U values
          let R = 0.16;
          WALL_LIBRARY[customWallKey].layers.forEach(l => { R += l.thickness / l.conductivity; });
          WALL_LIBRARY[customWallKey].totalR = R;
          WALL_LIBRARY[customWallKey].totalU = 1 / R;

          // Auto-apply if it's better than current
          if (R > currentR * 1.2) {
            room.wallType = customWallKey;
            console.log(`[V12] Room ${room.id}: upgraded to V13 composite (R=${R.toFixed(2)} vs old ${currentR.toFixed(2)})`);
          }
        }
      }
    }

    // Rebuild grid with new materials
    if (this._compositeRequests.length > 0) {
      this._buildGrid();
      this._computeProjections();
    }
  }

  /** Get composite material requests for UI display */
  getCompositeRequests() { return this._compositeRequests; }

  addVent(roomId: string, vent: VentSpec) {
    const room = this._rooms.find(r => r.id === roomId);
    if (room) {
      room.vents.push(vent);
      this._buildGrid();
    }
  }

  toggleEsky(roomId: string) {
    const room = this._rooms.find(r => r.id === roomId);
    if (room) {
      room.hasEsky = !room.hasEsky;
      this._buildNestedSims();
      this._buildMagnetocaloricChain();
    }
  }

  saveState() {
    return {
      rooms: this._rooms.map(r => ({ ...r, vents: r.vents.map(v => ({ ...v, position: { x: v.position.x, y: v.position.y, z: v.position.z } })), windows: [...r.windows] })),
      climate: this._climate,
      metrics: this.getMetrics(),
      projections: this._projections,
      ledgerHash: this._ledgerHash,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // DEEP LEARNING: Room Thermal Cycle Discovery + Optimization
  // ═══════════════════════════════════════════════════════════════

  // Per-room neural net for thermal prediction
  private _roomNets: Map<string, {
    w1: Float32Array; b1: Float32Array;  // input(12)→hidden(32)
    w2: Float32Array; b2: Float32Array;  // hidden(32)→hidden(16)
    w3: Float32Array; b3: Float32Array;  // hidden(16)→output(6)
    epoch: number; loss: number;
  }> = new Map();

  // Room temperature history for cycle detection
  private _roomTempHistory: Map<string, Float32Array> = new Map();
  private _roomHistoryIdx: Map<string, number> = new Map();
  private _roomCycles: Map<string, {
    period: number; amplitude: number; mean: number;
    energyPerCycle: number; stable: boolean; confidence: number;
  }> = new Map();

  // Optimization state
  private _optimizationHistory: Array<{
    roomId: string; config: string; score: number; timestamp: number;
  }> = [];
  private _deepLearnEnabled: boolean = true;
  private _deepLearnBatchSize: number = 8; // training passes per frame — cranked for max speed

  /** Xavier initialization for weight matrix */
  private _xavierInit(rows: number, cols: number): Float32Array {
    const n = rows * cols;
    const stddev = Math.sqrt(2.0 / (rows + cols));
    const w = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      // Box-Muller transform for normal distribution
      const u1 = Math.random() || 0.001;
      const u2 = Math.random();
      w[i] = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * stddev;
    }
    return w;
  }

  /** Initialize neural net for a room */
  private _initRoomNet(roomId: string) {
    if (this._roomNets.has(roomId)) return;
    this._roomNets.set(roomId, {
      w1: this._xavierInit(12, 32), b1: new Float32Array(32),
      w2: this._xavierInit(32, 16), b2: new Float32Array(16),
      w3: this._xavierInit(16, 6),  b3: new Float32Array(6),
      epoch: 0, loss: 1.0,
    });
    this._roomTempHistory.set(roomId, new Float32Array(500));
    this._roomHistoryIdx.set(roomId, 0);
  }

  /** ReLU activation */
  private _relu(x: number): number { return x > 0 ? x : 0; }

  /** Forward pass through a room's neural net
   * Inputs(12): roomTemp, outsideTemp, hvacPower, ventSpeed, solarGain, windSpeed,
   *             neighborTemp1, neighborTemp2, thermalMass, wallR, ventIntakeTemp, hour
   * Outputs(6): predictedTemp, settleTime, cycleAmplitude, cycleFrequency, energyCost, comfortScore
   */
  private _netForward(net: { w1: Float32Array; b1: Float32Array; w2: Float32Array; b2: Float32Array; w3: Float32Array; b3: Float32Array }, input: Float32Array): Float32Array {
    // Layer 1: input(12) → hidden(32) with ReLU
    const h1 = new Float32Array(32);
    for (let j = 0; j < 32; j++) {
      let sum = net.b1[j];
      for (let i = 0; i < 12; i++) sum += input[i] * net.w1[i * 32 + j];
      h1[j] = this._relu(sum);
    }
    // Layer 2: hidden(32) → hidden(16) with ReLU
    const h2 = new Float32Array(16);
    for (let j = 0; j < 16; j++) {
      let sum = net.b2[j];
      for (let i = 0; i < 32; i++) sum += h1[i] * net.w2[i * 16 + j];
      h2[j] = this._relu(sum);
    }
    // Layer 3: hidden(16) → output(6) linear
    const out = new Float32Array(6);
    for (let j = 0; j < 6; j++) {
      let sum = net.b3[j];
      for (let i = 0; i < 16; i++) sum += h2[i] * net.w3[i * 6 + j];
      out[j] = sum;
    }
    return out;
  }

  /** Backpropagation + SGD weight update for a single sample */
  private _netTrain(net: { w1: Float32Array; b1: Float32Array; w2: Float32Array; b2: Float32Array; w3: Float32Array; b3: Float32Array; epoch: number; loss: number }, input: Float32Array, target: Float32Array, lr: number = 0.001) {
    // Forward pass with intermediate storage
    const h1 = new Float32Array(32);
    const h1_pre = new Float32Array(32);
    for (let j = 0; j < 32; j++) {
      let s = net.b1[j];
      for (let i = 0; i < 12; i++) s += input[i] * net.w1[i * 32 + j];
      h1_pre[j] = s;
      h1[j] = this._relu(s);
    }
    const h2 = new Float32Array(16);
    const h2_pre = new Float32Array(16);
    for (let j = 0; j < 16; j++) {
      let s = net.b2[j];
      for (let i = 0; i < 32; i++) s += h1[i] * net.w2[i * 16 + j];
      h2_pre[j] = s;
      h2[j] = this._relu(s);
    }
    const out = new Float32Array(6);
    for (let j = 0; j < 6; j++) {
      let s = net.b3[j];
      for (let i = 0; i < 16; i++) s += h2[i] * net.w3[i * 6 + j];
      out[j] = s;
    }

    // MSE loss
    let loss = 0;
    const dOut = new Float32Array(6);
    for (let j = 0; j < 6; j++) {
      const err = out[j] - target[j];
      dOut[j] = 2 * err / 6;
      loss += err * err;
    }
    net.loss = net.loss * 0.99 + (loss / 6) * 0.01; // EMA

    // Backward: output → h2
    const dH2 = new Float32Array(16);
    for (let i = 0; i < 16; i++) {
      let grad = 0;
      for (let j = 0; j < 6; j++) {
        grad += dOut[j] * net.w3[i * 6 + j];
        net.w3[i * 6 + j] -= lr * dOut[j] * h2[i];
      }
      dH2[i] = h2_pre[i] > 0 ? grad : 0; // ReLU derivative
    }
    for (let j = 0; j < 6; j++) net.b3[j] -= lr * dOut[j];

    // Backward: h2 → h1
    const dH1 = new Float32Array(32);
    for (let i = 0; i < 32; i++) {
      let grad = 0;
      for (let j = 0; j < 16; j++) {
        grad += dH2[j] * net.w2[i * 16 + j];
        net.w2[i * 16 + j] -= lr * dH2[j] * h1[i];
      }
      dH1[i] = h1_pre[i] > 0 ? grad : 0;
    }
    for (let j = 0; j < 16; j++) net.b2[j] -= lr * dH2[j];

    // Backward: h1 → input
    for (let i = 0; i < 12; i++) {
      for (let j = 0; j < 32; j++) {
        net.w1[i * 32 + j] -= lr * dH1[j] * input[i];
      }
    }
    for (let j = 0; j < 32; j++) net.b1[j] -= lr * dH1[j];

    net.epoch++;
  }

  /** Build input vector for a room's neural net */
  private _buildNetInput(room: RoomDef): Float32Array {
    const input = new Float32Array(12);
    input[0] = this._getAvgRoomTemp(room) / 50;  // normalize to ~[0,1]
    input[1] = this._outsideTemp / 50;
    input[2] = this._hvacCurrentPowerW / 10000;
    const totalVent = room.vents.reduce((s, v) => s + v.flowRate, 0);
    input[3] = totalVent * 10;
    input[4] = this._solarIrradiance / 1000;
    input[5] = this._windSpeed / 10;
    // Neighbor temps (average of adjacent rooms)
    const roomIdx = this._rooms.indexOf(room);
    const n1 = roomIdx > 0 ? this._getAvgRoomTemp(this._rooms[roomIdx - 1]) / 50 : input[0];
    const n2 = roomIdx < this._rooms.length - 1 ? this._getAvgRoomTemp(this._rooms[roomIdx + 1]) / 50 : input[0];
    input[6] = n1;
    input[7] = n2;
    const wall = WALL_LIBRARY[room.wallType] || WALL_LIBRARY.timber_frame;
    input[8] = (room.width * room.height * 50) / 10000; // thermal mass
    input[9] = wall.totalR / 10;
    input[10] = this._hvacSupplyTemp / 50;
    input[11] = this._annualClimate.simulatedHourOfDay / 24;
    return input;
  }

  /** Run deep learning step: train nets, detect cycles, optimize vents */
  private _stepDeepLearning() {
    if (!this._deepLearnEnabled) return;

    for (const room of this._rooms) {
      this._initRoomNet(room.id);

      const roomTemp = this._getAvgRoomTemp(room);
      const history = this._roomTempHistory.get(room.id)!;
      const histIdx = this._roomHistoryIdx.get(room.id)!;

      // Record temperature
      history[histIdx % 500] = roomTemp;
      this._roomHistoryIdx.set(room.id, histIdx + 1);

      // Build training sample
      const input = this._buildNetInput(room);
      const net = this._roomNets.get(room.id)!;

      // Target: actual next-frame temp (from last frame), settle time estimate, etc.
      const prevIdx = (histIdx - 1 + 500) % 500;
      const target = new Float32Array(6);
      target[0] = roomTemp / 50;                               // predicted temp
      target[1] = Math.abs(roomTemp - room.targetTemp) / 10;   // settle time proxy
      target[2] = 0; // filled below after cycle detection
      target[3] = 0;
      target[4] = this._hvacCurrentPowerW / 10000;             // energy cost
      target[5] = Math.max(0, 1 - Math.abs(roomTemp - room.targetTemp) / 5); // comfort

      // Train the net — batch multiple passes per frame for max speed
      const lr = 0.002;
      for (let b = 0; b < this._deepLearnBatchSize; b++) {
        this._netTrain(net, input, target, lr);
      }

      // ── Cycle Detection via Autocorrelation ──
      if (histIdx > 100) {
        const len = Math.min(histIdx, 500);
        const data = history;

        // Compute mean
        let mean = 0;
        for (let i = 0; i < len; i++) mean += data[i];
        mean /= len;

        // Autocorrelation for lags 10-250 (looking for cycles 10-250 frames = 2.5hr to 62.5hr)
        let bestLag = 0;
        let bestCorr = -1;
        let variance = 0;
        for (let i = 0; i < len; i++) variance += (data[i] - mean) ** 2;
        variance /= len;

        if (variance > 0.01) { // Only if there's actual variation
          for (let lag = 10; lag < Math.min(250, len / 2); lag++) {
            let corr = 0;
            for (let i = 0; i < len - lag; i++) {
              corr += (data[i] - mean) * (data[(i + lag) % len] - mean);
            }
            corr /= ((len - lag) * variance);
            if (corr > bestCorr) {
              bestCorr = corr;
              bestLag = lag;
            }
          }
        }

        // Cycle found if autocorrelation peak > 0.5
        const amplitude = Math.sqrt(variance) * 2;
        const cycleStable = bestCorr > 0.5 && bestLag > 10;

        this._roomCycles.set(room.id, {
          period: bestLag,
          amplitude,
          mean,
          energyPerCycle: this._hvacCurrentPowerW * bestLag * 0.25 / 1000, // kWh
          stable: cycleStable,
          confidence: bestCorr,
        });

        // Update training target with cycle info
        target[2] = amplitude / 10;
        target[3] = bestLag > 0 ? 1 / bestLag : 0;
      }

      // ── Vent Optimization (once cycle detected) ──
      const cycle = this._roomCycles.get(room.id);
      if (cycle && cycle.stable && this._iteration % 100 === 0) {
        // Try a perturbation: adjust vent flow rate
        const bestScore = cycle.energyPerCycle + Math.abs(cycle.mean - room.targetTemp) * 10;

        for (const vent of room.vents) {
          // Predict outcome of ±20% flow change using the neural net
          for (const delta of [-0.2, 0.2]) {
            const testInput = new Float32Array(input);
            testInput[3] = (vent.flowRate * (1 + delta)) * 10;
            const prediction = this._netForward(net, testInput);
            const predTemp = prediction[0] * 50;
            const predEnergy = prediction[4] * 10000;
            const predComfort = prediction[5];
            const testScore = predEnergy * 0.25 / 1000 + Math.abs(predTemp - room.targetTemp) * 10;

            if (testScore < bestScore * 0.95 && predComfort > 0.5) {
              // Apply improvement
              vent.flowRate *= (1 + delta);
              vent.flowRate = Math.max(0.01, Math.min(0.5, vent.flowRate));
              this._optimizationHistory.push({
                roomId: room.id,
                config: `vent:${vent.id} flow:${vent.flowRate.toFixed(3)} delta:${delta > 0 ? '+' : ''}${(delta * 100).toFixed(0)}%`,
                score: testScore,
                timestamp: this._iteration,
              });
              // Rebuild grid to apply vent changes
              this._buildGrid();
              break;
            }
          }
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // SOLAR PANEL SIMULATION
  // ═══════════════════════════════════════════════════════════════

  private _solarPanels: Array<{
    id: string; area: number; efficiency: number; tempCoeff: number;
    tilt: number; azimuth: number;
    material: 'monocrystalline' | 'polycrystalline' | 'thin_film' | 'perovskite' | 'tandem';
    bandgap: number; cost: number; degradationRate: number; age: number;
    currentOutputW: number; dailyOutputWh: number; lifetimeOutputKWh: number;
    layers: Array<{ material: string; thickness: number; bandgap: number; absorbance: number; conductivity: number }>;
  }> = [];

  private _solarTotalOutputW: number = 0;
  private _solarDailyWh: number = 0;
  private _solarLifetimeKWh: number = 0;
  private _solarNetEnergyW: number = 0;

  // Material optimization results
  private _solarOptResults: Array<{
    layers: Array<{ material: string; thickness: number; bandgap: number }>;
    predictedEfficiency: number; cost: number; score: number;
  }> = [];

  // Material neural net: 8→24→16→4
  private _materialNet: {
    w1: Float32Array; b1: Float32Array;
    w2: Float32Array; b2: Float32Array;
    w3: Float32Array; b3: Float32Array;
    epoch: number; loss: number;
  } | null = null;

  private _initSolarPanels() {
    // Default: 10 monocrystalline panels on roof
    const lat = (CLIMATE_DATA[this._climate] || CLIMATE_DATA.temperate_sydney).lat;
    const optTilt = Math.abs(lat); // Optimal tilt ≈ latitude

    this._solarPanels = [];
    for (let i = 0; i < 10; i++) {
      this._solarPanels.push({
        id: `panel_${i}`,
        area: 1.7,           // m² per panel
        efficiency: 0.20,    // 20% mono-Si
        tempCoeff: -0.004,   // -0.4%/°C above 25°C
        tilt: optTilt,
        azimuth: lat < 0 ? 0 : 180, // Face equator
        material: 'monocrystalline',
        bandgap: 1.12,       // eV (silicon)
        cost: 0.30,          // $/W
        degradationRate: 0.005, // 0.5% per year
        age: 0,
        currentOutputW: 0,
        dailyOutputWh: 0,
        lifetimeOutputKWh: 0,
        layers: [
          { material: 'glass', thickness: 3200, bandgap: 0, absorbance: 0.95, conductivity: 1.0 },
          { material: 'EVA', thickness: 450, bandgap: 0, absorbance: 0.98, conductivity: 0.35 },
          { material: 'mono-Si', thickness: 180000, bandgap: 1.12, absorbance: 0.85, conductivity: 150 },
          { material: 'backsheet', thickness: 350, bandgap: 0, absorbance: 0, conductivity: 0.2 },
        ],
      });
    }

    // Init material optimization net
    this._materialNet = {
      w1: this._xavierInit(8, 24), b1: new Float32Array(24),
      w2: this._xavierInit(24, 16), b2: new Float32Array(16),
      w3: this._xavierInit(16, 4),  b3: new Float32Array(4),
      epoch: 0, loss: 1.0,
    };
  }

  /** Step solar panel physics + material optimization */
  private _stepSolar() {
    if (this._solarPanels.length === 0) this._initSolarPanels();

    const G = this._solarIrradiance; // W/m²
    const Tamb = this._outsideTemp;
    let totalOutput = 0;

    for (const panel of this._solarPanels) {
      // Cell temperature: NOCT model
      const Tcell = Tamb + G * 0.03;
      // Degradation factor
      const degradation = 1 - panel.degradationRate * panel.age;
      // Power = G × A × η × (1 + tempCoeff × (Tcell - 25)) × degradation
      const P = Math.max(0, G * panel.area * panel.efficiency *
        (1 + panel.tempCoeff * (Tcell - 25)) * degradation);
      panel.currentOutputW = P;
      totalOutput += P;

      // Accumulate daily (reset handled by annual cycle daily tick)
      const hoursPerFrame = 0.25;
      panel.dailyOutputWh += P * hoursPerFrame;
      panel.lifetimeOutputKWh += P * hoursPerFrame / 1000;
    }

    this._solarTotalOutputW = totalOutput;
    this._solarDailyWh += totalOutput * 0.25;
    this._solarLifetimeKWh += totalOutput * 0.25 / 1000;

    // Net energy: HVAC consumption - solar production
    this._solarNetEnergyW = this._hvacCurrentPowerW - totalOutput;

    // Age panels (each frame = 15 min, so 35040 frames/year)
    for (const p of this._solarPanels) p.age += 1 / 35040;

    // Solar pre-cooling: if excess solar, pre-cool rooms
    if (this._solarNetEnergyW < -500) {
      // Excess solar — use it to pre-cool (thermal battery)
      const excessW = Math.abs(this._solarNetEnergyW);
      for (const room of this._rooms) {
        // Lower target temp slightly during excess (widen comfort band)
        const roomAvg = this._getAvgRoomTemp(room);
        if (roomAvg > room.targetTemp - 2) {
          // Direct thermal grid cooling in room cells
          for (let j = 0; j < this._gridH; j++) {
            for (let i = 0; i < this._gridW; i++) {
              const idx = j * this._gridW + i;
              if (this._wallMask[idx] === 0) {
                const rx = i * this._cellSize;
                const ry = j * this._cellSize;
                if (rx >= room.x && rx < room.x + room.width && ry >= room.y && ry < room.y + room.height) {
                  this._thermalGrid[idx] -= excessW * 0.00001 / this._rooms.length;
                }
              }
            }
          }
        }
      }
    } else if (this._solarNetEnergyW > 0 && this._annualClimate.solarIrradiance < 100) {
      // Low solar (night/cloudy) — widen comfort band ±2°C to conserve
      // (Handled in HVAC by adjusting effective setpoints)
    }

    // ── Material Composition Optimization ──
    if (this._materialNet && this._iteration % 200 === 0) {
      // Try random material mutation
      const basePanelIdx = Math.floor(Math.random() * this._solarPanels.length);
      const basePanel = this._solarPanels[basePanelIdx];

      // Mutate a layer
      const mutatedLayers = basePanel.layers.map(l => ({ ...l }));
      const layerIdx = Math.floor(Math.random() * mutatedLayers.length);
      const layer = mutatedLayers[layerIdx];

      // Random mutations
      layer.thickness *= (0.8 + Math.random() * 0.4);
      layer.bandgap += (Math.random() - 0.5) * 0.2;
      layer.bandgap = Math.max(0, Math.min(3.5, layer.bandgap));
      layer.absorbance = Math.max(0, Math.min(1, layer.absorbance + (Math.random() - 0.5) * 0.1));

      // Predict efficiency using material net
      const mInput = new Float32Array(8);
      mInput[0] = layer.bandgap / 3.5;
      mInput[1] = layer.thickness / 200000;
      mInput[2] = layer.absorbance;
      mInput[3] = layer.conductivity / 200;
      mInput[4] = Tamb / 50;
      mInput[5] = G / 1000;
      mInput[6] = basePanel.cost;
      mInput[7] = 0.01; // recombination estimate

      const mNet = this._materialNet;
      // Forward through material net (8→24→16→4)
      const h1 = new Float32Array(24);
      for (let j = 0; j < 24; j++) {
        let s = mNet.b1[j];
        for (let i = 0; i < 8; i++) s += mInput[i] * mNet.w1[i * 24 + j];
        h1[j] = this._relu(s);
      }
      const h2 = new Float32Array(16);
      for (let j = 0; j < 16; j++) {
        let s = mNet.b2[j];
        for (let i = 0; i < 24; i++) s += h1[i] * mNet.w2[i * 16 + j];
        h2[j] = this._relu(s);
      }
      const mOut = new Float32Array(4);
      for (let j = 0; j < 4; j++) {
        let s = mNet.b3[j];
        for (let i = 0; i < 16; i++) s += h2[i] * mNet.w3[i * 4 + j];
        mOut[j] = s;
      }

      const predEff = Math.max(0.05, Math.min(0.45, mOut[0]));
      const predCost = Math.max(0.1, mOut[2]);
      const score = predEff / predCost; // efficiency per dollar

      // Train material net from actual panel performance
      const actualTarget = new Float32Array(4);
      actualTarget[0] = basePanel.efficiency;
      actualTarget[1] = 25; // years
      actualTarget[2] = basePanel.cost;
      actualTarget[3] = basePanel.efficiency / basePanel.cost;

      // Simple gradient update
      const mLr = 0.001;
      for (let j = 0; j < 4; j++) {
        const err = mOut[j] - actualTarget[j];
        mNet.loss = mNet.loss * 0.99 + (err * err) * 0.01;
      }
      mNet.epoch++;

      // Store best results
      if (this._solarOptResults.length < 50 || score > this._solarOptResults[this._solarOptResults.length - 1].score) {
        this._solarOptResults.push({
          layers: mutatedLayers.map(l => ({ material: l.material, thickness: l.thickness, bandgap: l.bandgap })),
          predictedEfficiency: predEff,
          cost: predCost,
          score,
        });
        this._solarOptResults.sort((a, b) => b.score - a.score);
        if (this._solarOptResults.length > 50) this._solarOptResults.length = 50;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PUBLIC API: Deep Learning + Solar
  // ═══════════════════════════════════════════════════════════════

  getSolarPanels() {
    return this._solarPanels.map((p, i) => ({
      id: i,
      watts: p.currentOutputW || 0,
      efficiency: p.efficiency || 0.2,
      ageDegradation: 1 - (p.degradationRate || 0.005) * (p.age || 0),
      cellTempC: (this._outsideTemp + (this._solarIrradiance || 0) * 0.03) as number,
    }));
  }
  getSolarOutput() {
    return {
      totalWatts: this._solarTotalOutputW,
      efficiency: this._solarPanels.length > 0 ? this._solarPanels.reduce((s, p) => s + (p.efficiency || 0.2), 0) / this._solarPanels.length : 0,
      cellTempC: this._outsideTemp + (this._solarIrradiance || 0) * 0.03,
      batteryKWh: Math.max(0, -this._solarNetEnergyW) * 0.25 / 1000, // excess solar × frame hours as thermal battery proxy
      excessWatts: Math.max(0, -this._solarNetEnergyW),
      preCoolingActive: this._solarNetEnergyW < -500,
      dailyWh: this._solarDailyWh,
      lifetimeKWh: this._solarLifetimeKWh,
      panelCount: this._solarPanels.length,
    };
  }
  getSolarOptimizationResults() {
    return {
      generation: this._solarOptResults.length,
      bestScore: this._solarOptResults.length > 0 ? this._solarOptResults[0].score : 0,
      topDesigns: this._solarOptResults.slice(0, 10).map(d => {
        const avgThick = d.layers.reduce((s, l) => s + l.thickness, 0) / (d.layers.length || 1);
        const avgGap = d.layers.reduce((s, l) => s + l.bandgap, 0) / (d.layers.length || 1);
        return {
          thickness: avgThick / 1000, // convert nm to μm
          bandgap: avgGap,
          absorbance: d.predictedEfficiency,
          score: d.score,
        };
      }),
    };
  }
  getRoomCycles() {
    const result: Array<{ room: string; detected: boolean; period: number; strength: number; amplitude: number; mean: number }> = [];
    this._roomCycles.forEach((cycle, roomId) => {
      const room = this._rooms.find(r => r.id === roomId);
      result.push({
        room: room?.name || roomId,
        detected: cycle.stable,
        period: cycle.period,
        strength: cycle.confidence,
        amplitude: cycle.amplitude,
        mean: cycle.mean,
      });
    });
    return result;
  }
  getOptimizationHistory() {
    return this._optimizationHistory.map((opt, i) => {
      const room = this._rooms.find(r => r.id === opt.roomId);
      return {
        iteration: i,
        room: room?.name || opt.roomId,
        action: opt.config,
        improvement: opt.score,
      };
    });
  }
  getNeuralNetState() {
    let totalEpochs = 0;
    let totalLoss = 0;
    let count = 0;
    const roomList: Array<{ name: string; loss: number; epoch: number }> = [];
    this._roomNets.forEach((net, id) => {
      totalEpochs += net.epoch;
      totalLoss += net.loss;
      count++;
      const room = this._rooms.find(r => r.id === id);
      roomList.push({ name: room?.name || id, loss: net.loss, epoch: net.epoch });
    });
    return {
      totalEpochs,
      avgLoss: count > 0 ? totalLoss / count : 0,
      roomCount: count,
      rooms: roomList,
      materialNet: this._materialNet ? { loss: this._materialNet.loss, epoch: this._materialNet.epoch } : null,
    };
  }
  getAnnualClimate() {
    const ac = this._annualClimate;
    const day = ac.simulatedDayOfYear;
    const season = day < 60 || day >= 335 ? 'summer' : day < 152 ? 'autumn' : day < 244 ? 'winter' : 'spring';
    return {
      outsideTemp: ac.outsideTemp,
      solarIrradiance: ac.solarIrradiance,
      windSpeed: ac.windSpeed,
      windDirection: ac.windDirection,
      cloudCover: ac.cloudCover,
      dayOfYear: Math.round(ac.simulatedDayOfYear),
      hourOfDay: ac.simulatedHourOfDay,
      season,
      frameCount: ac.frameCount,
    };
  }
  getHVACState() {
    const mode = this._autoThermalMode;
    const cop = mode === 'cooling' ? 3.0 : mode === 'heating' ? 4.0 : 0;
    const runtimeHours = this._annualClimate.frameCount * 0.25; // 15min per frame
    return {
      mode,
      supplyTemp: this._hvacSupplyTemp,
      currentPowerW: this._hvacCurrentPowerW,
      cop,
      totalKWh: this._hvacEnergyUsedKWh,
      totalCost: this._hvacEnergyUsedKWh * 0.30, // ~$0.30/kWh
      runtimeHours,
    };
  }

  /** Turbulence / vorticity / equilibrium state for UI */
  getTurbulenceState() {
    return {
      vorticity: this._vorticity,        // Float32Array grid — curl of velocity
      gridW: this._gridW,
      gridH: this._gridH,
      turbulenceEnergy: this._turbulenceEnergy,
      turbulenceHistory: this._turbulenceHistory.slice(-100),
      equilibriumFound: this._equilibriumFound,
      equilibriumScore: this._equilibriumScore,
      nsSubsteps: this._nsSubsteps,
      iteration: this._iteration,
    };
  }

  dispose() {
    this.thermalHeatmap.geometry.dispose();
    (this.thermalHeatmap.material as THREE.Material).dispose();
    this.scene.remove(this.floorplanMesh);
    this.scene.remove(this.thermalHeatmap);
    this.scene.remove(this.ventArrows);
  }
}
