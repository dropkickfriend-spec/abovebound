/**
 * Source-audited reference data.
 *
 * Every entry names a document, publisher, year and locator, and carries the
 * system boundary it was measured on. Entries with `modelUse: false` are
 * context only and MUST NOT become screening defaults - a single case study
 * dressed as a general factor is precisely the failure this file exists to
 * stop.
 *
 * Provenance for the audit: docs/REFERENCE_DATA_HANDOFF.md.
 *
 * Adding a factor here without a locator, or flipping `modelUse` to true on a
 * single-case entry, defeats the point of the file.
 */

export type EvidenceConfidence =
  | 'high'
  /** Exact published evidence, imperfectly matched archetype or boundary. */
  | 'medium'
  /** Reproducible single case. Context only; never a general default. */
  | 'low_for_model_use';

export interface EvidenceSource {
  document: string;
  publisher: string;
  year: string;
  locator: string;
  url?: string;
}

export interface EmbodiedEnergyFactor {
  archetypeId: string;
  label: string;
  /** kWh per m2 of private dwelling floor. Null when no qualifying source exists. */
  lowKWhPerM2: number | null;
  typicalKWhPerM2: number | null;
  highKWhPerM2: number | null;
  /** What the measurement actually covered. Never assume EN 15978 A1-A3. */
  sourceBoundary: string;
  includesCommonStructure: boolean | null;
  confidence: EvidenceConfidence;
  /** False = context only. The screening model must not consume it. */
  modelUse: boolean;
  source: EvidenceSource | null;
  note: string;
}

const UNSW_SYDNEY_ESTATES: EvidenceSource = {
  document: 'The Environmental Impacts of Residential Development: Case Studies of 12 Estates in Sydney',
  publisher: 'Randolph, Holloway, Pullen & Troy - City Futures Research Centre, UNSW',
  year: '2007',
  locator: 'pp. 70-75, Table 8.2',
  url: 'https://www.be.unsw.edu.au/sites/default/files/upload/FinalLandcomEnergyandWaterReport.pdf',
};

const BREWSTER_BOND: EvidenceSource = {
  document: 'Sustainable Urban Residential Forms in an Oil-constrained Future',
  publisher: 'Roger Brewster - Bond University PhD thesis',
  year: '2017',
  locator: 'pp. 165-167 Tables 5.3-5.4 (low-rise); pp. 181-182 Tables 5.10-5.11 (tower)',
  url: 'https://pure.bond.edu.au/ws/portalfiles/portal/36143002/Roger_Brewster_Thesis.pdf',
};

/**
 * Embodied energy per m2 of private dwelling floor.
 *
 * Only the detached series has a published multi-case Australian range, and it
 * is an older `initial as-built materials` boundary, NOT modern EN 15978
 * A1-A3. Terrace and both apartment archetypes have NO qualifying source: the
 * Sydney study cannot isolate a mid-row dwelling, and the apartment evidence is
 * two single cases on a broader boundary that already allocates common
 * structure. Those two are recorded with `modelUse: false`.
 */
