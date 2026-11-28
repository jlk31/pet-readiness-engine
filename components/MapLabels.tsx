import { memo } from 'react';
import { labelAlts, placeLabels, textWidth, type Box, type Item } from '@/lib/labels';
import { COUNTIES, SETTLEMENTS } from '@/lib/uk-labels';
import { REGIONS } from '@/lib/uk-map';

/** Labels are laid out once per zoom bucket (zoom rounded down to a power of STEP), so panning never moves or re-chooses them. */
export const STEP = 1.1;

interface Style { fs: number; r: number; bold: boolean; muted: boolean; caps: boolean; from: number; to: number }
// Level of detail: a label is on while the zoom is in [from, to). Order here is also collision priority.
const REGION: Style = { fs: 11.5, r: 0, bold: true, muted: true, caps: true, from: 0, to: 2.4 };
const COUNTY: Style = { fs: 11.5, r: 0, bold: true, muted: true, caps: true, from: 2, to: 7 };
const SETTLEMENT: Style[] = [
  { fs: 14, r: 3.5, bold: true, muted: false, caps: false, from: 1.5, to: Infinity },
  { fs: 13, r: 3, bold: true, muted: false, caps: false, from: 3, to: Infinity },
  { fs: 12.5, r: 2.5, bold: false, muted: false, caps: false, from: 4, to: Infinity },
  { fs: 12, r: 2, bold: false, muted: true, caps: false, from: 10, to: Infinity },
];
const TOP_CITIES = 24; // SETTLEMENTS are in rank order and start with the cities
const FLY_ZOOM = { city: 10, county: 5 }; // what clicking a city or county label zooms to

export interface Placed {
  key: string; lines: string[]; x: number; y: number; st: Style;
  anchor: 'start' | 'middle' | 'end'; ox: number; oy: number; box: Box; // text anchor and box in px relative to the map point
  fly?: number; // clickable: zoom to fly to
  kind: 'region' | 'county' | 'place';
}

const ANCHORS = ['start', 'end', 'middle', 'middle'] as const;
const CAPS_EM = 0.76; // spaced bold capitals
const lh = (st: Style) => st.fs * 1.15; // line spacing
const boxH = (st: Style, lines: number) => st.fs * 1.3 + (lines - 1) * lh(st); // a text box is about 1.3 em tall
/** "Yorkshire and The Humber" on two lines, split at the space nearest the middle. */
function wrap(s: string): string[] {
  if (!s.includes(' ')) return [s];
  let best = -1;
  for (let i = 0; i < s.length; i++) if (s[i] === ' ' && (best < 0 || Math.abs(i - s.length / 2) < Math.abs(best - s.length / 2))) best = i;
  return [s.slice(0, best), s.slice(best + 1)];
}

/** Choose which labels fit at this zoom (greedy, by priority) and where each goes. `width` is the map's pixel width, `boundsW` its width in map units at 1x. */
export function layoutLabels(zoom: number, width: number, boundsW: number): Placed[] {
  const s = (width * zoom) / boundsW;
  const cands: Omit<Placed, 'anchor' | 'ox' | 'oy' | 'box'>[] = [];
  const add = (key: string, name: string, x: number, y: number, st: Style, kind: Placed['kind'], fly?: number) => {
    if (zoom < st.from || zoom >= st.to) return;
    cands.push({ key, lines: kind === 'region' ? wrap(name.toUpperCase()) : [st.caps ? name.toUpperCase() : name], x, y, st, kind, fly });
  };
  for (const r of REGIONS) add(`r:${r.name}`, r.name, r.c[0], r.c[1], REGION, 'region');
  // The biggest cities first, then counties (they would otherwise lose their spot to every small city), then the rest.
  const place = (p: (typeof SETTLEMENTS)[number]) => add(`p:${p.rank}`, p.name, p.x, p.y, SETTLEMENT[p.kind], 'place', p.kind === 0 ? FLY_ZOOM.city : undefined);
  SETTLEMENTS.slice(0, TOP_CITIES).forEach(place);
  for (const c of COUNTIES) add(`c:${c.name}`, c.name, c.x, c.y, COUNTY, 'county', FLY_ZOOM.county);
  SETTLEMENTS.slice(TOP_CITIES).forEach(place);
  const items: Item[] = cands.map((c) => {
    const em = c.st.caps ? CAPS_EM : c.st.bold ? 0.58 : 0.55;
    const w = Math.max(...c.lines.map((l) => textWidth(l, c.st.fs, em))), h = boxH(c.st, c.lines.length);
    return { x: c.x, y: c.y, alts: labelAlts(w, h, c.st.r) };
  });
  const picks = placeLabels(items, s);
  const out: Placed[] = [];
  cands.forEach((c, i) => {
    if (picks[i] < 0) return;
    const box = items[i].alts[picks[i]], anchor = c.st.r === 0 ? 'middle' : ANCHORS[picks[i]];
    out.push({ ...c, anchor, box, ox: anchor === 'start' ? box.x : anchor === 'end' ? box.x + box.w : box.x + box.w / 2, oy: box.y + c.st.fs }); // first baseline
  });
  return out;
}

/** Labels that touch the window [x0, x1] x [y0, y1] (map units) once their boxes are scaled by `upp` map units per pixel. */
export const inWindow = (list: Placed[], x0: number, y0: number, x1: number, y1: number, upp: number) =>
  list.filter((p) => p.x + (p.box.x + p.box.w) * upp > x0 && p.x + p.box.x * upp < x1 && p.y + (p.box.y + p.box.h) * upp > y0 && p.y + p.box.y * upp < y1);

/** Fade (0..1) for the layers that come and go: in over `a`..`b`, out over `c`..`d`. */
export const fade = (z: number, a: number, b: number, c: number, d: number) => Math.min(Math.max((z - a) / (b - a), 0), Math.max((d - z) / (d - c), 0), 1);

/** The label layer. Sizes are worked out from the zoom (map units per pixel), so text stays the same size on screen. Decorative: the search is the accessible way in. */
export const Labels = memo(function Labels({ items, upp, regionOp, countyOp }: { items: Placed[]; upp: number; regionOp: number; countyOp: number }) {
  return (
    <g aria-hidden>
      {items.map((p) => {
        const op = p.kind === 'region' ? regionOp : p.kind === 'county' ? countyOp : 1;
        if (op <= 0.02) return null;
        const { st } = p, fs = st.fs * upp, x = p.x + p.ox * upp, y = p.y + p.oy * upp;
        return (
          <g key={p.key} opacity={op}>
            {st.r > 0 && <circle cx={p.x} cy={p.y} r={st.r * upp} className="fill-fg" stroke="var(--bg)" strokeWidth={1.25 * upp} />}
            <text x={x} y={y} textAnchor={p.anchor} fontSize={fs} fontWeight={st.bold ? 700 : 500} data-label={p.kind}
              {...(p.fly ? { 'data-fx': p.x, 'data-fy': p.y, 'data-fz': p.fly } : {})}
              letterSpacing={st.caps ? 0.06 * fs : undefined} className={st.muted ? 'fill-muted' : 'fill-fg'}
              style={{ paintOrder: 'stroke', stroke: 'var(--bg)', strokeWidth: 3.5 * upp, strokeLinejoin: 'round', pointerEvents: p.fly ? 'all' : 'none', cursor: p.fly ? 'pointer' : undefined }}>
              {p.lines.map((l, i) => <tspan key={i} x={x} dy={i ? lh(st) * upp : 0}>{l}</tspan>)}
            </text>
          </g>
        );
      })}
    </g>
  );
});
