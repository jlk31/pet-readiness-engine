'use client';

import { useMemo } from 'react';
import { countyLinks, nearestPlaces, type NearbyPlace } from '@/lib/places';

const FAR_KM = 15;
const web = (u: string) => (/^https?:\/\//i.test(u) ? u : null); // data is from OpenStreetMap, which anyone can edit

function PlaceList({ title, places }: { title: string; places: NearbyPlace[] }) {
  return (
    <div>
      <h3 className="font-bold">{title}</h3>
      <ul className="mt-2 flex flex-col">
        {places.map((p) => {
          const url = web(p.link);
          const site = !!p.website && url === p.website;
          return (
            <li key={`${p.name}${p.lat}${p.lon}`} className="flex min-w-0 flex-col border-t border-line py-3">
              <div className="flex items-start justify-between gap-3">
                <span className="font-bold">{p.name}</span>
                <span className="whitespace-nowrap tabular-nums text-muted">{p.km.toFixed(1)} km</span>
              </div>
              {p.town && <span className="text-muted">{p.town}</span>}
              {url && (
                <a href={url} target="_blank" rel="noopener noreferrer" className="link min-w-0 flex-wrap gap-x-2 underline">
                  {site ? 'Visit website' : 'View on OpenStreetMap'}
                  <span className="sr-only"> for {p.name}</span>
                  {site && <span className="truncate font-normal text-muted" aria-hidden>{new URL(url).hostname.replace(/^www\./, '')}</span>}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Nearest rescue centres and pet shops to a point, from the bundled OpenStreetMap data (works offline). */
export default function NearbyPlaces({ point, region, className }: { point: { lat: number; lon: number } | null; region: string; className: string }) {
  const found = useMemo(() => point && { shelter: nearestPlaces(point.lat, point.lon, 'shelter'), petshop: nearestPlaces(point.lat, point.lon, 'petshop') }, [point]);
  const links = found && (found.shelter[0]?.km > FAR_KM || !found.shelter.some((p) => p.website)) ? countyLinks(region) : [];
  return (
    <section className={`${className} flex flex-col gap-4`} aria-labelledby="h-nearby" aria-live="polite">
      <div>
        <h2 id="h-nearby" className="font-display text-2xl font-bold tracking-tight">Rescue centres and pet shops near you</h2>
        {found && <p className="text-sm text-muted">Distances are in a straight line from your spot.</p>}
      </div>
      {!found ? (
        <p className="text-muted">Drop a pin or enter a postcode to see the nearest rescue centres and pet shops.</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-4">
            <PlaceList title="Nearest rescue centres" places={found.shelter} />
            {links.length > 0 && (
              <div>
                <h3 className="font-bold">Rescue centres serving {region}</h3>
                <ul className="mt-2 flex flex-col">
                  {links.map((l) => (
                    <li key={l.url} className="border-t border-line">
                      <a href={l.url} target="_blank" rel="noopener noreferrer" className="link underline">{l.name}</a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <PlaceList title="Nearest pet shops" places={found.petshop} />
        </div>
      )}
      <p className="text-sm text-muted">Place data &copy; OpenStreetMap contributors (ODbL). Opening hours and stock are not listed, so call ahead.</p>
    </section>
  );
}
