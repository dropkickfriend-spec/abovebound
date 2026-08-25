import fs from 'fs';
import path from 'path';
import { makeSiteContextCacheKey, type GeoJsonFeatureCollection } from '../src/lib/site_context';

const valueFor = (flag: string) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const inputPath = valueFor('--input');
const latitudeDeg = Number(valueFor('--latitude'));
const longitudeDeg = Number(valueFor('--longitude'));
const dataDir = path.resolve(valueFor('--data-dir') || process.env.DATA_DIR || '.');

if (!inputPath || !Number.isFinite(latitudeDeg) || !Number.isFinite(longitudeDeg)) {
  throw new Error('Usage: npm run site-context:import -- --input buildings.geojson --latitude -36.76 --longitude 144.28 [--data-dir ./data]');
}

const sourcePath = path.resolve(inputPath);
const parsed = JSON.parse(fs.readFileSync(sourcePath, 'utf8')) as GeoJsonFeatureCollection;
if (!Array.isArray(parsed.features)) throw new Error('The input must be a GeoJSON FeatureCollection.');
const outputDirectory = path.join(dataDir, 'site-context');
fs.mkdirSync(outputDirectory, { recursive: true });
const key = makeSiteContextCacheKey(latitudeDeg, longitudeDeg);
const outputPath = path.join(outputDirectory, `${key}.geojson`);
fs.writeFileSync(outputPath, `${JSON.stringify(parsed)}\n`, 'utf8');
console.log(JSON.stringify({ outputPath, featureCount: parsed.features.length, cacheKey: key }, null, 2));
