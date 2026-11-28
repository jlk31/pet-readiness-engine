// Pure maths for the zoomable SVG map. A View is the visible part of the map in SVG units (the `viewBox`).
// `bounds` has the same aspect ratio as the view, so zoom 1 shows all of `bounds` and the view never leaves it.
export interface View { x: number; y: number; w: number; h: number }

export const MAX_ZOOM = 40;

export const zoomOf = (v: View, b: View) => b.w / v.w;

/** Slide the view back inside the bounds without changing its size. */
export function clampView(v: View, b: View): View {
  return { ...v, x: Math.min(Math.max(v.x, b.x), b.x + b.w - v.w), y: Math.min(Math.max(v.y, b.y), b.y + b.h - v.h) };
}

/** Zoom by `factor` keeping the map point (cx, cy) under the same spot on screen. Result is clamped to 1x..max. */
export function zoomViewBox(v: View, factor: number, cx: number, cy: number, b: View, max = MAX_ZOOM): View {
  const z = Math.min(Math.max(zoomOf(v, b) * factor, 1), max);
  const w = b.w / z, h = b.h / z;
  return clampView({ x: cx - ((cx - v.x) / v.w) * w, y: cy - ((cy - v.y) / v.h) * h, w, h }, b);
}

/** Move the view by (dx, dy) SVG units, clamped. */
export const panViewBox = (v: View, dx: number, dy: number, b: View): View => clampView({ ...v, x: v.x + dx, y: v.y + dy }, b);

/** A view of the given zoom centred on (cx, cy), clamped. */
export function viewAt(cx: number, cy: number, zoom: number, b: View, max = MAX_ZOOM): View {
  const z = Math.min(Math.max(zoom, 1), max), w = b.w / z, h = b.h / z;
  return clampView({ x: cx - w / 2, y: cy - h / 2, w, h }, b);
}

// ponytail: a rectangle, so the Channel Islands and the sea between Ireland and Wales pass; the map itself rejects non-land taps.
const UK_BOX = { lat: [49.8, 61], lon: [-8.7, 1.8] };

/** "54.5, -3.1" or "54.5 -3.1" -> a point inside the UK bounding box, else null. */
export function parseCoords(text: string): { lat: number; lon: number } | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text);
  if (!m) return null;
  const lat = +m[1], lon = +m[2];
  return lat >= UK_BOX.lat[0] && lat <= UK_BOX.lat[1] && lon >= UK_BOX.lon[0] && lon <= UK_BOX.lon[1] ? { lat, lon } : null;
}
