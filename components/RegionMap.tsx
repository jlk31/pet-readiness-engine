'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { easeOut, lerpView, panViewBox, parseCoords, scaleBar, viewAt, zoomOf, zoomViewBox, type View } from '@/lib/map-view';
import type { Result } from '@/lib/search';
import { DISTRICTS, districtAt } from '@/lib/uk-districts';
import { REGIONS, toLatLon, toXY, VIEW } from '@/lib/uk-map';
import { fade, inWindow, Labels, layoutLabels, STEP } from './MapLabels';
import { PlaceGlyph, placeKey, type Nearby } from './NearbyPlaces';
import PlaceSearch from './PlaceSearch';

interface Props {
  region: string;
  point: { lat: number; lon: number } | null;
  /** Say "Area centre" instead of "Your exact spot" when the point is a postcode district centre. */
  approx?: boolean;
  /** A region was chosen: a tap or typed point (exact), or a region by keyboard (its label point). */
  onPick: (region: string, lat: number, lon: number) => void;
  /** Nearest rescue centres and pet shops, drawn as numbered markers. */
  found?: Nearby | null;
  /** The place picked in the list or on the map (`n` changes on every pick, so the map flies again). */
  selected?: { key: string; n: number } | null;
  onSelect?: (key: string) => void;
}

// The map box is 4:5; zoom 1x shows the whole UK, which is taller than that, so the sides are sea.
const AR = 0.8;
const BOUNDS: View = { x: (VIEW.w - VIEW.h * AR) / 2, y: 0, w: VIEW.h * AR, h: VIEW.h };
const FLY_ZOOM = 16; // typed and looked-up points show at least this much zoom (about 30 km across)
const LOCATE_ZOOM = 12; // "Use my location"
const MARKERS_FROM = 3; // rescue centre and pet shop markers show from this zoom
const DISTRICTS_FROM = 2.5;
const TAP_PX = 6;
const FLY_MS = 350;
const DOUBLE_TAP_MS = 300;
const ARROWS: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
// Regions have their own fill and border tokens so they stand clear of the page in both themes; the chosen one is also drawn with a heavier outline.
const FILL = 'cursor-crosshair fill-(--map-fill) stroke-(--map-line) aria-checked:stroke-fg aria-checked:[stroke-width:2.5]';
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

const D_PATH = new Map(DISTRICTS.map((d) => [d.name, d.d]));
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/** The region of the nearest land within about 2 km (a town on the coast can miss the simplified outline). */
function regionNear(lat: number, lon: number): string | undefined {
  for (const r of [0.01, 0.02]) for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const d = districtAt(lat + dy * r, lon + dx * r);
    if (d) return d.region;
  }
}

