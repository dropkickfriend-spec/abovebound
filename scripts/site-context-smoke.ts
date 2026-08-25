import { buildAutomaticSiteContext } from '../src/lib/site_context';
import { SITE_LOCATION_PRESETS } from '../src/lib/site_geometry_optimizer';

const location = SITE_LOCATION_PRESETS.bendigo;
const lonPerM = 1 / (111_320 * Math.cos(location.latitudeDeg * Math.PI / 180));
const latPerM = 1 / 110_540;
const rectangle = (cx: number, cy: number, width: number, depth: number) => [[
  location.longitudeDeg + (cx - width / 2) * lonPerM, location.latitudeDeg + (cy - depth / 2) * latPerM,
], [
  location.longitudeDeg + (cx + width / 2) * lonPerM, location.latitudeDeg + (cy - depth / 2) * latPerM,
], [
  location.longitudeDeg + (cx + width / 2) * lonPerM, location.latitudeDeg + (cy + depth / 2) * latPerM,
], [
  location.longitudeDeg + (cx - width / 2) * lonPerM, location.latitudeDeg + (cy + depth / 2) * latPerM,
], [
  location.longitudeDeg + (cx - width / 2) * lonPerM, location.latitudeDeg + (cy - depth / 2) * latPerM,
]];

const result = buildAutomaticSiteContext({
  location,
  cachedGeoJson: {
    type: 'FeatureCollection',
    features: [
      { id: 'subject', properties: { height: 6.4 }, geometry: { type: 'Polygon', coordinates: [rectangle(0, 0, 12, 9)] } },
      { id: 'east-neighbour', properties: { levels: 3 }, geometry: { type: 'Polygon', coordinates: [rectangle(24, 3, 10, 14)] } },
    ],
  },
});

if (result.source !== 'cached_open_buildings') throw new Error('Expected cached open-building evidence.');
if (result.subject.id !== 'subject') throw new Error('Anchor-containing building was not selected.');
if (result.neighbours.length !== 1) throw new Error('Expected the neighbouring mass to be retained.');
if (result.neighbours[0].heightSource !== 'levels') throw new Error('Expected level-derived building height.');
console.log(JSON.stringify({ source: result.source, neighbours: result.neighbours.length, completeness: result.completenessPercent, uncertainty: result.uncertainty.band }, null, 2));
