// Postcodes.io gives `region` for England; Scotland/Wales/NI only have `country`.
export const UK_REGIONS = [
  'London', 'South East', 'South West', 'East of England', 'West Midlands', 'East Midlands',
  'Yorkshire and The Humber', 'North West', 'North East', 'Scotland', 'Wales', 'Northern Ireland',
];

export interface Place { postcode: string; region: string; district: string; lat: number; lon: number }

interface PostcodesIoResult { postcode: string; region: string | null; country: string; admin_district: string | null; latitude: number; longitude: number }

/** Postcodes.io result -> Place. `at` keeps a precise point instead of the postcode centroid. A null result means no UK postcode there. */
export function toPlace(r: PostcodesIoResult | null | undefined, at?: { lat: number; lon: number }): Place {
  if (!r) throw new Error('That spot is outside the UK. Pick a point inside the UK.');
  return { postcode: r.postcode, region: r.region ?? r.country, district: r.admin_district ?? '', lat: at?.lat ?? r.latitude, lon: at?.lon ?? r.longitude };
}

export async function lookupPostcode(postcode: string): Promise<Place> {
  const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.trim())}`);
  if (res.status === 404) throw new Error('That postcode was not found. Check it and try again.');
  if (!res.ok) throw new Error('Postcode lookup is unavailable right now.');
  return toPlace((await res.json()).result);
}

/** Nearest postcode to a map point (2 km search; the default 100 m misses rural spots). */
export async function lookupPoint(lat: number, lon: number): Promise<Place> {
  const res = await fetch(`https://api.postcodes.io/postcodes?lon=${lon}&lat=${lat}&limit=1&radius=2000`);
  if (!res.ok) throw new Error('Postcode lookup is unavailable right now.');
  return toPlace((await res.json()).result?.[0], { lat, lon });
}

export interface Vet {
  id: string; // OSM "node/123" or "way/456"
  name: string;
  km: number;
  emergency: boolean;
  phone?: string;
  address?: string;
  website?: string;
}

export interface OsmElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export const vetQuery = (lat: string, lon: string, radiusM = 10000) =>
  `[out:json][timeout:20];nwr["amenity"="veterinary"](around:${radiusM},${lat},${lon});out center tags;`;

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/** Overpass elements -> nearest vets. Ways/relations (practice buildings) carry a `center`. */
export function toVets(elements: OsmElement[], lat: number, lon: number, limit = 8): Vet[] {
  return elements
    .flatMap((e) => {
      const p = e.center ?? (e.lat != null && e.lon != null ? { lat: e.lat, lon: e.lon } : null);
      if (!p) return [];
      const t = e.tags ?? {};
      const address = [t['addr:housenumber'], t['addr:street'], t['addr:city'], t['addr:postcode']].filter(Boolean).join(' ');
      const website = t.website ?? t['contact:website'];
      return [{
        id: `${e.type}/${e.id}`,
        name: t.name ?? 'Unnamed vet practice',
        km: distanceKm(lat, lon, p.lat, p.lon),
        emergency: t.emergency === 'yes' || t.opening_hours === '24/7',
        phone: t.phone ?? t['contact:phone'],
        address: address || undefined,
        website: website && /^https?:\/\//i.test(website) ? website : undefined, // OSM is user-edited: no javascript: URLs
      }];
    })
    .sort((a, b) => a.km - b.km)
    .slice(0, limit);
}
