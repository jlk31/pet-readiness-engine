import { test } from 'node:test';
import assert from 'node:assert/strict';
import { labelAlts, placeLabels, textWidth, type Box, type Item } from './labels.ts';

const abs = (it: Item, a: number, s: number): Box => ({ x: it.x * s + it.alts[a].x, y: it.y * s + it.alts[a].y, w: it.alts[a].w, h: it.alts[a].h });
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('textWidth scales with characters and font size', () => {
  assert.equal(textWidth('abcd', 10, 0.5), 20);
  assert.ok(textWidth('Birmingham', 14) > textWidth('Leeds', 14));
});

test('labelAlts: a dotted label has four boxes clear of the dot, a centred one has one', () => {
  const a = labelAlts(60, 14, 3);
  assert.equal(a.length, 4);
  for (const b of a) assert.ok(!overlap(b, { x: -3, y: -3, w: 6, h: 6 }));
  assert.deepEqual(labelAlts(60, 14, 0), [{ x: -30, y: -7, w: 60, h: 14 }]);
});

test('placeLabels: no two placed boxes overlap, even with padding, on a dense random set', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const items: Item[] = Array.from({ length: 600 }, () => ({ x: rnd() * 60, y: rnd() * 60, alts: labelAlts(40 + rnd() * 60, 14, 3) }));
  const s = 5, pad = 2;
  const pick = placeLabels(items, s, pad);
  const boxes = items.flatMap((it, i) => (pick[i] >= 0 ? [abs(it, pick[i], s)] : []));
  assert.ok(boxes.length > 50 && boxes.length < items.length);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++)
    assert.ok(!(boxes[i].x < boxes[j].x + boxes[j].w + pad && boxes[j].x < boxes[i].x + boxes[i].w + pad && boxes[i].y < boxes[j].y + boxes[j].h + pad && boxes[j].y < boxes[i].y + boxes[i].h + pad), `${i} touches ${j}`);
});

test('placeLabels: priority order wins, and a blocked label falls back to its next box', () => {
  const first: Item = { x: 10, y: 10, alts: labelAlts(50, 14, 3) };
  const same: Item = { x: 10, y: 10, alts: [labelAlts(50, 14, 3)[0]] }; // only the right-hand box: blocked by the first
  const other: Item = { x: 10, y: 10, alts: labelAlts(50, 14, 3) }; // can go left
  assert.deepEqual(placeLabels([first, same, other], 1), [0, -1, 1]);
});

test('placeLabels: negative and far positions work', () => {
  assert.deepEqual(placeLabels([{ x: -500, y: -500, alts: labelAlts(30, 10, 0) }, { x: 900, y: 900, alts: labelAlts(30, 10, 0) }], 3), [0, 0]);
});
