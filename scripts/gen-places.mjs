// Generates lib/places.ts: UK animal shelters and pet shops from OpenStreetMap (Overpass API). Run: node scripts/gen-places.mjs
// Data (c) OpenStreetMap contributors, ODbL (https://www.openstreetmap.org/copyright). Needs `curl`.
// Overpass hosts are tried in turn (OVERPASS_URL first); overpass-api.de resets connections from the sandbox, maps.mail.ru has worked.
// Finder pages are checked with curl at generation time and only those that answer 200 are written.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { curlCachedSync } from './data-util.mjs';

const HOSTS = [process.env.OVERPASS_URL, 'https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'].filter(Boolean);
const GB = '[out:json][timeout:240];area["ISO3166-1"="GB"][admin_level=2]->.a;';
const QUERIES = {
  main: `${GB}(nwr["amenity"="animal_shelter"](area.a);nwr["shop"="pet"](area.a););out center tags;`,
  // Rescue centres of the big charities that aren't tagged animal_shelter (the name filter also hits bus stops etc., so it is narrowed below).
  names: `${GB}nwr["name"~"RSPCA|Dogs Trust|Cats Protection|Blue Cross|Battersea Dogs|SSPCA|Scottish SPCA|USPCA|Wood Green"](area.a);out center tags;`,
};
function overpass(key) {
  for (const h of HOSTS) {
    try {
      const out = curlCachedSync(h, `overpass_${key}.json`, ['-m', '150', '--data-urlencode', `data=${QUERIES[key]}`]);
      if (out.includes('"elements"')) return JSON.parse(out).elements;
    } catch { console.error(`${h} failed for ${key}`); }
  }
  throw new Error(`no Overpass host answered for ${key}`);
}

