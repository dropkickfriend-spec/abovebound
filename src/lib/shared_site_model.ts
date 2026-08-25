/**
 * Shared site model - one source of truth for the physical facts that every
 * panel is screening the SAME building against.
 *
 * The panels each carried their own copy of these quantities, and the copies
 * disagreed. Lifecycle horizon in particular was 15, 20, 20, 25 and 30 years
 * across five panels, all of which print a "net lifecycle saving %" headline,
 * displayed side by side with nothing telling the user the horizons differ.
 * Those percentages were not comparable. Indoor setpoint, HVAC COP and the
 * selected location preset were likewise duplicated per panel and free to
 * drift apart as soon as anyone edited one.
 *
 * A quantity belongs here when it is a property of the SITE or the SCREENING
 * RUN rather than of one panel's mechanism. Lattice fill fraction stays local
 * to the adaptive-wall panel; the lifecycle horizon does not.
 *
 * Panels keep their own local parameters and derive the shared ones through
 * the `project*` helpers below, so a single edit reaches every panel and the
 * headline numbers stay comparable by construction.
 */

import { SITE_LOCATION_PRESETS, type SiteLocationProfile } from './site_geometry_optimizer';

export interface SharedSiteModel {
  /** Location, climatology and design temperatures. One site, not five. */
  location: SiteLocationProfile;
  /** Preset key the location came from, so every panel agrees which site is loaded. */
  locationPresetKey: string;
  /** Indoor setpoint. Reaches annual energy through setpoint-corrected degree days. */
  targetIndoorTempC: number;
  /** Lifecycle horizon. Every "lifecycle saving %" headline must use this one. */
  lifecycleYears: number;
  /** Seasonal coefficient of performance for the conditioning plant. */
  hvacCop: number;
  /** Days per year the plant conditions the space. */
  conditioningDaysPerYear: number;
  /**
   * Day-range swing applied either side of a design temperature to build the
   * diurnal range the transient panels need.
   *
   * Calibration constant, NOT a measured or sourced quantity: it replaces four
   * separately hardcoded day ranges (18-35, 18-36, 2-13) with one documented
   * assumption. It should be replaced by the cached hourly weather path
   * (priority queue item 4) rather than tuned.
   */
  designDiurnalSwingC: number;
}

export const DEFAULT_SHARED_SITE_MODEL: SharedSiteModel = {
  location: { ...SITE_LOCATION_PRESETS.bendigo },
  locationPresetKey: 'bendigo',
  targetIndoorTempC: 22,
  lifecycleYears: 30,
  hvacCop: 3.6,
  conditioningDaysPerYear: 180,
  designDiurnalSwingC: 12,
};

/** The outdoor day range a transient panel should screen against, per mode. */
export function outdoorDayRangeC(
  model: SharedSiteModel,
  mode: 'cooling' | 'heating',
): { lowC: number; highC: number } {
  return mode === 'cooling'
    ? { lowC: model.location.summerDesignTempC - model.designDiurnalSwingC, highC: model.location.summerDesignTempC }
    : { lowC: model.location.winterDesignTempC, highC: model.location.winterDesignTempC + model.designDiurnalSwingC };
}

/**
 * Fields each panel must take from the shared model rather than hold its own
 * copy of. Keys are the panel-local names; values read the shared model.
 */
export const SHARED_FIELD_PROJECTIONS = {
  roomOptimizer: (model: SharedSiteModel) => ({
    targetTempC: model.targetIndoorTempC,
    lifecycleYears: model.lifecycleYears,
    hvacCop: model.hvacCop,
    outdoorDesignTempC: model.location.summerDesignTempC,
  }),
  hvacCycle: (model: SharedSiteModel, mode: 'cooling' | 'heating' = 'cooling') => {
    const range = outdoorDayRangeC(model, mode);
    return {
      targetTempC: model.targetIndoorTempC,
      lifecycleYears: model.lifecycleYears,
      hvacCop: model.hvacCop,
      conditioningDaysPerYear: model.conditioningDaysPerYear,
      outdoorLowTempC: range.lowC,
      outdoorHighTempC: range.highC,
    };
  },
  adaptiveWall: (model: SharedSiteModel) => {
    const range = outdoorDayRangeC(model, 'cooling');
    return {
      indoorTempC: model.targetIndoorTempC,
      lifecycleYears: model.lifecycleYears,
      hvacCop: model.hvacCop,
      conditioningDaysPerYear: model.conditioningDaysPerYear,
      outdoorLowTempC: range.lowC,
      outdoorHighTempC: range.highC,
    };
  },
  autopilot: (model: SharedSiteModel) => ({
    ...model.location,
    targetIndoorTempC: model.targetIndoorTempC,
    lifecycleYears: model.lifecycleYears,
  }),
  siteOptimizer: (model: SharedSiteModel) => ({
    ...model.location,
    targetIndoorTempC: model.targetIndoorTempC,
    lifecycleYears: model.lifecycleYears,
  }),
  wholeHouse: (model: SharedSiteModel) => ({
    location: { ...model.location },
    targetTempC: model.targetIndoorTempC,
    lifecycleYears: model.lifecycleYears,
    hvacCop: model.hvacCop,
  }),
} as const;

export type SharedPanelId = keyof typeof SHARED_FIELD_PROJECTIONS;

export interface FieldOverride {
  panel: SharedPanelId;
  field: string;
  from: number | string;
  to: number | string;
}

const isComparableScalar = (value: unknown): value is number | string => (
  typeof value === 'number' || typeof value === 'string'
);

/**
 * Apply the shared model over a panel's local inputs. Upstream wins: shared
 * fields are overwritten, local-only fields are preserved untouched, and every
 * value actually changed is reported so the UI can show what it overrode
 * instead of silently discarding a hand-edited number.
 */
export function applySharedModel<T extends Record<string, unknown>>(
  panel: SharedPanelId,
  model: SharedSiteModel,
  localInputs: T,
  mode: 'cooling' | 'heating' = 'cooling',
): { inputs: T; overrides: FieldOverride[] } {
  const projector = SHARED_FIELD_PROJECTIONS[panel];
  const shared = panel === 'hvacCycle'
    ? (projector as (m: SharedSiteModel, mode: 'cooling' | 'heating') => Record<string, unknown>)(model, mode)
    : (projector as (m: SharedSiteModel) => Record<string, unknown>)(model);

  const overrides: FieldOverride[] = [];
  const inputs = { ...localInputs } as Record<string, unknown>;
  Object.entries(shared).forEach(([field, value]) => {
    const previous = inputs[field];
    if (previous !== value && isComparableScalar(previous) && isComparableScalar(value)) {
      overrides.push({ panel, field, from: previous, to: value });
    }
    inputs[field] = value;
  });
  return { inputs: inputs as T, overrides };
}

/** Every panel that screens a lifecycle horizon, for cross-panel consistency checks. */
export const LIFECYCLE_PANELS: SharedPanelId[] = [
  'roomOptimizer', 'hvacCycle', 'adaptiveWall', 'autopilot', 'siteOptimizer', 'wholeHouse',
];

/**
 * The lifecycle horizons every panel would screen against. All entries must be
 * equal for the panels' "% lifecycle saving" headlines to be comparable.
 */
export function lifecycleHorizonsByPanel(model: SharedSiteModel): Record<string, number> {
  const horizons: Record<string, number> = {};
  LIFECYCLE_PANELS.forEach(panel => {
    const projected = applySharedModel(panel, model, {} as Record<string, unknown>).inputs;
    horizons[panel] = Number(projected.lifecycleYears);
  });
  return horizons;
}
