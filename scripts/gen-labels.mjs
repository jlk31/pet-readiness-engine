// Generates lib/uk-labels.ts: label data for the built-in map. Run: node scripts/gen-labels.mjs (needs `curl`, and `npx mapshaper` at generation time only).
// - COUNTIES: ONS "Counties and Unitary Authorities (December 2025) UK BUC", a label point inside each polygon (mapshaper -points inner), OGL v3.0.
// - SETTLEMENTS: OpenStreetMap place=city|town in GB, and place=village with population >= 3000, via Overpass, ODbL 1.0.
// - DISTRICT_POINTS: a point inside each Local Authority District of lib/uk-districts.ts (same ONS layer), for place search.
// Everything is projected with lib/uk-map.ts (tenths of a path unit, about 110 m).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toXY } from '../lib/uk-map.ts';
import { curlCachedSync, onsLayer } from './data-util.mjs';

const CTYUA = 'Counties_and_Unitary_Authorities_December_2025_Boundaries_UK_BUC';
const LAD = 'Local_Authority_Districts_May_2026_Boundaries_UK_BUC';
const MIN_COUNTY_KM2 = 250; // drops small unitaries (they are towns on the map)
const LARGE_TOWN = 50_000;
const MIN_VILLAGE = 3000;
const HOSTS = [process.env.OVERPASS_URL, 'https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'].filter(Boolean);
const QUERY = '[out:json][timeout:240];area["ISO3166-1"="GB"][admin_level=2]->.a;(nwr["place"~"^(city|town)$"](area.a);node["place"="village"]["population"](area.a););out center tags qt;';
const dir = mkdtempSync(join(tmpdir(), 'uklabels-'));
const t10 = (n) => Math.round(n * 10);
const xy = (lon, lat) => { const p = toXY(lat, lon); return `${t10(p.x)}|${t10(p.y)}`; };
const clean = (s) => String(s ?? '').replace(/[|\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim();
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\bcity of\b|, city of|\bcity\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** One point inside each polygon feature (pole of inaccessibility via mapshaper). */
function innerPoints(layer, name) {
  const gj = JSON.parse(curlCachedSync(onsLayer(layer), `${layer}.geojson`));
  const nk = Object.keys(gj.features[0].properties).find((k) => new RegExp(`^${name}\\d+NM$`).test(k)), ck = nk.replace('NM', 'CD');
  const inp = join(dir, `${name}.geojson`), outp = join(dir, `${name}-pts.geojson`);
  writeFileSync(inp, JSON.stringify({ type: 'FeatureCollection', features: gj.features.map((f) => ({ type: 'Feature', geometry: f.geometry,
    properties: { name: f.properties[nk], code: f.properties[ck], km2: f.properties.Shape__Area / 1e6 } })) }));
  execFileSync('npx', ['--yes', 'mapshaper', inp, '-points', 'inner', '-o', outp, 'format=geojson', 'precision=0.00001'], { stdio: 'ignore' });
  return JSON.parse(readFileSync(outp, 'utf8')).features.map((f) => ({ ...f.properties, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
}

// Settlements first: counties named like a city or town are dropped (the town label says it).
function overpass() {
  for (const h of HOSTS) {
    try {
      const out = curlCachedSync(h, 'overpass_labels.json', ['-m', '200', '--data-urlencode', `data=${QUERY}`]);
      if (out.includes('"elements"')) return JSON.parse(out).elements;
    } catch { console.error(`${h} failed`); }
  }
  throw new Error('no Overpass host answered');
}
const KIND = { city: 0, town: 2, village: 3 };
const raw = overpass().map((e) => ({ ...e, ...(e.center ?? {}) })).filter((e) => e.lat > 49.8 && e.lat < 61 && e.lon > -8.7 && e.lon < 1.9 && e.tags?.name);
const all = raw.map((e) => {
  const t = e.tags, pop = parseInt(String(t.population ?? '').replace(/[^\d]/g, ''), 10) || 0, place = t.place;
  return { name: clean(t['name:en'] || t.name), lat: e.lat, lon: e.lon, pop, k: place === 'town' && pop >= LARGE_TOWN ? 1 : KIND[place] };
}).filter((s) => s.name && (s.k !== 3 || s.pop >= MIN_VILLAGE));
// Rank: city > large town > town > village, then by population. A city drawn twice (node and boundary relation) is kept once.
all.sort((a, b) => a.k - b.k || b.pop - a.pop || a.name.localeCompare(b.name));
const settlements = [];
for (const s of all) if (!settlements.some((q) => q.name === s.name && Math.abs(q.lat - s.lat) < 0.2 && Math.abs(q.lon - s.lon) < 0.3)) settlements.push(s);
const named = new Set(settlements.map((s) => norm(s.name)));

const counties = innerPoints(CTYUA, 'CTYUA').map((c) => ({ ...c, name: c.name.replace(/, County of$/, '') }))
  .filter((c) => !c.code.startsWith('E09') && c.km2 >= MIN_COUNTY_KM2 && !named.has(norm(c.name)))
  .sort((a, b) => b.km2 - a.km2);
const districts = innerPoints(LAD, 'LAD').sort((a, b) => a.name.localeCompare(b.name));

const rows = (list, extra = () => '') => list.map((s) => `${clean(s.name)}|${xy(s.lon, s.lat)}${extra(s)}`).join('\n');
const C = rows(counties), S = rows(settlements, (s) => `|${s.k}`), D = rows(districts);
const out = `// Generated by scripts/gen-labels.mjs. Do not edit by hand.
// Counties and district points: ONS Open Geography Portal, Counties and Unitary Authorities (December 2025) UK BUC and Local Authority Districts (May 2026) UK BUC.
// Licence: Open Government Licence v3.0 (https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/). Contains National Statistics and OS data © Crown copyright and database right 2026.
// Settlements: OpenStreetMap via the Overpass API, ${new Date().toISOString().slice(0, 10)}. © OpenStreetMap contributors, Open Database Licence 1.0 (https://www.openstreetmap.org/copyright).

// One row per label: "name|x|y" (SETTLEMENTS add "|kind"), x and y in tenths of a path unit of lib/uk-map.ts (about 110 m).
const COUNTY_ROWS = ${JSON.stringify(C)}.split('\\n');
const SETTLEMENT_ROWS = ${JSON.stringify(S)}.split('\\n');
const DISTRICT_ROWS = ${JSON.stringify(D)}.split('\\n');

export interface Label { name: string; x: number; y: number }
/** kind 0 city, 1 large town (50,000 or more), 2 town, 3 village (3,000 or more). \`rank\` is the priority: lower wins (kind, then population). */
export interface Settlement extends Label { kind: 0 | 1 | 2 | 3; rank: number }

const cells = (row: string) => row.split('|');
/** Counties and unitary authorities of 250 km2 or more, biggest first, at a point inside each. */
export const COUNTIES: Label[] = COUNTY_ROWS.map((r) => { const [name, x, y] = cells(r); return { name, x: +x / 10, y: +y / 10 }; });
/** Cities and towns of GB and villages of 3,000 or more, in rank order. */
export const SETTLEMENTS: Settlement[] = SETTLEMENT_ROWS.map((r, rank) => { const [name, x, y, kind] = cells(r); return { name, x: +x / 10, y: +y / 10, kind: +kind as Settlement['kind'], rank }; });
/** A point inside each Local Authority District (names as DISTRICTS in uk-districts.ts). */
export const DISTRICT_POINTS: Label[] = DISTRICT_ROWS.map((r) => { const [name, x, y] = cells(r); return { name, x: +x / 10, y: +y / 10 }; });
`;
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'uk-labels.ts'), out);
const kinds = [0, 1, 2, 3].map((k) => settlements.filter((s) => s.k === k).length);
console.log(`${out.length} bytes; counties ${counties.length}, settlements ${settlements.length} (city/large town/town/village ${kinds}), district points ${districts.length}`);