export const EMBODIED_ENERGY_EVIDENCE: EmbodiedEnergyFactor[] = [
  {
    archetypeId: 'detached',
    label: 'Detached house',
    // 6.4 / 6.5 / 7.1 GJ/m2, converted with the exact identity 1 kWh = 3.6 MJ.
    lowKWhPerM2: 1778,
    typicalKWhPerM2: 1806,
    highKWhPerM2: 1972,
    sourceBoundary: 'initial as-built materials (2007 study boundary), not EN 15978 A1-A3',
    includesCommonStructure: false,
    confidence: 'medium',
    modelUse: true,
    source: UNSW_SYDNEY_ESTATES,
    note: 'Median of the eight detached-estate entries. Garage area is inside the study floor-area denominator.',
  },
  {
    archetypeId: 'terrace_mid',
    label: 'Mid-row / terrace',
    lowKWhPerM2: null,
    typicalKWhPerM2: null,
    highKWhPerM2: null,
    sourceBoundary: 'no qualifying source',
    includesCommonStructure: null,
    confidence: 'medium',
    modelUse: false,
    source: UNSW_SYDNEY_ESTATES,
    note: 'The Kings Bay result combines townhouses and apartments and cannot isolate a mid-row dwelling.',
  },
  {
    archetypeId: 'lowrise_apartment_mid',
    label: 'Low-rise middle apartment',
    lowKWhPerM2: null,
    typicalKWhPerM2: 6747,
    highKWhPerM2: null,
    sourceBoundary: 'single case, broader than A1-A3, includes allocated common structure',
    includesCommonStructure: true,
    confidence: 'low_for_model_use',
    modelUse: false,
    source: BREWSTER_BOND,
    note: '3,943 GJ over 162.3 m2 private area, including a 75.4 m2 share of foyers, ground floor and parking. Context only.',
  },
  {
    archetypeId: 'tower_apartment_mid',
    label: 'Tower middle apartment',
    lowKWhPerM2: null,
    typicalKWhPerM2: 6900,
    highKWhPerM2: null,
    sourceBoundary: 'single case, broader than A1-A3, includes allocated common structure',
    includesCommonStructure: true,
    confidence: 'low_for_model_use',
    modelUse: false,
    source: BREWSTER_BOND,
    note: '3,075 GJ over 123.8 m2 including balcony, plus a 62.6 m2 share of core, basements, ground common area and roof terrace. Context only.',
  },
];

export const embodiedEvidenceFor = (archetypeId: string): EmbodiedEnergyFactor | undefined =>
  EMBODIED_ENERGY_EVIDENCE.find(entry => entry.archetypeId === archetypeId);

/**
 * Comfort criteria.
 *
 * The audit is explicit that there is NO accepted conversion from temperature
 * deviation to an energy penalty. Comfort is a constraint; exceedance is
 * reported separately from energy.
 */
export const COMFORT_CRITERIA = {
  /** ASHRAE 55 mechanically conditioned band, ~90% thermal acceptability. */
  pmvLimit: 0.5,
  pmvSource: {
    document: 'ANSI/ASHRAE Addenda o, p, q to Standard 55-2010',
    publisher: 'ASHRAE',
    year: '2013',
    locator: 'p. 6 §7.4.2.2.1 and p. 7',
    url: 'https://www.ashrae.org/file%20library/technical%20resources/standards%20and%20guidelines/standards%20addenda/55_2010_opq_final_08012013.pdf',
  } as EvidenceSource,
  /** EN 16798-1 Category II residential design operative temperatures. */
  heatingDesignTempC: 20,
  coolingDesignTempC: 26,
  categorySource: {
    document: 'EN 16798-1:2019 Energy performance of buildings - Ventilation for buildings - Part 1',
    publisher: 'CEN',
    year: '2019',
    locator: 'Annex B, pp. 44-45, Tables B.1-B.2',
    url: 'https://cdn.standards.iteh.ai/samples/41425/b93918356f7346248f36f4a48228a7da/SIST-EN-16798-1-2019.pdf',
  } as EvidenceSource,
  /** NatHERS thermostat schedule, Australian residential. */
  natHersLivingHeatingC: 20,
  natHersBedroomHeatingC: 18,
  natHersSource: {
    document: 'NatHERS Whole of Home Calculations Method for new and existing homes, v20250626',
    publisher: 'NatHERS Administrator, DCCEEW',
    year: '2025',
    locator: 'p. 27 §3.2.6, Table 3',
    url: 'https://www.nathers.gov.au/sites/default/files/2025-07/NatHERS%20Whole%20of%20Home%20Calculation%20Method%20v20250626.pdf',
  } as EvidenceSource,
  /**
   * No standard prescribes a universal "within X K for Y% of occupied hours",
   * and none converts deviation into energy. Both were checked and are absent.
   */
  prescribedExceedanceFraction: null as number | null,
  energyPenaltyConversion: null as number | null,
} as const;

