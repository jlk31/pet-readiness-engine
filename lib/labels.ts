// Pure helpers for map labels: greedy collision placement in screen pixels, and the candidate boxes for a label.
export interface Box { x: number; y: number; w: number; h: number }
/** A label anchor in map units and the boxes it may take, in pixels relative to the anchor, best first. */
export interface Item { x: number; y: number; alts: Box[] }

/** Cheap text width: characters x font size x an average glyph width (0.56 em for Satoshi; wider for spaced capitals). */
export const textWidth = (text: string, fontPx: number, em = 0.56) => text.length * fontPx * em;

/** Boxes for a label next to a dot of radius `r`: right, left, above, below. Pass r = 0 for a label centred on its point. */
export function labelAlts(w: number, h: number, r: number): Box[] {
  if (r === 0) return [{ x: -w / 2, y: -h / 2, w, h }];
  const g = r + 3;
  return [{ x: g, y: -h / 2, w, h }, { x: -g - w, y: -h / 2, w, h }, { x: -w / 2, y: -g - h, w, h }, { x: -w / 2, y: g, w, h }];
}

const touches = (a: Box, b: Box, pad: number) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

/**
 * Greedy placement. `items` are in priority order; `s` is screen pixels per map unit. Each item takes its first
 * alternative whose box (plus `pad` px) touches no box already placed. Returns the alternative chosen per item, or -1.
 * A grid of `cell`-px buckets keeps it linear in practice.
 */
export function placeLabels(items: Item[], s: number, pad = 2, cell = 64): number[] {
  const grid = new Map<number, Box[]>();
  const key = (cx: number, cy: number) => (cx + 4096) * 8192 + (cy + 4096);
  const each = (b: Box, f: (list: Box[], k: number) => boolean | void) => {
    for (let cx = Math.floor((b.x - pad) / cell); cx <= Math.floor((b.x + b.w + pad) / cell); cx++)
      for (let cy = Math.floor((b.y - pad) / cell); cy <= Math.floor((b.y + b.h + pad) / cell); cy++)
        if (f(grid.get(key(cx, cy)) ?? [], key(cx, cy))) return true;
    return false;
  };
  return items.map(({ x, y, alts }) => {
    for (let i = 0; i < alts.length; i++) {
      const b = { x: x * s + alts[i].x, y: y * s + alts[i].y, w: alts[i].w, h: alts[i].h };
      if (each(b, (list) => list.some((o) => touches(b, o, pad)))) continue;
      each(b, (list, k) => { if (!grid.has(k)) grid.set(k, list); list.push(b); });
      return i;
    }
    return -1;
  });
}
