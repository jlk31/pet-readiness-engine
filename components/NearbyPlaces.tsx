'use client';

import { countyLinks, type NearbyPlace, type PlaceKind } from '@/lib/places';

const FAR_KM = 15;
const web = (u: string) => (/^https?:\/\//i.test(u) ? u : null); // data is from OpenStreetMap, which anyone can edit

export type Nearby = { shelter: NearbyPlace[]; petshop: NearbyPlace[] };
export const placeKey = (p: NearbyPlace) => `${p.name}${p.lat}${p.lon}`;

/**
 * The marker for a place, 30 units across and centred on (0, 0): a house for rescue centres, a circle for pet shops (shape and colour, not colour alone), with its number in the list.
 * Used in the list and, scaled, on the map.
 */
export function PlaceGlyph({ kind, n, selected }: { kind: PlaceKind; n: number; selected?: boolean }) {
  const shelter = kind === 'shelter', shape = shelter ? 'M0 -13L13 -2V12H-13V-2Z' : undefined;
  const common = { fill: shelter ? 'var(--s1)' : 'var(--s3)', stroke: selected ? 'var(--fg)' : 'var(--bg)', strokeWidth: selected ? 3 : 2, strokeLinejoin: 'round' as const };
  return (
    <g>
      {shape ? <path d={shape} {...common} /> : <circle r={12} {...common} />}
      <text y={shelter ? 8 : 5} textAnchor="middle" fontSize={14} fontWeight={700} fill="var(--bg)">{n}</text>
    </g>
  );
}

function PlaceList({ title, places, selected, onSelect }: { title: string; places: NearbyPlace[]; selected: string | null; onSelect: (key: string) => void }) {
  return (
    <div>
      <h3 className="font-bold">{title}</h3>
      <ul className="mt-2 flex flex-col">
        {places.map((p, i) => {
          const url = web(p.link);
          const site = !!p.website && url === p.website;
          const key = placeKey(p);
          return (
            <li key={key} className={`flex min-w-0 flex-col border-t border-line py-1 ${key === selected ? 'bg-[color-mix(in_srgb,var(--fg)_8%,transparent)]' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <button type="button" aria-pressed={key === selected} onClick={() => onSelect(key)}
                  className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2 text-left font-bold underline-offset-4 hover:underline">
                  <svg viewBox="-16 -16 32 32" className="size-7 shrink-0" aria-hidden><PlaceGlyph kind={p.kind} n={i + 1} selected={key === selected} /></svg>
                  <span>{p.name}<span className="sr-only">, number {i + 1}, show on map</span></span>
                </button>
                <span className="whitespace-nowrap py-2.5 tabular-nums text-muted">{p.km.toFixed(1)} km</span>
              </div>
              {p.town && <span className="-mt-2 pl-9 text-muted">{p.town}</span>}
              {url && (
                <a href={url} target="_blank" rel="noopener noreferrer" className="link min-w-0 flex-wrap gap-x-2 pl-9 underline">
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
export default function NearbyPlaces({ found, region, className, selected, onSelect }: { found: Nearby | null; region: string; className: string; selected: string | null; onSelect: (key: string) => void }) {
  const links = found && (found.shelter[0]?.km > FAR_KM || !found.shelter.some((p) => p.website)) ? countyLinks(region) : [];
  return (
    <section className={`${className} flex flex-col gap-4`} aria-labelledby="h-nearby" aria-live="polite">
      <div>
        <h2 id="h-nearby" className="font-display text-2xl font-bold tracking-tight">Rescue centres and pet shops near you</h2>
        {found && <p className="text-sm text-muted">Distances are in a straight line from your spot. Pick one to see it on the map.</p>}
      </div>
      {!found ? (
        <p className="text-muted">Drop a pin or enter a postcode to see the nearest rescue centres and pet shops.</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-4">
            <PlaceList title="Nearest rescue centres" places={found.shelter} selected={selected} onSelect={onSelect} />
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
          <PlaceList title="Nearest pet shops" places={found.petshop} selected={selected} onSelect={onSelect} />
        </div>
      )}
      <p className="text-sm text-muted">Place data &copy; OpenStreetMap contributors (ODbL). Opening hours and stock are not listed, so call ahead.</p>
    </section>
  );
}