/** Offline UK map: inline SVG, no external requests, themed by the colour tokens. Zoom and pan change the viewBox only. */
export default function RegionMap({ region, point, approx, onPick, found, selected, onSelect }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const [view, setView] = useState<View>(BOUNDS);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [focus, setFocus] = useState<string | null>(null);
  const [hover, setHover] = useState<{ name: string; region: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [coords, setCoords] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [canLocate, setCanLocate] = useState(false);
  const [locating, setLocating] = useState(false);
  const viewRef = useRef(view);
  viewRef.current = view;
  const own = useRef<{ lat: number; lon: number } | null>(null); // the point this map just dropped, so the sync effect does not re-centre on it
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ sx: number; sy: number; v: View; moved: boolean; id: number; pinch?: { d: number; mx: number; my: number } } | null>(null);
  const anim = useRef<{ id: number; to: View | null }>({ id: 0, to: null });
  const frame = useRef({ id: 0, mouse: null as { x: number; y: number } | null });
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);

  const zoom = zoomOf(view, BOUNDS);
  const upp = size.w ? view.w / size.w : 0; // map units per screen pixel
  const pin = point && toXY(point.lat, point.lon);
  const spot = useMemo(() => (point ? districtAt(point.lat, point.lon) : null), [point]);
  const spotPath = spot && D_PATH.get(spot.name);
  const opacity = Math.round(Math.min(1, Math.max(0, (zoom - DISTRICTS_FROM) / 2)) * 10) / 10;
  const zoomed = zoom >= DISTRICTS_FROM;

  // Labels are placed once per zoom bucket (zoom rounded down to a power of STEP) and only those near the view are drawn.
  const bucket = Math.floor(Math.log(zoom) / Math.log(STEP) + 1e-9);
  const placed = useMemo(() => (size.w ? layoutLabels(STEP ** bucket, size.w, BOUNDS.w) : []), [bucket, size.w]);
  const cw = view.w / 3, ch = view.h / 3, cx = Math.floor(view.x / cw), cy = Math.floor(view.y / ch);
  const near = useMemo(() => inWindow(placed, (cx - 1) * cw, (cy - 1) * ch, (cx + 5) * cw, (cy + 5) * ch, upp), [placed, cx, cy, view.w]); // eslint-disable-line react-hooks/exhaustive-deps
  const bar = size.w ? scaleBar(upp) : null;
  const markers = useMemo(() => (found ? (['shelter', 'petshop'] as const).flatMap((k) => found[k].map((p, i) => ({ p, n: i + 1, key: placeKey(p), ...toXY(p.lat, p.lon) }))) : []), [found]);

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

  // Pixel size of the map, for label sizes and the scale bar.
  useEffect(() => {
    const el = svg.current!, read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => () => { cancelAnimationFrame(anim.current.id); cancelAnimationFrame(frame.current.id); }, []);

  const stop = () => { cancelAnimationFrame(anim.current.id); anim.current.to = null; };

  /** Move to `to`: a ~350 ms ease-out fly, or at once for people who ask for reduced motion. */
  function go(to: View) {
    const from = viewRef.current;
    stop();
    if (reduceMotion() || (to.x === from.x && to.y === from.y && to.w === from.w)) { setView(to); return; }
    const t0 = performance.now();
    anim.current.to = to;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / FLY_MS);
      setView(lerpView(from, to, easeOut(t), BOUNDS));
      if (t < 1) anim.current.id = requestAnimationFrame(step); else anim.current.to = null;
    };
    anim.current.id = requestAnimationFrame(step);
  }

  // Wheel and trackpad pinch zoom around the cursor. React's onWheel is passive, so this is a native listener.
  useEffect(() => {
    const el = svg.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stop();
      const r = el.getBoundingClientRect();
      const px = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const factor = Math.exp(-e.deltaY * px * (e.ctrlKey ? 0.01 : 0.0015));
      setView((v) => zoomViewBox(v, factor, v.x + ((e.clientX - r.left) / r.width) * v.w, v.y + ((e.clientY - r.top) / r.height) * v.h, BOUNDS));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  /** Fly to a point. `exact` goes to that zoom (in or out); otherwise the zoom never drops below `zoom`. */
  function flyTo(lat: number, lon: number, zoomTo: number, exact = false) {
    const { x, y } = toXY(lat, lon), base = anim.current.to ?? viewRef.current;
    go(viewAt(x, y, exact ? zoomTo : Math.max(zoomOf(base, BOUNDS), zoomTo), BOUNDS));
  }

  // A point that did not come from this map (postcode lookup) gets shown.
  useEffect(() => {
    if (!point) return;
    const o = own.current;
    own.current = null;
    if (!o || o.lat !== point.lat || o.lon !== point.lon) flyTo(point.lat, point.lon, FLY_ZOOM);
  }, [point]); // eslint-disable-line react-hooks/exhaustive-deps

  // A rescue centre or pet shop picked in the list or on the map: show it.
  useEffect(() => {
    if (!selected || !found) return;
    const p = [...found.shelter, ...found.petshop].find((q) => placeKey(q) === selected.key);
    if (p) flyTo(p.lat, p.lon, 13);
  }, [selected?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Drop the pin if the spot is in the UK. */
  function drop(lat: number, lon: number, tappedRegion?: string) {
    const r = districtAt(lat, lon)?.region ?? tappedRegion;
    if (!r) { setMsg('That spot is outside the UK. Pick a spot on land.'); return false; }
    setMsg(null);
    own.current = { lat, lon };
    onPick(r, lat, lon);
    return true;
  }

  function zoomBy(factor: number, at?: { x: number; y: number }) {
    const v = anim.current.to ?? viewRef.current;
    go(zoomViewBox(v, factor, at?.x ?? v.x + v.w / 2, at?.y ?? v.y + v.h / 2, BOUNDS));
  }

  function pickRegion(i: number) {
    const [x, y] = REGIONS[i].c, { lat, lon } = toLatLon(x, y);
    setMsg(null);
    onPick(REGIONS[i].name, lat, lon);
    go(viewAt(x, y, zoomOf(viewRef.current, BOUNDS), BOUNDS));
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
      stop();
      setView(panViewBox(v, ARROWS[e.key][0] * v.w * 0.2, ARROWS[e.key][1] * v.h * 0.2, BOUNDS));
    } else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomBy(2); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomBy(0.5); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const { lat, lon } = toLatLon(v.x + v.w / 2, v.y + v.h / 2);
      drop(lat, lon);
    }
  }

  const at = (e: { clientX: number; clientY: number }, v = viewRef.current) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: v.x + ((e.clientX - r.left) / r.width) * v.w, y: v.y + ((e.clientY - r.top) / r.height) * v.h };
  };

  function tap(e: React.PointerEvent) {
    const t = (e.target as Element), now = e.timeStamp, last = lastTap.current;
    if (last && now - last.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 24) { // double tap or click: zoom in here
      lastTap.current = null;
      stop();
      const p = at(e);
      zoomBy(2, p);
      return;
    }
    lastTap.current = { t: now, x: e.clientX, y: e.clientY };
    const place = t.closest('[data-place]')?.getAttribute('data-place');
    if (place) { onSelect?.(place); return; }
    const lab = t.closest('[data-fx]');
    if (lab && zoom < +lab.getAttribute('data-fz')! * 0.9) { // a city or county name: fly there (at its own zoom or beyond, a tap drops the pin as usual)
      const { lat, lon } = toLatLon(+lab.getAttribute('data-fx')!, +lab.getAttribute('data-fy')!);
      flyTo(lat, lon, +lab.getAttribute('data-fz')!, true);
      return;
    }
    const { x, y } = at(e), { lat, lon } = toLatLon(x, y);
    drop(lat, lon, t.closest('[data-region]')?.getAttribute('data-region') ?? undefined);
  }

  function onDown(e: React.PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    stop();
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 1) gesture.current = { sx: e.clientX, sy: e.clientY, v: viewRef.current, moved: false, id: e.pointerId };
    else if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      gesture.current = { sx: 0, sy: 0, v: viewRef.current, moved: true, id: e.pointerId, pinch: { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 } };
    }
  }

  // Pointer moves are collected and applied once per animation frame: drag, pinch, and the hover tooltip (mouse only).
  function flush() {
    frame.current.id = 0;
    const g = gesture.current, m = frame.current.mouse;
    if (g) {
      const r = svg.current!.getBoundingClientRect(), upx = g.v.w / r.width;
      if (g.pinch) {
        if (ptrs.current.size < 2) return;
        // Zoom about where the fingers started, then follow their midpoint.
        const [a, b] = [...ptrs.current.values()], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const z = zoomViewBox(g.v, Math.hypot(a.x - b.x, a.y - b.y) / g.pinch.d, g.v.x + (g.pinch.mx - r.left) * upx, g.v.y + (g.pinch.my - r.top) * upx, BOUNDS);
        setView(panViewBox(z, -(mx - g.pinch.mx) * (z.w / r.width), -(my - g.pinch.my) * (z.w / r.width), BOUNDS));
        return;
      }
      const p = ptrs.current.get(g.id);
      if (!p) return;
      const dx = p.x - g.sx, dy = p.y - g.sy;
      if (!g.moved && Math.hypot(dx, dy) > TAP_PX) { g.moved = true; svg.current!.setPointerCapture(g.id); setHover(null); }
      if (g.moved) setView(panViewBox(g.v, -dx * upx, -dy * upx, BOUNDS));
    } else if (m) {
      const p = at({ clientX: m.x, clientY: m.y }), { lat, lon } = toLatLon(p.x, p.y), d = districtAt(lat, lon);
      setHover((h) => (h?.name === d?.name && h?.region === d?.region ? h : d));
      placeTip();
    }
  }

  function placeTip() {
    const el = tip.current, m = frame.current.mouse, b = box.current;
    if (!el || !m || !b) return;
    const r = b.getBoundingClientRect(), x = m.x - r.left, y = m.y - r.top, flip = x > r.width * 0.55;
    el.style.left = `${x + (flip ? -14 : 14)}px`;
    el.style.top = `${y + 16}px`;
    el.style.transform = flip ? 'translateX(-100%)' : '';
  }

  function onMove(e: React.PointerEvent) {
    const p = ptrs.current.get(e.pointerId);
    if (p) { p.x = e.clientX; p.y = e.clientY; }
    frame.current.mouse = e.pointerType === 'mouse' && ptrs.current.size === 0 ? { x: e.clientX, y: e.clientY } : null;
    if (!frame.current.id) frame.current.id = requestAnimationFrame(flush);
  }

  function onLeave() {
    frame.current.mouse = null;
    setHover(null);
  }

  function onUp(e: React.PointerEvent) {
    if (frame.current.id) { cancelAnimationFrame(frame.current.id); flush(); } // apply the last move before deciding what this was
    const g = gesture.current;
    if (!ptrs.current.delete(e.pointerId) || !g) return;
    if (ptrs.current.size === 0) {
      gesture.current = null;
      if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) <= TAP_PX && e.type === 'pointerup') tap(e);
    } else {
      const [rest] = [...ptrs.current.values()]; // one finger left after a pinch: carry on as a drag
      gesture.current = { sx: rest.x, sy: rest.y, v: viewRef.current, moved: true, id: [...ptrs.current.keys()][0] };
    }
  }

  function goToCoords(e: React.FormEvent) {
    e.preventDefault();
    const c = parseCoords(coords);
    if (!c) { setMsg('Enter latitude and longitude inside the UK, like 54.5, -3.1.'); return; }
    if (drop(c.lat, c.lon)) flyTo(c.lat, c.lon, FLY_ZOOM);
  }

  function choose(r: Result) {
    const { lat, lon } = toLatLon(r.x, r.y);
    drop(lat, lon, regionNear(lat, lon));
    flyTo(lat, lon, r.zoom, true);
  }

  function locate() {
    setMsg(null);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords: c }) => { setLocating(false); if (drop(c.latitude, c.longitude)) flyTo(c.latitude, c.longitude, LOCATE_ZOOM, true); },
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

  const hoverPath = hover && D_PATH.get(hover.name);
  const mk = upp * 44; // marker boxes are 44 px (the touch target); glyphs inside are 30 px
  return (
    <div className="flex flex-col gap-3">
      <PlaceSearch onChoose={choose} />
      <div ref={box} role="group" tabIndex={0} onKeyDown={onMapKey}
        aria-label="UK map. Arrow keys move the map, plus and minus zoom, Enter drops a pin at the centre."
        className="relative mx-auto w-full touch-none select-none overflow-hidden rounded-card bg-bg ring-1 ring-edge"
        style={{ aspectRatio: `${BOUNDS.w}/${BOUNDS.h}`, maxWidth: `min(100%, ${AR * 70}svh)` }}>
        <svg ref={svg} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} role="radiogroup" aria-label="Choose your region on the map"
          className="size-full touch-none" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={onLeave}>
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
          {hoverPath && <path d={hoverPath} fillRule="evenodd" pointerEvents="none" className="fill-[color-mix(in_srgb,var(--accent)_16%,transparent)]" />}
          {spotPath && zoomed && (
            <path d={spotPath} fillRule="evenodd" pointerEvents="none" vectorEffect="non-scaling-stroke" strokeLinejoin="round"
              className="fill-[color-mix(in_srgb,var(--accent)_28%,transparent)] stroke-fg" strokeWidth={2} />
          )}
          {upp > 0 && <Labels items={near} upp={upp} regionOp={fade(zoom, 0, 0.1, 1.9, 2.4)} countyOp={fade(zoom, 1.9, 2.3, 6.4, 7)} />}
          {/* Rescue centres (house) and pet shops (circle), numbered as in the list. They are decorative here: the list items are the buttons. */}
          {upp > 0 && zoom >= MARKERS_FROM && [...markers].sort((a, b) => +(a.key === selected?.key) - +(b.key === selected?.key)).map((m) => {
            const on = m.key === selected?.key, k = on ? mk * 1.25 : mk;
            return (
              <svg key={m.key} x={m.x - k / 2} y={m.y - k / 2} width={k} height={k} viewBox="-22 -22 44 44" overflow="visible" aria-hidden data-place={m.key} data-kind={m.p.kind} data-n={m.n} className="cursor-pointer">
                <circle r={22} fill="transparent" />
                <PlaceGlyph kind={m.p.kind} n={m.n} selected={on} />
              </svg>
            );
          })}
          {/* Focus ring: a copy of the outline on top, so neighbours cannot cover it. */}
          {REGIONS.filter((r) => r.name === focus).map((r) => (
            <path key="ring" d={r.d} fillRule="evenodd" fill="none" pointerEvents="none" vectorEffect="non-scaling-stroke"
              strokeLinejoin="round" className="stroke-fg" strokeWidth={3} />
          ))}
        </svg>
        {pin && (
          <>
            <span aria-hidden data-pin className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-fg shadow-[0_0_0_1px_var(--fg)]"
              style={{ left: `${((pin.x - view.x) / view.w) * 100}%`, top: `${((pin.y - view.y) / view.h) * 100}%` }} />
            {spot && zoomed && (
              <span aria-hidden className="pointer-events-none absolute mt-3 max-w-[70%] -translate-x-1/2 rounded-control bg-surface px-2 py-0.5 text-center text-sm font-bold leading-tight text-fg ring-1 ring-edge"
                style={{ left: `${((pin.x - view.x) / view.w) * 100}%`, top: `${((pin.y - view.y) / view.h) * 100}%` }}>{spot.name}</span>
            )}
          </>
        )}
        {hover && (
          <span ref={(el) => { (tip as { current: HTMLSpanElement | null }).current = el; placeTip(); }} aria-hidden data-tooltip
            className="pointer-events-none absolute z-10 max-w-[60%] rounded-control bg-surface px-2 py-0.5 text-sm font-bold leading-tight text-fg ring-1 ring-edge">
            {hover.name}<span className="font-normal text-muted">, {hover.region}</span>
          </span>
        )}
        <div className="absolute right-2 top-2 flex flex-col gap-2">
          <button type="button" aria-label="Zoom in" className={MAP_BTN} onClick={() => zoomBy(2)}>+</button>
          <button type="button" aria-label="Zoom out" className={MAP_BTN} onClick={() => zoomBy(0.5)}>&minus;</button>
        </div>
        <span className="pointer-events-none absolute bottom-2 left-2 rounded-control bg-surface px-2 text-sm font-bold tabular-nums ring-1 ring-edge">
          Zoom {Math.round(zoom * 10) / 10}x
        </span>
        {bar && (
          <span aria-hidden className="pointer-events-none absolute bottom-2 right-2 flex flex-col items-end rounded-control bg-surface px-2 pb-0.5 text-sm font-bold tabular-nums ring-1 ring-edge">
            {bar.label}
            <span className="block h-1.5 border-x-2 border-b-2 border-fg" style={{ width: bar.px }} />
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4">
        <button type="button" className="link" onClick={() => go(BOUNDS)}>Reset view</button>
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
        <p className="text-sm text-muted">Search for a place or tap the map to drop a pin. Zoom in to see council areas.</p>
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
        Chosen region: <strong className="text-fg">{region}</strong>. Pinch, scroll, double-tap or use + and &minus; to zoom, drag to move. With the map focused, arrow keys move it and Enter drops a pin at the centre.
      </p>
    </div>
  );
}
