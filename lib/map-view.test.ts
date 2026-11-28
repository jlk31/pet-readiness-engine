import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampView, MAX_ZOOM, panViewBox, viewAt, zoomOf, zoomViewBox, type View } from './map-view.ts';

const B: View = { x: -150, y: 0, w: 900, h: 1100 };
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

test('zoomViewBox: the point under the cursor stays put, aspect is kept', () => {
  const v = zoomViewBox(B, 2, 100, 300, B);
  near(zoomOf(v, B), 2);
  near(v.w / v.h, B.w / B.h);
  near((100 - v.x) / v.w, (100 - B.x) / B.w);
  near((300 - v.y) / v.h, (300 - B.y) / B.h);
  const again = zoomViewBox(v, 1.5, 120, 350, B);
  near((120 - again.x) / again.w, (120 - v.x) / v.w);
});

test('zoomViewBox: clamps to 1x and the maximum, and stays inside the bounds', () => {
  assert.deepEqual(zoomViewBox(B, 0.5, 0, 0, B), B);
  const z = zoomViewBox(B, 1000, -140, 5, B);
  near(zoomOf(z, B), MAX_ZOOM);
  assert.ok(z.x >= B.x && z.y >= B.y && z.x + z.w <= B.x + B.w && z.y + z.h <= B.y + B.h);
  assert.equal(zoomOf(zoomViewBox(B, 1000, 0, 0, B, 8), B), 8);
});

test('zoom out then in returns to the same view when nothing clamps', () => {
  const v = viewAt(300, 500, 4, B);
  const out = zoomViewBox(v, 0.5, 300, 500, B), back = zoomViewBox(out, 2, 300, 500, B);
  for (const k of ['x', 'y', 'w', 'h'] as const) near(back[k], v[k]);
});

test('panViewBox and clampView never leave the bounds; panning at 1x does nothing', () => {
  assert.deepEqual(panViewBox(B, 50, -50, B), B);
  const v = viewAt(-1e6, -1e6, 10, B);
  assert.equal(v.x, B.x); assert.equal(v.y, B.y);
  const p = panViewBox(v, 1e6, 1e6, B);
  near(p.x + p.w, B.x + B.w); near(p.y + p.h, B.y + B.h);
  assert.deepEqual(clampView({ x: -1e6, y: -1e6, w: 90, h: 110 }, B), { x: B.x, y: B.y, w: 90, h: 110 });
});

test('viewAt centres on the point when there is room', () => {
  const v = viewAt(300, 500, 4, B);
  near(v.x + v.w / 2, 300); near(v.y + v.h / 2, 500);
});

test('lerpView: starts at a, ends at b, zoom moves by ratio, stays in bounds', async () => {
  const { lerpView, easeOut } = await import('./map-view.ts');
  const a = viewAt(0, 100, 1, B), b = viewAt(300, 500, 16, B);
  for (const k of ['x', 'y', 'w', 'h'] as const) near(lerpView(a, b, 0, B)[k], a[k]);
  assert.deepEqual(lerpView(a, b, 1, B), b);
  near(zoomOf(lerpView(a, b, 0.5, B), B), 4); // sqrt(1 * 16)
  for (const t of [0.1, 0.4, 0.8]) { const v = lerpView(a, b, t, B); assert.ok(v.x >= B.x && v.y >= B.y && v.x + v.w <= B.x + B.w && v.y + v.h <= B.y + B.h); }
  assert.equal(easeOut(0), 0); assert.equal(easeOut(1), 1); assert.ok(easeOut(0.5) > 0.5); assert.equal(easeOut(5), 1);
});

test('scaleBar: 1, 2 or 5 times a power of ten that fits, and its width matches the distance', async () => {
  const { scaleBar, KM_PER_UNIT } = await import('./map-view.ts');
  for (const upp of [0.03, 0.1, 0.35, 0.9, 1.8]) {
    const s = scaleBar(upp);
    assert.ok(s.px <= 96 && s.px > 96 / 2.6, `${upp}: ${s.px}`);
    near(s.px * upp * KM_PER_UNIT, s.km);
    assert.match(String(s.km), /^(1|2|5)(0*)$|^0\.(5|2|1)$/);
  }
  assert.equal(scaleBar(1.2).label, '100 km');
  assert.equal(scaleBar(0.005).label, '500 m');
});
