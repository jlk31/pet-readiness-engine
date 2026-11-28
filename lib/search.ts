// Offline place search for the map: settlements, counties, council districts and postcode districts. Pure ranking plus the data glue.
import { lookupOutcode } from './outcodes.ts';
import { COUNTIES, DISTRICT_POINTS, SETTLEMENTS } from './uk-labels.ts';
import { DISTRICTS } from './uk-districts.ts';
import { toLatLon, toXY } from './uk-map.ts';

/** Lower case, accents and punctuation removed, single spaces: "Llanelli" and "Llanélli" match, "St. Ives" is "st ives". */
export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** The items whose key starts with the query, then those with a word that does, then those that contain it. Input order (priority) kept within each group. */
export function rankMatches<T>(query: string, items: readonly T[], keyOf: (t: T) => string, limit = 8): T[] {
  const q = fold(query);
  if (q.length < 2) return [];
  const tiers: T[][] = [[], [], []];
  for (const it of items) {
    const k = keyOf(it), i = k.indexOf(q);
    if (i < 0) continue;
    const t = tiers[i === 0 ? 0 : k[i - 1] === ' ' ? 1 : 2];
    if (tiers[0].length + tiers[1].length + tiers[2].length < limit * 4) t.push(it); // enough to fill the list whatever the tier
  }
  return [...tiers[0], ...tiers[1], ...tiers[2]].slice(0, limit);
}

export type Kind = 'city' | 'large town' | 'town' | 'village' | 'county' | 'council area' | 'postcode district';
export interface Result { id: string; name: string; kind: Kind; x: number; y: number; zoom: number; detail?: string }
const KINDS: Kind[] = ['city', 'large town', 'town', 'village'];
const ZOOM: Record<Kind, number> = { city: 9, 'large town': 10, town: 10, village: 12, county: 5, 'council area': 7, 'postcode district': 11 };

interface Entry extends Result { key: string }
let entries: Entry[] | undefined;
function all(): Entry[] {
  if (entries) return entries;
  const counties = new Set(COUNTIES.map((c) => fold(c.name)));
  const region = new Map(DISTRICTS.map((d) => [d.name, d.region]));
  const mk = (name: string, kind: Kind, x: number, y: number, detail?: string): Entry => ({ id: `${kind}:${name}:${x}:${y}`, key: fold(name), name, kind, x, y, zoom: ZOOM[kind], detail });
  return (entries = [
    ...SETTLEMENTS.map((s) => mk(s.name, KINDS[s.kind], s.x, s.y)),
    ...COUNTIES.map((c) => mk(c.name, 'county', c.x, c.y)),
    // Westmorland and Furness is both a county and a council area on the map: list it once, as the county.
    ...DISTRICT_POINTS.filter((d) => !counties.has(fold(d.name))).map((d) => mk(d.name, 'council area', d.x, d.y, region.get(d.name))),
  ]);
}

/** Postcode districts that start with the text ("m1" gives M1, M10, M11...; a full postcode gives its district). Only exact lookups are possible, so try the likely endings. */
function outcodes(text: string): Result[] {
  const raw = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!raw || (raw.length > 4 && !/\d[A-Z]{2}$/.test(raw))) return [];
  const digits = [...'0123456789'], letters = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
  const tails = /\d$/.test(raw) ? ['', ...digits, ...letters] : /^[A-Z]{1,2}$/.test(raw) ? [...digits, ...digits.flatMap((a) => digits.map((b) => a + b))] : [''];
  const seen = new Set<string>(), out: Result[] = [];
  for (const t of tails) {
    const o = lookupOutcode(raw + t);
    if (!o || seen.has(o.outcode)) continue;
    seen.add(o.outcode);
    const { x, y } = toXY(o.lat, o.lon);
    out.push({ id: `postcode:${o.outcode}`, name: o.outcode, kind: 'postcode district', x, y, zoom: ZOOM['postcode district'], detail: `${o.district}, ${o.region}` });
  }
  return out.sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name));
}

/** Up to `limit` matches for what the person typed. With a digit in it, postcode districts come first. */
export function searchPlaces(query: string, limit = 8): Result[] {
  const codes = outcodes(query).slice(0, limit);
  const named = rankMatches(query, all(), (e) => e.key, limit).map(({ key: _k, ...r }) => r);
  return (/\d/.test(query) ? [...codes, ...named] : [...named, ...codes]).slice(0, limit);
}

export const latLonOf = (r: { x: number; y: number }) => toLatLon(r.x, r.y);
