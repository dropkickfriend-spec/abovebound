/**
 * Setpoint-corrected degree days.
 *
 * Climate presets carry heating/cooling degree days evaluated at a fixed base
 * temperature (conventionally 18 degC in Australian practice). An occupant who
 * asks for a different indoor setpoint does not experience those degree days:
 * raising the setpoint increases heating demand and reduces cooling demand.
 *
 * The preset pair (HDD, CDD) is enough to recover a screening-grade annual
 * temperature profile without any external weather file:
 *
 *   HDD - CDD = sum(Tbase - T(d)) = 365*Tbase - sum(T(d))
 *
 * which fixes the annual mean exactly, independent of the profile shape:
 *
 *   Tmean = Tbase - (HDD - CDD) / 365
 *
 * The remaining freedom is the annual swing amplitude, recovered from
 *
 *   HDD + CDD = sum(|Tbase - T(d)|)
 *
 * which increases monotonically with amplitude, so a bisection is well posed.
 * Matching the sum while the difference already holds by construction
 * reproduces BOTH input degree-day totals exactly, so evaluating at the base
 * temperature is an identity and existing preset numbers round-trip.
 *
 * A sinusoidal daily-mean profile is used. Its phase is irrelevant because the
 * sums run over a whole period, so no hemisphere handling is required.
 *
 * Limitations: this is a smooth climatology screen recovered from two annual
 * totals. It does not represent real daily variance, heat waves or cold snaps,
 * and it is not a substitute for the cached hourly weather path.
 *
 * The amplitude is only identifiable while BOTH degree-day totals are non-zero.
 * Where a preset reports zero heating (or zero cooling) degree days the swing
 * is unconstrained on that side and collapses toward the annual mean, so
 * setpoints far from the base temperature extrapolate optimistically in those
 * climates. Darwin is the worked example in this preset set. Treat a
 * single-sided climate as low-evidence until the hourly weather path lands.
 */

export const DEFAULT_DEGREE_DAY_BASE_TEMP_C = 18;
const DAYS_PER_YEAR = 365;

export interface DegreeDayClimate {
  heatingDegreeDays: number;
  coolingDegreeDays: number;
}

export interface AnnualTemperatureProfile {
  meanTempC: number;
  amplitudeC: number;
}

const degreeDaysForProfile = (
  profile: AnnualTemperatureProfile,
  balanceTempC: number,
): DegreeDayClimate => {
  let heating = 0;
  let cooling = 0;
  for (let day = 0; day < DAYS_PER_YEAR; day += 1) {
    const dailyMeanC = profile.meanTempC
      + profile.amplitudeC * Math.cos(2 * Math.PI * day / DAYS_PER_YEAR);
    const delta = dailyMeanC - balanceTempC;
    if (delta >= 0) cooling += delta;
    else heating -= delta;
  }
  return { heatingDegreeDays: heating, coolingDegreeDays: cooling };
};

/**
 * Recover the annual daily-mean temperature profile implied by a preset
 * degree-day pair. Deterministic: fixed iteration count, no randomness.
 */
export function fitAnnualTemperatureProfile(
  climate: DegreeDayClimate,
  baseTempC: number = DEFAULT_DEGREE_DAY_BASE_TEMP_C,
): AnnualTemperatureProfile {
  const heating = Math.max(0, Number(climate.heatingDegreeDays) || 0);
  const cooling = Math.max(0, Number(climate.coolingDegreeDays) || 0);
  const meanTempC = baseTempC - (heating - cooling) / DAYS_PER_YEAR;
  const targetSum = heating + cooling;

  // |T - Tbase| summed over the year grows monotonically with amplitude, and at
  // zero amplitude already equals |HDD - CDD| <= targetSum, so a root exists.
  let low = 0;
  let high = 60;
  for (let iteration = 0; iteration < 80; iteration += 1) {
    const mid = (low + high) / 2;
    const trial = degreeDaysForProfile({ meanTempC, amplitudeC: mid }, baseTempC);
    if (trial.heatingDegreeDays + trial.coolingDegreeDays < targetSum) low = mid;
    else high = mid;
  }
  return { meanTempC, amplitudeC: (low + high) / 2 };
}

/**
 * Re-evaluate degree days at an occupant setpoint rather than the preset base.
 * Returns the preset values unchanged when the setpoint equals the base.
 */
export function adjustDegreeDaysForSetpoint(
  climate: DegreeDayClimate,
  setpointC: number,
  baseTempC: number = DEFAULT_DEGREE_DAY_BASE_TEMP_C,
): DegreeDayClimate {
  const profile = fitAnnualTemperatureProfile(climate, baseTempC);
  return degreeDaysForProfile(profile, setpointC);
}
