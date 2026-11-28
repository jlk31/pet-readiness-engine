'use client';

import { useRef, useState } from 'react';
import { REGIONS, toLatLon, toXY, VIEW } from '@/lib/uk-map';

interface Props {
  region: string;
  point: { lat: number; lon: number } | null;
  /** A region was clicked (exact point) or chosen by keyboard (its label point). */
  onPick: (region: string, lat: number, lon: number) => void;
}

const MAX_H = 480;
const ARROWS: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
// Regions have their own fill and border tokens so they stand clear of the page in both themes; the chosen one is also drawn with a heavier outline.
const FILL = 'fill-(--map-fill) stroke-(--map-line) hover:fill-[color-mix(in_srgb,var(--accent)_30%,var(--map-fill))] aria-checked:fill-accent aria-checked:stroke-fg aria-checked:[stroke-width:2.5] aria-checked:hover:fill-accent';

/** Offline UK map: inline SVG, no external requests, themed by the colour tokens. */
export default function RegionMap({ region, point, onPick }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const pin = point && toXY(point.lat, point.lon);

  function pick(name: string, x: number, y: number) {
    const { lat, lon } = toLatLon(x, y);
    onPick(name, lat, lon);
  }

  function onKey(e: React.KeyboardEvent<SVGPathElement>, i: number) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick(REGIONS[i].name, ...REGIONS[i].c);
    } else if (ARROWS[e.key]) {
      e.preventDefault();
      // Nearest label point in the arrow's direction; sideways drift counts double.
      const [dx, dy] = ARROWS[e.key], [cx, cy] = REGIONS[i].c;
      let best = -1, bs = Infinity;
      REGIONS.forEach(({ c }, j) => {
        const along = (c[0] - cx) * dx + (c[1] - cy) * dy, across = Math.abs((c[0] - cx) * dy - (c[1] - cy) * dx);
        if (j !== i && along > 0 && along + 2 * across < bs) { bs = along + 2 * across; best = j; }
      });
      if (best >= 0) svg.current?.querySelectorAll<SVGPathElement>('[role=radio]')[best].focus();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative mx-auto w-full" style={{ aspectRatio: `${VIEW.w}/${VIEW.h}`, maxWidth: (MAX_H * VIEW.w) / VIEW.h }}>
        <svg ref={svg} viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} role="radiogroup" aria-label="Choose your region on the map"
          className="size-full touch-manipulation select-none">
          {REGIONS.map((r, i) => (
            <path key={r.name} d={r.d} fillRule="evenodd" role="radio" tabIndex={0} aria-label={r.name} aria-checked={r.name === region}
              strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ outline: 'none' }}
              strokeWidth={1.25} className={`cursor-pointer ${FILL}`}
              onClick={(e) => {
                const b = svg.current!.getBoundingClientRect();
                pick(r.name, ((e.clientX - b.left) / b.width) * VIEW.w, ((e.clientY - b.top) / b.height) * VIEW.h);
              }}
              onKeyDown={(e) => onKey(e, i)}
              onFocus={(e) => setFocus(e.currentTarget.matches(':focus-visible') ? r.name : null)}
              onBlur={() => setFocus(null)} />
          ))}
          {/* Focus ring: a copy of the outline on top, so neighbours cannot cover it. */}
          {REGIONS.filter((r) => r.name === focus).map((r) => (
            <path key="ring" d={r.d} fillRule="evenodd" fill="none" pointerEvents="none" vectorEffect="non-scaling-stroke"
              strokeLinejoin="round" className="stroke-fg" strokeWidth={3} />
          ))}
        </svg>
        {pin && (
          <span aria-hidden className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-fg shadow-[0_0_0_1px_var(--fg)]"
            style={{ left: `${(pin.x / VIEW.w) * 100}%`, top: `${(pin.y / VIEW.h) * 100}%` }} />
        )}
      </div>
      <p className="text-sm text-muted">Tap your area on the map, or type a postcode above. Chosen: <strong className="text-fg">{region}</strong>.</p>
    </div>
  );
}
