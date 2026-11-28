// Shared by gen-outcodes / gen-uk-districts / gen-places. Downloads go through `curl` (node's fetch ignores the sandbox proxy)
// and are cached under RAW_DIR (default: OS temp dir) so reruns stay polite to the free APIs. Raw files are never committed.
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

export const RAW = process.env.RAW_DIR ?? join(tmpdir(), 'pawprint-raw');
mkdirSync(RAW, { recursive: true });
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET `url` with curl, cached as RAW/name. Extra curl args (e.g. POST data) go in `args`. */
export async function curlCached(url, name, args = []) {
  const f = join(RAW, name);
  if (existsSync(f)) return readFileSync(f, 'utf8');
  const { stdout } = await promisify(execFile)('curl', ['-sSf', '-m', '240', ...args, url], { maxBuffer: 1 << 29 });
  writeFileSync(f, stdout);
  return stdout;
}
export const curlCachedSync = (url, name, args = []) => {
  const f = join(RAW, name);
  if (existsSync(f)) return readFileSync(f, 'utf8');
  const out = execFileSync('curl', ['-sSf', '-m', '240', ...args, url], { maxBuffer: 1 << 29 }).toString();
  writeFileSync(f, out);
  return out;
};

// ONS Open Geography Portal (Open Government Licence v3.0)
export const ONS = 'https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services';
export const onsLayer = (layer) =>
  `${ONS}/${layer}/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&geometryPrecision=4&f=geojson`;

// The 12 regions of lib/location.ts: 9 English regions + Scotland, Wales, Northern Ireland (countries).
export const REGION_NAMES = ['North East', 'North West', 'Yorkshire and The Humber', 'East Midlands', 'West Midlands', 'East of England',
  'London', 'South East', 'South West', 'Scotland', 'Wales', 'Northern Ireland'];
export function loadRegions() {
  const feats = ['Regions_December_2025_Boundaries_EN_BUC', 'Countries_December_2025_Boundaries_UK_BUC'].flatMap((layer) =>
    JSON.parse(curlCachedSync(onsLayer(layer), `${layer}.geojson`)).features);
  return REGION_NAMES.map((name) => {
    const f = feats.find((x) => Object.entries(x.properties).some(([k, v]) => /(RGN|CTRY)\d*NM$/.test(k) && v === name));
    return { name, polys: f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates };
  });
}
/** Even-odd point in polygon (all rings of one polygon: holes toggle back out). */
export const inPoly = (rings, x, y) => {
  let c = false;
  for (const p of rings) for (let i = 0, j = p.length - 1; i < p.length; j = i++)
    if ((p[i][1] > y) !== (p[j][1] > y) && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
  return c;
};
/** Region containing (lon,lat); coastal points that miss the generalised polygons get the nearest vertex's region. */
export function regionAt(regions, lon, lat) {
  for (const r of regions) if (r.polys.some((p) => inPoly(p, lon, lat))) return r.name;
  const k = Math.cos((lat * Math.PI) / 180);
  let best = Infinity, name = '';
  for (const r of regions) for (const p of r.polys) for (const q of p[0]) {
    const d = Math.hypot((q[0] - lon) * k, q[1] - lat);
    if (d < best) { best = d; name = r.name; }
  }
  return name;
}
