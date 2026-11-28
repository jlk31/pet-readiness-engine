'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { panViewBox, parseCoords, viewAt, zoomOf, zoomViewBox, type View } from '@/lib/map-view';
import { DISTRICTS, districtAt } from '@/lib/uk-districts';
import { REGIONS, toLatLon, toXY, VIEW } from '@/lib/uk-map';

interface Props {
  region: string;
  point: { lat: number; lon: number } | null;
  /** Say "Area centre" instead of "Your exact spot" when the point is a postcode district centre. */
  approx?: boolean;
  /** A region was chosen: a tap or typed point (exact), or a region by keyboard (its label point). */
  onPick: (region: string, lat: number, lon: number) => void;
}

// The map box is 4:5; zoom 1x shows the whole UK, which is taller than that, so the sides are sea.
const AR = 0.8;
const BOUNDS: View = { x: (VIEW.w - VIEW.h * AR) / 2, y: 0, w: VIEW.h * AR, h: VIEW.h };
const FLY_ZOOM = 16; // typed, located and looked-up points show at least this much zoom (about 80 km across)
const DISTRICTS_FROM = 2.5;
const TAP_PX = 6;
const ARROWS: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
// Regions have their own fill and border tokens so they stand clear of the page in both themes; the chosen one is also drawn with a heavier outline.
const FILL = 'cursor-crosshair fill-(--map-fill) stroke-(--map-line) hover:fill-[color-mix(in_srgb,var(--accent)_30%,var(--map-fill))] aria-checked:stroke-fg aria-checked:[stroke-width:2.5]';
const CHOSEN = 'aria-checked:fill-accent aria-checked:hover:fill-accent';
const CHOSEN_ZOOMED = 'aria-checked:fill-[color-mix(in_srgb,var(--accent)_22%,var(--map-fill))] aria-checked:hover:fill-[color-mix(in_srgb,var(--accent)_22%,var(--map-fill))]';
const MAP_BTN = 'btn-ghost size-11 bg-surface p-0 text-xl';

// Council borders: hairlines only, no pointer events, redrawn only when their opacity step changes.
const Districts = memo(function Districts({ opacity }: { opacity: number }) {
  return (
    <g fill="none" pointerEvents="none" strokeLinejoin="round" strokeWidth={0.75} className="stroke-(--map-line)" style={{ opacity }}>
      {DISTRICTS.map((d, i) => <path key={i} d={d.d} fillRule="evenodd" vectorEffect="non-scaling-stroke" />)}
    </g>
  );
});

const fmt = (p: { lat: number; lon: number }) => `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`;

