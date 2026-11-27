// Postcodes.io gives `region` for England; Scotland/Wales/NI only have `country`.
export const UK_REGIONS = [
  'London', 'South East', 'South West', 'East of England', 'West Midlands', 'East Midlands',
  'Yorkshire and The Humber', 'North West', 'North East', 'Scotland', 'Wales', 'Northern Ireland',
];

export interface Place { region: string; district: string; lat: number; lon: number }

export async function lookupPostcode(postcode: string): Promise<Place> {
  const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.trim())}`);
  if (res.status === 404) throw new Error('That postcode was not found. Check it and try again.');
  if (!res.ok) throw new Error('Postcode lookup is unavailable right now.');
  const { result } = await res.json();
  return { region: result.region ?? result.country, district: result.admin_district, lat: result.latitude, lon: result.longitude };
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
