/**
 * Panel coupling - downstream panels screen the building the upstream panels
 * actually chose.
 *
 * Sharing inputs (see shared_site_model.ts) stops the panels contradicting each
 * other about the SITE. It does not make them simulate each other's EFFECTS.
 * Those are different problems, and only the first was solved before this.
 *
 * Concretely: the HVAC cycling panel screened a hardcoded 18 m2 room with a
 * hardcoded 75.6 W/K envelope and 0.7 ACH, no matter what the site optimizer
 * had just decided the building was, and no matter what airflow rate the
 * whole-system sweep had just selected. Running the site optimizer changed
 * nothing downstream. Every panel was a separate piece of arithmetic wearing
 * the same site.
 *
 * This module derives downstream inputs from upstream RESULTS. Derivations
 * introduce no new constants: each one is either a geometric identity or a
 * back-calculation from a number the upstream panel already produced, so a
 * coupled input is traceable to the design it came from.
 */

export interface UpstreamRoom {
  name: string;
  floorAreaM2: number;
  internalLoadW: number;
}

/** The chosen building form, reduced to what downstream panels need. */
export interface UpstreamSiteDesign {
  floorAreaM2: number;
  ceilingHeightM: number;
  externalWallAreaM2: number;
  /** Annual THERMAL envelope load (heating + cooling), before plant COP. */
  envelopeThermalKWh: number;
  rooms: UpstreamRoom[];
}

/** The chosen whole-system airflow configuration. */
export interface UpstreamWholeHouse {
  designAirChangesPerHour: number;
  heatRecoveryEfficiency: number;
}

export interface CoupledField {
  field: string;
  value: number;
  /** Where the number came from, for the evidence label. */
  derivedFrom: string;
}

const round = (value: number, digits = 2) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

/**
 * Back-calculate the envelope conductance the upstream design implies.
 *
 *   UA [W/K] = envelopeThermalKWh x 1000 [Wh] / (degreeDays [K.day] x 24 [h/day])
 *
 * This is the inverse of the degree-day load the site optimizer already
 * computed, so the downstream panel screens that same envelope rather than a
 * hardcoded one. Introduces no constant of its own.
 */
export function deriveEnvelopeConductanceWPerK(
  envelopeThermalKWh: number,
  degreeDays: number,
): number {
  if (!(degreeDays > 0) || !(envelopeThermalKWh > 0)) return 0;
  return envelopeThermalKWh * 1000 / (degreeDays * 24);
}

/** The room a single-room transient panel should represent: the largest. */
export function representativeRoom(design: UpstreamSiteDesign): UpstreamRoom | null {
  if (!design.rooms?.length) return null;
  return design.rooms.reduce(
    (largest, room) => room.floorAreaM2 > largest.floorAreaM2 ? room : largest,
    design.rooms[0],
  );
}

/**
 * HVAC cycling inputs derived from the chosen form and the chosen airflow rate.
 * Geometry and internal gains come from the site design's representative room;
 * the air-change rate comes from the whole-system winner, so changing the
 * airflow strategy upstream now moves the cycling result downstream.
 */
export function coupleHvacCycleInputs(
  design: UpstreamSiteDesign | null,
  wholeHouse: UpstreamWholeHouse | null,
  degreeDays: number,
): CoupledField[] {
  const coupled: CoupledField[] = [];
  const room = design ? representativeRoom(design) : null;

  if (design && room && design.floorAreaM2 > 0) {
    const volumeM3 = room.floorAreaM2 * design.ceilingHeightM;
    const totalUa = deriveEnvelopeConductanceWPerK(design.envelopeThermalKWh, degreeDays);
    const roomShare = room.floorAreaM2 / design.floorAreaM2;
    coupled.push(
      { field: 'floorAreaM2', value: round(room.floorAreaM2), derivedFrom: `site design room "${room.name}"` },
      { field: 'roomVolumeM3', value: round(volumeM3), derivedFrom: 'site design room area x ceiling height' },
      { field: 'internalGainsW', value: round(room.internalLoadW), derivedFrom: `site design room "${room.name}"` },
    );
    if (totalUa > 0) {
      coupled.push({
        field: 'envelopeConductanceWPerK',
        value: round(totalUa * roomShare),
        derivedFrom: 'site design envelope load back-calculated over shared degree days',
      });
    }
    if (wholeHouse) {
      const flowM3s = volumeM3 * wholeHouse.designAirChangesPerHour / 3600;
      coupled.push({
        field: 'outsideAirFlowM3s',
        value: round(flowM3s, 5),
        derivedFrom: 'whole-system air change rate x room volume',
      });
    }
  }

  if (wholeHouse) {
    coupled.push({
      field: 'airLeakageAch',
      value: round(wholeHouse.designAirChangesPerHour),
      derivedFrom: 'whole-system winning configuration',
    });
  }
  return coupled;
}

/**
 * Adaptive-wall inputs derived from the chosen envelope. The wall the panel
 * screens is the wall the site optimizer selected, not a fixed 25 m2.
 */
export function coupleAdaptiveWallInputs(
  design: UpstreamSiteDesign | null,
): CoupledField[] {
  if (!design || !(design.externalWallAreaM2 > 0)) return [];
  return [
    { field: 'wallAreaM2', value: round(design.externalWallAreaM2), derivedFrom: 'site design external wall area' },
    // The switchable lattice covers the opaque wall; keep it bounded by that wall.
    { field: 'latticeAreaM2', value: round(design.externalWallAreaM2 * 0.8), derivedFrom: 'site design external wall area (opaque share)' },
  ];
}

/** Room optimizer floor-area floor, taken from the chosen design. */
export function coupleRoomOptimizerInputs(
  design: UpstreamSiteDesign | null,
): CoupledField[] {
  const room = design ? representativeRoom(design) : null;
  if (!room) return [];
  return [
    { field: 'minFloorAreaM2', value: round(room.floorAreaM2), derivedFrom: `site design room "${room.name}"` },
  ];
}

/** Apply coupled fields over a panel's inputs, reporting what actually moved. */
export function applyCoupledFields<T extends Record<string, unknown>>(
  localInputs: T,
  coupled: CoupledField[],
): { inputs: T; applied: CoupledField[] } {
  const inputs = { ...localInputs } as Record<string, unknown>;
  const applied: CoupledField[] = [];
  coupled.forEach(entry => {
    if (!Number.isFinite(entry.value)) return;
    if (inputs[entry.field] !== entry.value) applied.push(entry);
    inputs[entry.field] = entry.value;
  });
  return { inputs: inputs as T, applied };
}
