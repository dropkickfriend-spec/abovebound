import type { SiteLocationProfile } from './site_geometry_optimizer';

export type SiteContextSource = 'cached_open_buildings' | 'engine_geometry';
export type SiteContextUncertaintyBand = 'low' | 'medium' | 'high';

export interface SiteContextRoom {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  ceilingHeight: number;
}

export interface LocalBuildingMass {
  id: string;
  role: 'subject' | 'neighbour';
  polygon: Array<{ x: number; y: number }>;
  heightM: number;
  levels: number;
  distanceM: number;
  heightSource: 'measured' | 'levels' | 'default';
  geometrySource: 'open_building_footprint' | 'engine_room_geometry';
}

export interface SiteContextEvidence {
  label: string;
  status: 'observed' | 'derived' | 'assumed' | 'missing';
  detail: string;
}

export interface AutomaticSiteContextResult {
  contextVersion: 1;
  cacheKey: string;
  location: SiteLocationProfile;
  source: SiteContextSource;
  subjectSelection: 'anchor_contains_footprint' | 'nearest_anchor_footprint' | 'engine_geometry';
  subject: LocalBuildingMass;
  neighbours: LocalBuildingMass[];
  solarObstruction: {
    method: 'azimuth_horizon_screening';
    skyViewPercent: number;
    equatorHorizonAngleDeg: number;
    summerShadePotentialPercent: number;
    winterSolarAccessPercent: number;
    confidencePercent: number;
  };
  searchRadiusM: number;
  completenessPercent: number;
  uncertainty: {
    geometryPercent: number;
    heightPercent: number;
    climatePercent: number;
    overallPercent: number;
    band: SiteContextUncertaintyBand;
  };
  evidence: SiteContextEvidence[];
  assumptions: string[];
}

type GeoJsonGeometry = {
  type?: string;
  coordinates?: unknown;
};

type GeoJsonFeature = {
  id?: string | number;
  properties?: Record<string, unknown> | null;
  geometry?: GeoJsonGeometry | null;
};

export type GeoJsonFeatureCollection = {
  type?: string;
  features?: GeoJsonFeature[];
};

export interface AutomaticSiteContextInput {
  location: SiteLocationProfile;
  rooms?: SiteContextRoom[];
  cachedGeoJson?: GeoJsonFeatureCollection | null;
  searchRadiusM?: number;
}

const round = (value: number, digits = 2) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const makeSiteContextCacheKey = (latitudeDeg: number, longitudeDeg: number) => (
  `${latitudeDeg.toFixed(4)}_${longitudeDeg.toFixed(4)}`.replaceAll('-', 'm').replaceAll('.', 'p')
);

const localPoint = (longitudeDeg: number, latitudeDeg: number, origin: SiteLocationProfile) => ({
  x: (longitudeDeg - origin.longitudeDeg) * 111_320 * Math.cos(origin.latitudeDeg * Math.PI / 180),
  y: (latitudeDeg - origin.latitudeDeg) * 110_540,
});

const centroid = (polygon: Array<{ x: number; y: number }>) => {
  if (!polygon.length) return { x: 0, y: 0 };
  return polygon.reduce((sum, point) => ({ x: sum.x + point.x / polygon.length, y: sum.y + point.y / polygon.length }), { x: 0, y: 0 });
};

const containsOrigin = (polygon: Array<{ x: number; y: number }>) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (((a.y > 0) !== (b.y > 0)) && (0 < (b.x - a.x) * (0 - a.y) / ((b.y - a.y) || 1e-9) + a.x)) inside = !inside;
  }
  return inside;
};

const firstPolygonRing = (geometry?: GeoJsonGeometry | null): number[][] | null => {
  if (!geometry?.coordinates) return null;
  if (geometry.type === 'Polygon') return (geometry.coordinates as number[][][])[0] || null;
  if (geometry.type === 'MultiPolygon') return (geometry.coordinates as number[][][][])[0]?.[0] || null;
  return null;
};