/** Glazing inputs. Sourced, but see the boundary note on solar applicability. */
export const GLAZING_EVIDENCE = {
  /** Net conditioned floor area share, Australian 6-star design sample. */
  glazingToFloorRatioRange: { lowPercent: 19.9, highPercent: 27.9 },
  /** Victorian entries: Mildura 19.9, Tullamarine 22.4. */
  victorianGlazingToFloorPercent: 22.4,
  glazingRatioSource: {
    document: 'A review of industry feedback and approaches to upgrading to 7-star building fabric',
    publisher: 'Tony Isaacs Consulting for the Australian Building Codes Board',
    year: '2022',
    locator: 'p. 25, Table 8',
    url: 'https://www.abcb.gov.au/sites/default/files/resources/2022/Energy%202022%20RIS%20-%20TIC%20Industry%20Consultation%20on%20Building%20Fabric%20Costs.pdf',
  } as EvidenceSource,
  /** Whole-system SHGC, single clear glazing in a standard aluminium frame. */
  standardSHGC: 0.75,
  /** Improved systems; single low-e in a standard aluminium frame is 0.52. */
  improvedSHGCRange: { low: 0.44, high: 0.64 },
  shgcSource: {
    document: 'Pathway to 2020 for Increased Stringency in New Building Energy Efficiency Standards: Benefit Cost Analysis',
    publisher: 'pitt&sherry for the Australian Government DCCEE',
    year: '2012',
    locator: 'p. 93, Table A3.9',
    url: 'https://www.energy.gov.au/sites/default/files/pathway-2020-increase-stringency-new-building-energy-efficiency-standards-benefit-cost-analysis-residential-update-2016.pdf',
  } as EvidenceSource,
  /**
   * NCC Volume Two sets NO dwelling-wide energy glazing minimum. The 10% rule
   * is a per-habitable-room DAYLIGHT requirement and must not be reused as an
   * energy-model glazing fraction.
   */
  nccDaylightMinimumPercentPerRoom: 10,
  nccSource: {
    document: 'NCC 2022 Housing Provisions Standard',
    publisher: 'Australian Building Codes Board',
    year: '2022',
    locator: 'p. 267, Part 10.5, Clause 10.5.1',
    url: 'https://ncc.abcb.gov.au/sites/default/files/resources/2025/ncc2022-abcb-housing-provisions.pdf',
  } as EvidenceSource,
} as const;

/**
 * ASHRAE Standard 140 / BESTEST annual load acceptance bands, MWh/year.
 *
 * These are SOFTWARE-VALIDATION targets against a specified case building on
 * Denver weather. They are not Australian dwelling-load benchmarks, and a model
 * landing outside them is not certified or uncertified by that fact alone.
 */
export interface BestestCaseRange {
  caseId: string;
  description: string;
  heatingMWhRange: { low: number; high: number };
  sensibleCoolingMWhRange: { low: number; high: number };
  source: EvidenceSource;
}

const STANDARD_140_ADDENDUM_A: EvidenceSource = {
  document: 'ANSI/ASHRAE/IBPSA Addendum a to ANSI/ASHRAE Standard 140-2023',
  publisher: 'ASHRAE / IBPSA',
  year: '2025',
  locator: 'p. 3 Table A3-1 (Case 600); p. 5 replacement high-mass annual-load table, Table A3-4 in the redline (Case 900)',
  url: 'https://www.ashrae.org/file%20library/technical%20resources/standards%20and%20guidelines/standards%20addenda/140_2023_a_20250829.pdf',
};

export const BESTEST_ACCEPTANCE_RANGES: BestestCaseRange[] = [
  {
    caseId: '600',
    description: 'Low-mass base case, south-facing glazing',
    heatingMWhRange: { low: 3.75, high: 4.98 },
    sensibleCoolingMWhRange: { low: 5.00, high: 6.83 },
    source: STANDARD_140_ADDENDUM_A,
  },
  {
    caseId: '900',
    description: 'High-mass base case, south-facing glazing',
    heatingMWhRange: { low: 1.04, high: 2.28 },
    sensibleCoolingMWhRange: { low: 2.35, high: 2.60 },
    source: STANDARD_140_ADDENDUM_A,
  },
];

/** Whether an annual load falls inside a published acceptance band. */
export function withinBestestRange(
  caseId: string,
  metric: 'heating' | 'cooling',
  annualMWh: number,
): boolean | null {
  const entry = BESTEST_ACCEPTANCE_RANGES.find(item => item.caseId === caseId);
  if (!entry) return null;
  const range = metric === 'heating' ? entry.heatingMWhRange : entry.sensibleCoolingMWhRange;
  return annualMWh >= range.low && annualMWh <= range.high;
}
