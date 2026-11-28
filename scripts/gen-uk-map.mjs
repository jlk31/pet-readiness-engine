// Generates lib/uk-map.ts: simplified UK region outlines as SVG path data. Run: node scripts/gen-uk-map.mjs
// Source: ONS Open Geography Portal, "Regions (December 2025) Boundaries EN BUC" (9 English regions) and
// "Countries (December 2025) Boundaries UK BUC" (Scotland, Wales, Northern Ireland), ultra-generalised.
// Licence: Open Government Licence v3.0. Contains National Statistics and OS data (c) Crown copyright and database right 2026.
// Needs `curl` (node's fetch ignores the sandbox proxy) and, at generation time only, `npx mapshaper` (not a dependency).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVICES = 'https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services';
const LAYERS = ['Regions_December_2025_Boundaries_EN_BUC', 'Countries_December_2025_Boundaries_UK_BUC'];
const KEEP = ['North East', 'North West', 'Yorkshire and The Humber', 'East Midlands', 'West Midlands', 'East of England',
  'London', 'South East', 'South West', 'Scotland', 'Wales', 'Northern Ireland']; // England (country) is dropped: the regions cover it
const TOLERANCE_M = 500; // Douglas-Peucker tolerance in metres (mapshaper, topology-preserving: shared borders stay shared)
const MIN_ISLAND_KM2 = 300; // drop specks that vanish at card size; keeps Skye, Lewis, Mull, Islay, Arran, Orkney and Shetland mainlands, Isle of Wight, Anglesey
const S = 100; // path units per degree of latitude
const LAT0 = 54.5; // equirectangular standard parallel: x = lon * cos(LAT0) * S, y = -lat * S
const K = Math.cos((LAT0 * Math.PI) / 180);

const dir = mkdtempSync(join(tmpdir(), 'ukmap-'));
const features = LAYERS.flatMap((layer, i) => {
  const url = `${SERVICES}/${layer}/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&geometryPrecision=4&f=geojson`;
  const gj = JSON.parse(execFileSync('curl', ['-sSf', '-m', '120', url], { maxBuffer: 1 << 26 }));
  return gj.features.map((f) => ({
    type: 'Feature', properties: { name: Object.entries(f.properties).find(([k]) => /(RGN|CTRY)\d*NM$/.test(k))[1] }, geometry: f.geometry,
  }));
}).filter((f) => KEEP.includes(f.properties.name));
if (features.length !== KEEP.length) throw new Error(`expected ${KEEP.length} areas, got ${features.map((f) => f.properties.name)}`);
writeFileSync(join(dir, 'in.geojson'), JSON.stringify({ type: 'FeatureCollection', features }));
execFileSync('npx', ['--yes', 'mapshaper', join(dir, 'in.geojson'), '-filter-islands', `min-area=${MIN_ISLAND_KM2}km2`,
  '-simplify', 'dp', `interval=${TOLERANCE_M}`, '-o', join(dir, 'out.geojson'), 'format=geojson', 'precision=0.0001'], { stdio: 'ignore' });
const simple = JSON.parse(readFileSync(join(dir, 'out.geojson'), 'utf8')).features;

// Bounds, with a little sea around the edge.
const pts = simple.flatMap((f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).flat(2));
const lon0 = Math.floor(Math.min(...pts.map((p) => p[0])) * 4) / 4 - 0.25;
const lat1 = Math.ceil(Math.max(...pts.map((p) => p[1])) * 4) / 4 + 0.25;
const W = Math.ceil((Math.max(...pts.map((p) => p[0])) + 0.25 - lon0) * K * S);
const H = Math.ceil((lat1 - Math.floor(Math.min(...pts.map((p) => p[1])) * 4) / 4 + 0.25) * S);
const xy = ([lon, lat]) => [Math.round((lon - lon0) * K * S), Math.round((lat1 - lat) * S)];

// Relative path data from rounded absolute coordinates (no drift); "l" repeats implicitly.
const num = (n, first) => (first || n < 0 ? '' : ' ') + n;
function ring(r) {
  const p = r.slice(0, -1).map(xy).filter((q, i, a) => i === 0 || q[0] !== a[i - 1][0] || q[1] !== a[i - 1][1]);
  if (p.length < 3) return '';
  let d = `M${p[0][0]} ${p[0][1]}l`, first = true;
  for (let i = 1; i < p.length; i++) for (let j = 0; j < 2; j++) { d += num(p[i][j] - p[i - 1][j], first); first = false; }
  return d + 'z';
}
const area = (p) => Math.abs(p.reduce((s, q, i) => s + (q[0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * q[1]), 0) / 2);

// Label point: the spot inside the biggest polygon furthest from any edge (so it sits inside concave regions).
function inside(p, x, y) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > y) !== (p[j][1] > y) && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
  return c;
}
function segDist(x, y, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
}
function labelPoint(p) {
  const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
  let best = [p[0][0], p[0][1]], bd = -1;
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += 2) for (let y = Math.min(...ys); y <= Math.max(...ys); y += 2) {
    if (!inside(p, x, y)) continue;
    const d = Math.min(...p.map((q, i) => segDist(x, y, q, p[(i + 1) % p.length])));
    if (d > bd) { bd = d; best = [x, y]; }
  }
  return best;
}

const regions = KEEP.map((name) => {
  const g = simple.find((f) => f.properties.name === name).geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const biggest = polys.map((poly) => poly[0].slice(0, -1).map(xy)).sort((a, b) => area(b) - area(a))[0];
  return { name, d: polys.map((poly) => poly.map(ring).join('')).join(''), c: labelPoint(biggest) };
});

const out = `// Generated by scripts/gen-uk-map.mjs. Do not edit by hand.
// Source: ONS Open Geography Portal, Regions (December 2025) EN BUC and Countries (December 2025) UK BUC, simplified.
// Licence: Open Government Licence v3.0 (https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
// Contains National Statistics and OS data © Crown copyright and database right 2026.

/** SVG viewBox size and the projection constants (equirectangular, x scaled by cos 54.5°). */
export const VIEW = { w: ${W}, h: ${H} };
const S = ${S}, K = ${K}, LON0 = ${lon0}, LAT1 = ${lat1};

/** Names match UK_REGIONS in lib/location.ts. \`c\` is a label point inside the region, in path units. */
export const REGIONS: { name: string; d: string; c: [number, number] }[] = ${JSON.stringify(regions)};

export const toXY = (lat: number, lon: number) => ({ x: (lon - LON0) * K * S, y: (LAT1 - lat) * S });
export const toLatLon = (x: number, y: number) => ({ lat: LAT1 - y / S, lon: LON0 + x / (K * S) });
`;
const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'uk-map.ts');
writeFileSync(file, out);
console.log(`${file} ${out.length} bytes, viewBox ${W}x${H}`);