const finiteNumber = (...values: unknown[]) => {
  for (const value of values) {
    const numeric = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
};

const roomSubject = (rooms: SiteContextRoom[]): LocalBuildingMass => {
  const safe = rooms.filter(room => room.width > 0 && room.height > 0);
  const minX = safe.length ? Math.min(...safe.map(room => room.x)) : -4.3;
  const minY = safe.length ? Math.min(...safe.map(room => room.y)) : -4.1;
  const maxX = safe.length ? Math.max(...safe.map(room => room.x + room.width)) : 4.3;
  const maxY = safe.length ? Math.max(...safe.map(room => room.y + room.height)) : 4.1;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const heightM = safe.length ? Math.max(...safe.map(room => room.ceilingHeight || 2.7)) : 2.7;
  return {
    id: 'engine-subject', role: 'subject',
    polygon: [
      { x: minX - cx, y: minY - cy }, { x: maxX - cx, y: minY - cy },
      { x: maxX - cx, y: maxY - cy }, { x: minX - cx, y: maxY - cy },
    ],
    heightM: round(heightM), levels: 1, distanceM: 0,
    heightSource: 'default', geometrySource: 'engine_room_geometry',
  };
};

export function buildAutomaticSiteContext(input: AutomaticSiteContextInput): AutomaticSiteContextResult {
  const searchRadiusM = clamp(input.searchRadiusM || 120, 25, 500);
  const cacheKey = makeSiteContextCacheKey(input.location.latitudeDeg, input.location.longitudeDeg);
  const features = input.cachedGeoJson?.features || [];
  const parsed = features.flatMap((feature, index) => {
    const ring = firstPolygonRing(feature.geometry);
    if (!ring || ring.length < 3) return [];
    const polygon = ring.map(coordinate => localPoint(Number(coordinate[0]), Number(coordinate[1]), input.location));
    if (polygon.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return [];
    const center = centroid(polygon);
    const distanceM = Math.hypot(center.x, center.y);
    if (distanceM > searchRadiusM * 1.4) return [];
    const properties = feature.properties || {};
    const measuredHeight = finiteNumber(properties.height, properties['building:height'], properties.render_height);
    const levels = finiteNumber(properties.num_floors, properties.levels, properties['building:levels']);
    const heightM = measuredHeight && measuredHeight > 1 ? measuredHeight : levels && levels > 0 ? levels * 3.2 : 3.2;
    const heightSource: LocalBuildingMass['heightSource'] = measuredHeight && measuredHeight > 1 ? 'measured' : levels && levels > 0 ? 'levels' : 'default';
    return [{
      id: String(feature.id ?? properties.id ?? `building-${index}`),
      role: 'neighbour' as const,
      polygon: polygon.map(point => ({ x: round(point.x), y: round(point.y) })),
      heightM: round(heightM),
      levels: Math.max(1, Math.round(levels || heightM / 3.2)),
      distanceM: round(distanceM),
      heightSource,
      geometrySource: 'open_building_footprint' as const,
      containsAnchor: containsOrigin(polygon),
    }];
  });

  const containing = parsed.find(building => building.containsAnchor);
  const nearest = [...parsed].sort((a, b) => a.distanceM - b.distanceM)[0];
  const selected = containing || (nearest && nearest.distanceM <= 30 ? nearest : null);
  const fallbackSubject = roomSubject(input.rooms || []);
  const subject: LocalBuildingMass = selected ? { ...selected, role: 'subject' } : fallbackSubject;
  const subjectCenter = selected ? centroid(selected.polygon) : { x: 0, y: 0 };
  const neighbours = parsed
    .filter(building => building.id !== selected?.id)
    .map(({ containsAnchor: _containsAnchor, ...building }) => ({
      ...building,
      polygon: building.polygon.map(point => ({ x: round(point.x - subjectCenter.x), y: round(point.y - subjectCenter.y) })),
      distanceM: round(Math.hypot(centroid(building.polygon).x - subjectCenter.x, centroid(building.polygon).y - subjectCenter.y)),
    }))
    .filter(building => building.distanceM <= searchRadiusM)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 80);
  if (selected) subject.polygon = selected.polygon.map(point => ({ x: round(point.x - subjectCenter.x), y: round(point.y - subjectCenter.y) }));

  const openGeometry = parsed.length > 0;
  const knownHeightCount = parsed.filter(building => building.heightSource !== 'default').length;
  const heightPercent = openGeometry ? round(knownHeightCount / parsed.length * 100, 0) : 0;
  const geometryPercent = selected ? (containing ? 95 : 72) : input.rooms?.length ? 55 : 25;
  const climatePercent = 65;
  const completenessPercent = Math.round(geometryPercent * 0.5 + heightPercent * 0.25 + climatePercent * 0.25);
  const overallPercent = 100 - completenessPercent;
  const band: SiteContextUncertaintyBand = overallPercent <= 25 ? 'low' : overallPercent <= 50 ? 'medium' : 'high';
  const source: SiteContextSource = openGeometry ? 'cached_open_buildings' : 'engine_geometry';
  const horizonBins = Array.from({ length: 12 }, () => 0);
  const equatorAzimuthDeg = input.location.latitudeDeg < 0 ? 0 : 180;
  let equatorHorizonAngleDeg = 0;
  neighbours.forEach(building => {
    const center = centroid(building.polygon);
    const distance = Math.max(1, Math.hypot(center.x, center.y));
    const altitudeDeg = Math.atan2(building.heightM, distance) * 180 / Math.PI;
    const azimuthDeg = (Math.atan2(center.x, center.y) * 180 / Math.PI + 360) % 360;
    const bin = Math.round(azimuthDeg / 30) % 12;
    horizonBins[bin] = Math.max(horizonBins[bin], altitudeDeg);
    const difference = Math.abs(((azimuthDeg - equatorAzimuthDeg + 540) % 360) - 180);
    const directionalWeight = Math.max(0, Math.cos(difference * Math.PI / 180)) ** 4;
    equatorHorizonAngleDeg = Math.max(equatorHorizonAngleDeg, altitudeDeg * directionalWeight);
  });
  const skyViewPercent = neighbours.length
    ? horizonBins.reduce((sum, angle) => sum + Math.cos(angle * Math.PI / 180) ** 2, 0) / horizonBins.length * 100
    : 100;
  const summerShadePotentialPercent = clamp((100 - skyViewPercent) * 1.45, 0, 68);
  const winterSolarAccessPercent = clamp(100 - equatorHorizonAngleDeg / 60 * 82, 10, 100);

  return {
    contextVersion: 1,
    cacheKey,
    location: input.location,
    source,
    subjectSelection: containing ? 'anchor_contains_footprint' : selected ? 'nearest_anchor_footprint' : 'engine_geometry',
    subject,
    neighbours,
    solarObstruction: {
      method: 'azimuth_horizon_screening',
      skyViewPercent: round(skyViewPercent, 1),
      equatorHorizonAngleDeg: round(equatorHorizonAngleDeg, 1),
      summerShadePotentialPercent: round(summerShadePotentialPercent, 1),
      winterSolarAccessPercent: round(winterSolarAccessPercent, 1),
      confidencePercent: Math.round((geometryPercent * 0.65 + heightPercent * 0.35)),
    },
    searchRadiusM,
    completenessPercent,
    uncertainty: { geometryPercent, heightPercent, climatePercent, overallPercent, band },
    evidence: [
      { label: 'Subject footprint', status: selected ? 'observed' : 'derived', detail: selected ? 'Selected from cached open building footprints.' : 'Derived from rooms currently loaded in the simulation.' },
      { label: 'Neighbour massing', status: neighbours.length ? 'observed' : 'missing', detail: neighbours.length ? `${neighbours.length} cached footprint(s) within ${searchRadiusM} m.` : 'No cached open neighbour footprints are available at this anchor yet.' },
      { label: 'Building heights', status: heightPercent >= 60 ? 'observed' : heightPercent > 0 ? 'derived' : 'assumed', detail: heightPercent > 0 ? `${heightPercent}% of open footprints include height or level evidence.` : 'Unspecified heights use a labelled 3.2 m per-floor assumption.' },
      { label: 'Climate', status: 'derived', detail: 'Location preset or nearest-preset climatology; exact weather-year calibration is not loaded.' },
    ],
    assumptions: [
      'Open footprints are treated as roof/building outlines, not proof of internal floor plans, shared cavities or construction materials.',
      'A footprint containing the location anchor is preferred; otherwise only a footprint within 30 m can become the subject building.',
      'Unknown building heights default to one 3.2 m storey and remain visibly marked as assumed.',
      'All geometry is transformed to a local metric tangent plane and processed locally after it enters the cache.',
    ],
  };
}