/** Offline UK map: inline SVG, no external requests, themed by the colour tokens. Zoom and pan change the viewBox only. */
export default function RegionMap({ region, point, approx, onPick }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>(BOUNDS);
  const [focus, setFocus] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [coords, setCoords] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [canLocate, setCanLocate] = useState(false);
  const [locating, setLocating] = useState(false);
  const viewRef = useRef(view);
  viewRef.current = view;
  const own = useRef<{ lat: number; lon: number } | null>(null); // the point this map just dropped, so the sync effect does not re-centre on it
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ sx: number; sy: number; v: View; moved: boolean; pinch?: { d: number; mx: number; my: number } } | null>(null);

  const zoom = zoomOf(view, BOUNDS);
  const pin = point && toXY(point.lat, point.lon);
  const spot = useMemo(() => (point ? districtAt(point.lat, point.lon) : null), [point]);
  const spotPath = spot && DISTRICTS.find((d) => d.name === spot.name && d.region === spot.region)?.d;
  const opacity = Math.round(Math.min(1, Math.max(0, (zoom - DISTRICTS_FROM) / 2)) * 10) / 10;
  const zoomed = zoom >= DISTRICTS_FROM;

  // Hide "Use my location" where the browser has none or the person has blocked it. Never asks on load.
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    setCanLocate(true);
    navigator.permissions?.query({ name: 'geolocation' }).then((s) => {
      const sync = () => setCanLocate(s.state !== 'denied');
      sync();
      s.onchange = sync;
    }).catch(() => {});
  }, []);

  // Wheel and trackpad pinch zoom around the cursor. React's onWheel is passive, so this is a native listener.
  useEffect(() => {
    const el = svg.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const px = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const factor = Math.exp(-e.deltaY * px * (e.ctrlKey ? 0.01 : 0.0015));
      setView((v) => zoomViewBox(v, factor, v.x + ((e.clientX - r.left) / r.width) * v.w, v.y + ((e.clientY - r.top) / r.height) * v.h, BOUNDS));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  function flyTo(lat: number, lon: number, atLeast: number) {
    const { x, y } = toXY(lat, lon);
    setView((v) => viewAt(x, y, Math.max(zoomOf(v, BOUNDS), atLeast), BOUNDS));
  }

  // A point that did not come from this map (postcode lookup) gets shown.
  useEffect(() => {
    if (!point) return;
    const o = own.current;
    own.current = null;
    if (!o || o.lat !== point.lat || o.lon !== point.lon) flyTo(point.lat, point.lon, FLY_ZOOM);
  }, [point]);

  /** Drop the pin if the spot is in the UK. */
  function drop(lat: number, lon: number, tappedRegion?: string) {
    const r = districtAt(lat, lon)?.region ?? tappedRegion;
    if (!r) { setMsg('That spot is outside the UK. Pick a spot on land.'); return false; }
    setMsg(null);
    own.current = { lat, lon };
    onPick(r, lat, lon);
    return true;
  }

  function zoomBy(factor: number) {
    setView((v) => zoomViewBox(v, factor, v.x + v.w / 2, v.y + v.h / 2, BOUNDS));
  }

  function pickRegion(i: number) {
    const [x, y] = REGIONS[i].c, { lat, lon } = toLatLon(x, y);
    setMsg(null);
    onPick(REGIONS[i].name, lat, lon);
    setView((v) => viewAt(x, y, zoomOf(v, BOUNDS), BOUNDS));
  }

  function onRegionKey(e: React.KeyboardEvent<SVGPathElement>, i: number) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pickRegion(i);
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

  // Keys on the map itself (not on a region radio inside it).
  function onMapKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    const v = viewRef.current;
    if (ARROWS[e.key]) {
      e.preventDefault();
      setView(panViewBox(v, ARROWS[e.key][0] * v.w * 0.2, ARROWS[e.key][1] * v.h * 0.2, BOUNDS));
    } else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomBy(2); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomBy(0.5); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const { lat, lon } = toLatLon(v.x + v.w / 2, v.y + v.h / 2);
      drop(lat, lon);
    }
  }

  function tap(e: React.PointerEvent) {
    const r = svg.current!.getBoundingClientRect(), v = viewRef.current;
    const { lat, lon } = toLatLon(v.x + ((e.clientX - r.left) / r.width) * v.w, v.y + ((e.clientY - r.top) / r.height) * v.h);
    drop(lat, lon, (e.target as Element).closest('[data-region]')?.getAttribute('data-region') ?? undefined);
  }

  function onDown(e: React.PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 1) gesture.current = { sx: e.clientX, sy: e.clientY, v: viewRef.current, moved: false };
    else if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      gesture.current = { sx: 0, sy: 0, v: viewRef.current, moved: true, pinch: { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 } };
    }
  }

  function onMove(e: React.PointerEvent) {
    const p = ptrs.current.get(e.pointerId), g = gesture.current;
    if (!p || !g) return;
    p.x = e.clientX; p.y = e.clientY;
    const r = svg.current!.getBoundingClientRect(), upp = g.v.w / r.width;
    if (g.pinch) {
      if (ptrs.current.size < 2) return;
      // Zoom about where the fingers started, then follow their midpoint.
      const [a, b] = [...ptrs.current.values()], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const z = zoomViewBox(g.v, Math.hypot(a.x - b.x, a.y - b.y) / g.pinch.d, g.v.x + (g.pinch.mx - r.left) * upp, g.v.y + (g.pinch.my - r.top) * upp, BOUNDS);
      setView(panViewBox(z, -(mx - g.pinch.mx) * (z.w / r.width), -(my - g.pinch.my) * (z.w / r.width), BOUNDS));
      return;
    }
    const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
    if (!g.moved && Math.hypot(dx, dy) > TAP_PX) { g.moved = true; svg.current!.setPointerCapture(e.pointerId); }
    if (g.moved) setView(panViewBox(g.v, -dx * upp, -dy * upp, BOUNDS));
  }

  function onUp(e: React.PointerEvent) {
    const g = gesture.current;
    if (!ptrs.current.delete(e.pointerId) || !g) return;
    if (ptrs.current.size === 0) {
      gesture.current = null;
      if (!g.moved && e.type === 'pointerup') tap(e);
    } else {
      const [rest] = [...ptrs.current.values()]; // one finger left after a pinch: carry on as a drag
      gesture.current = { sx: rest.x, sy: rest.y, v: viewRef.current, moved: true };
    }
  }

  function goToCoords(e: React.FormEvent) {
    e.preventDefault();
    const c = parseCoords(coords);
    if (!c) { setMsg('Enter latitude and longitude inside the UK, like 54.5, -3.1.'); return; }
    if (drop(c.lat, c.lon)) flyTo(c.lat, c.lon, FLY_ZOOM);
  }

  function locate() {
    setMsg(null);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords: c }) => { setLocating(false); if (drop(c.latitude, c.longitude)) flyTo(c.latitude, c.longitude, FLY_ZOOM); },
      (err) => {
        setLocating(false);
        if (err.code === err.PERMISSION_DENIED) setCanLocate(false);
        setMsg(`${err.code === err.PERMISSION_DENIED ? 'Location is blocked for this site.' : 'Your location could not be found.'} Tap the map or enter coordinates instead.`);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function copy() {
    if (!point) return;
    try { await navigator.clipboard.writeText(fmt(point)); setCopied('Copied'); }
    catch { setCopied('Copy failed'); }
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="flex flex-col gap-3">
      <div role="group" tabIndex={0} onKeyDown={onMapKey}
        aria-label="UK map. Arrow keys move the map, plus and minus zoom, Enter drops a pin at the centre."
        className="relative mx-auto w-full touch-none select-none overflow-hidden rounded-card bg-bg ring-1 ring-edge"
        style={{ aspectRatio: `${BOUNDS.w}/${BOUNDS.h}`, maxWidth: `min(100%, ${AR * 70}svh)` }}>
        <svg ref={svg} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} role="radiogroup" aria-label="Choose your region on the map"
          className="size-full touch-none" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          {REGIONS.map((r, i) => (
            <path key={r.name} d={r.d} data-region={r.name} fillRule="evenodd" role="radio" tabIndex={0} aria-label={r.name} aria-checked={r.name === region}
              strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ outline: 'none' }}
              strokeWidth={1.25} className={`${FILL} ${zoomed ? CHOSEN_ZOOMED : CHOSEN}`}
              onClick={(e) => { if (e.detail === 0) pickRegion(i); }} // screen readers click without a pointer; real taps go through onPointerUp
              onKeyDown={(e) => onRegionKey(e, i)}
              onFocus={(e) => setFocus(e.currentTarget.matches(':focus-visible') ? r.name : null)}
              onBlur={() => setFocus(null)} />
          ))}
          {opacity > 0 && <Districts opacity={opacity} />}
          {spotPath && zoomed && (
            <path d={spotPath} fillRule="evenodd" pointerEvents="none" vectorEffect="non-scaling-stroke" strokeLinejoin="round"
              className="fill-[color-mix(in_srgb,var(--accent)_28%,transparent)] stroke-fg" strokeWidth={2} />
          )}
          {/* Focus ring: a copy of the outline on top, so neighbours cannot cover it. */}
          {REGIONS.filter((r) => r.name === focus).map((r) => (
            <path key="ring" d={r.d} fillRule="evenodd" fill="none" pointerEvents="none" vectorEffect="non-scaling-stroke"
              strokeLinejoin="round" className="stroke-fg" strokeWidth={3} />
          ))}
        </svg>
        {pin && (
          <>
            <span aria-hidden className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-fg shadow-[0_0_0_1px_var(--fg)]"
              style={{ left: `${((pin.x - view.x) / view.w) * 100}%`, top: `${((pin.y - view.y) / view.h) * 100}%` }} />
            {spot && zoomed && (
              <span aria-hidden className="pointer-events-none absolute mt-3 max-w-[70%] -translate-x-1/2 rounded-control bg-surface px-2 py-0.5 text-center text-sm font-bold leading-tight text-fg ring-1 ring-edge"
                style={{ left: `${((pin.x - view.x) / view.w) * 100}%`, top: `${((pin.y - view.y) / view.h) * 100}%` }}>{spot.name}</span>
            )}
          </>
        )}
        <div className="absolute right-2 top-2 flex flex-col gap-2">
          <button type="button" aria-label="Zoom in" className={MAP_BTN} onClick={() => zoomBy(2)}>+</button>
          <button type="button" aria-label="Zoom out" className={MAP_BTN} onClick={() => zoomBy(0.5)}>&minus;</button>
        </div>
        <span className="pointer-events-none absolute bottom-2 left-2 rounded-control bg-surface px-2 text-sm font-bold tabular-nums ring-1 ring-edge">
          Zoom {Math.round(zoom * 10) / 10}x
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4">
        <button type="button" className="link" onClick={() => setView(BOUNDS)}>Reset view</button>
        {canLocate && <button type="button" className="link" onClick={locate} disabled={locating}>{locating ? 'Finding you…' : 'Use my location'}</button>}
      </div>

      {point ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4">
          <p className="tabular-nums" role="status">
            {approx ? 'Area centre' : 'Your exact spot'}: <strong>{fmt(point)}</strong> &middot; {spot ? `${spot.name}, ${spot.region}` : region}
          </p>
          <button type="button" className="link" onClick={copy}>{copied ?? 'Copy coordinates'}</button>
        </div>
      ) : (
        <p className="text-sm text-muted">Tap the map to drop a pin. Zoom in to see council areas.</p>
      )}

      <form onSubmit={goToCoords} className="flex flex-col gap-1">
        <label htmlFor="coords" className="font-bold">Enter coordinates <span className="font-normal text-muted">(latitude, longitude)</span></label>
        <div className="flex flex-wrap gap-2">
          <input id="coords" value={coords} onChange={(e) => setCoords(e.target.value)} placeholder="54.5, -3.1" autoComplete="off" className="min-w-[8rem] flex-1 field" />
          <button className="btn-ghost">Go to coordinates</button>
        </div>
      </form>
      {msg && <p className="text-warn" role="status">{msg}</p>}

      <p className="text-sm text-muted">
        Chosen region: <strong className="text-fg">{region}</strong>. Pinch, scroll or use + and &minus; to zoom, drag to move. With the map focused, arrow keys move it and Enter drops a pin at the centre.
      </p>
    </div>
  );
}
