import { vetQuery, toVets, type OsmElement } from '@/lib/location';

// Public Overpass is rate-limited; point OVERPASS_URL at a mirror if needed.
const OVERPASS = process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter';

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const lat = Number(p.get('lat'));
  const lon = Number(p.get('lon'));
  // UK bounding box: rejects junk before it reaches Overpass.
  if (!(lat >= 49.8 && lat <= 60.9 && lon >= -8.7 && lon <= 1.8)) {
    return Response.json({ error: 'lat and lon must be a point in the UK.' }, { status: 400 });
  }
  try {
    // Rounded to ~100m so nearby postcodes share a cache entry; cached for a week.
    const url = `${OVERPASS}?data=${encodeURIComponent(vetQuery(lat.toFixed(3), lon.toFixed(3)))}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'pawprint-ledger/0.1' }, next: { revalidate: 604800 } });
    if (!res.ok) throw new Error(`Overpass ${res.status}`);
    const { elements } = (await res.json()) as { elements: OsmElement[] };
    return Response.json(toVets(elements, lat, lon));
  } catch (err) {
    console.error('vet search failed', err);
    return Response.json({ error: 'Vet search is unavailable right now. Try again in a minute.' }, { status: 502 });
  }
}