const clean = (s) => String(s ?? '').replace(/[|\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim();
function site(t) {
  let u = clean(t.website || t['contact:website']).split(';')[0].trim();
  if (!u) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = `https://${u.replace(/^\/+/, '')}`; // "www.x.co.uk" -> https://
  try {
    const url = new URL(u); // OSM is user-edited: only http(s) with a real host, no javascript: URLs
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.')) return '';
    return (url.origin + url.pathname.replace(/\/$/, '') + url.search).replace(/\|/g, '%7C');
  } catch { return ''; }
}
const ANIMAL_OK = /dog|cat|rabbit|pet|rodent|guinea|ferret|mammal|reptile|exotic/i; // animal_shelter=* values that mean pets (not wildlife, horses, farm animals)
const NOT_PETS = /wildlife|hedgehog|horse|donkey|pony|ponies|swan|owl|bat\b|farm/i;
const BIG = /RSPCA|Dogs Trust|Cats Protection|Blue Cross|Battersea Dogs|SSPCA|Scottish SPCA|USPCA|Wood Green/i;

const rows = { shelter: [], petshop: [] };
const seen = new Set();
for (const e of [...overpass('main'), ...overpass('names')]) {
  const t = e.tags ?? {};
  const p = e.center ?? e;
  const key = `${e.type}/${e.id}`;
  if (p.lat == null || seen.has(key)) continue;
  seen.add(key);
  const name = clean(t.name || t.brand || t.operator);
  if (!name) continue;
  let kind;
  if (t.shop === 'pet') kind = 'petshop';
  else if (t.amenity === 'animal_shelter') {
    if (t.animal_shelter ? !ANIMAL_OK.test(t.animal_shelter) : NOT_PETS.test(name)) continue;
    kind = 'shelter';
  } else if (BIG.test(name) && (t.amenity === 'animal_rescue' || ['charity', 'ngo'].includes(t.office)) && !t.shop) kind = 'shelter';
  else continue;
  rows[kind].push({
    name, lat: p.lat.toFixed(4), lon: p.lon.toFixed(4),
    town: clean(t['addr:city'] || t['addr:town'] || t['addr:village'] || t['addr:suburb']),
    postcode: clean(t['addr:postcode']), web: site(t), osm: e.type[0] + e.id, phone: clean(t.phone || t['contact:phone']),
  });
}
// Nodes and ways of the same premises: keep one (prefer the one with a website) per name within ~0.003 deg.
for (const k of Object.keys(rows)) {
  const kept = [];
  for (const r of rows[k].sort((a, b) => (b.web ? 1 : 0) - (a.web ? 1 : 0) || a.osm.localeCompare(b.osm)))
    if (!kept.some((q) => q.name === r.name && Math.abs(q.lat - r.lat) < 0.003 && Math.abs(q.lon - r.lon) < 0.003)) kept.push(r);
  rows[k] = kept.sort((a, b) => a.name.localeCompare(b.name) || a.osm.localeCompare(b.osm));
}
const encode = (list, phone, maxName) => list.map((r) => [r.name.slice(0, maxName), r.lat, r.lon, r.town, r.postcode, r.web, r.osm, phone ? r.phone : ''].join('|')).join('\n');
let phone = true, maxName = 200, S = encode(rows.shelter, phone, maxName), P = encode(rows.petshop, phone, maxName);
if (S.length + P.length > 400_000) { phone = false; S = encode(rows.shelter, phone, maxName); P = encode(rows.petshop, phone, maxName); }
if (S.length + P.length > 400_000) { maxName = 40; S = encode(rows.shelter, phone, maxName); P = encode(rows.petshop, phone, maxName); }

// National finder pages for places with no close website. Checked now; unreachable ones are left out.
const ALL = ['London', 'South East', 'South West', 'East of England', 'West Midlands', 'East Midlands', 'Yorkshire and The Humber', 'North West', 'North East', 'Scotland', 'Wales', 'Northern Ireland'];
const FINDERS = [
  { name: 'Battersea rehoming', url: 'https://www.battersea.org.uk/rehoming', regions: ['London', 'South East'] },
  { name: 'Scottish SPCA', url: 'https://www.scottishspca.org/', regions: ['Scotland'] },
  { name: 'USPCA adopt a pet', url: 'https://uspca.co.uk/adopt-a-pet', regions: ['Northern Ireland'] },
  { name: 'RSPCA find a pet', url: 'https://www.rspca.org.uk/findapet', regions: ALL.filter((r) => r !== 'Scotland' && r !== 'Northern Ireland') },
  { name: 'Dogs Trust rehoming', url: 'https://www.dogstrust.org.uk/rehoming/dogs', regions: ALL },
  { name: 'Cats Protection adopt a cat', url: 'https://www.cats.org.uk/adopt-a-cat', regions: ALL },
  { name: 'Blue Cross rehoming', url: 'https://www.bluecross.org.uk/rehome-a-pet', regions: ALL }, // 403 to curl from the sandbox, so normally dropped here
].filter((f) => {
  const code = execFileSync('curl', ['-s', '-o', '/dev/null', '-L', '-m', '30', '-w', '%{http_code}', f.url]).toString();
  if (code !== '200') console.error(`dropped ${f.url} (${code})`);
  return code === '200';
});

const out = `// Generated by scripts/gen-places.mjs. Do not edit by hand.
// Source: OpenStreetMap via the Overpass API, ${new Date().toISOString().slice(0, 10)}. © OpenStreetMap contributors, Open Database Licence 1.0 (https://www.openstreetmap.org/copyright).
import { distanceKm } from './location.ts';

// One row per place: "name|lat|lon|town|postcode|website|osm id (n/w/r + number)|phone". Named places only, 4 decimals.
const SHELTERS = ${JSON.stringify(S)}.split('\\n');
const PETSHOPS = ${JSON.stringify(P)}.split('\\n');

/** National finder pages (each answered HTTP 200 when generated). */
const FINDERS: { name: string; url: string; regions: string[] }[] = ${JSON.stringify(FINDERS)};

export type PlaceKind = 'shelter' | 'petshop';
export interface NearbyPlace { kind: PlaceKind; name: string; lat: number; lon: number; km: number; town?: string; postcode?: string; website?: string; phone?: string; link: string }

const OSM_TYPE: Record<string, string> = { n: 'node', w: 'way', r: 'relation' };
const rows = { shelter: SHELTERS, petshop: PETSHOPS };
export const PLACE_COUNTS = { shelter: SHELTERS.length, petshop: PETSHOPS.length };

/** Nearest places of one kind, closest first. \`link\` is the website, else the OpenStreetMap page (always http or https). */
export function nearestPlaces(lat: number, lon: number, kind: PlaceKind, n = 3): NearbyPlace[] {
  return rows[kind]
    .map((row) => {
      const [name, la, lo, town, postcode, website, osm, phone] = row.split('|');
      const p = { kind, name, lat: +la, lon: +lo, km: 0, town: town || undefined, postcode: postcode || undefined, website: website || undefined, phone: phone || undefined,
        link: website || \`https://www.openstreetmap.org/\${OSM_TYPE[osm[0]]}/\${osm.slice(1)}\` };
      p.km = distanceKm(lat, lon, p.lat, p.lon);
      return p;
    })
    .sort((a, b) => a.km - b.km)
    .slice(0, n);
}

/** Up to 3 reputable national rehoming finders for a region (names as UK_REGIONS), for when nothing close has a website. */
export const countyLinks = (region: string) => FINDERS.filter((f) => f.regions.includes(region)).slice(0, 3).map(({ name, url }) => ({ name, url }));
`;
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'places.ts'), out);
const web = (l) => l.filter((r) => r.web).length;
console.log(`${out.length} bytes; shelters ${rows.shelter.length} (${web(rows.shelter)} with website), pet shops ${rows.petshop.length} (${web(rows.petshop)} with website); phones ${phone}; finders ${FINDERS.map((f) => f.name)}`);
