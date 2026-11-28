import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UK_REGIONS } from './location.ts';
import { REGIONS, toLatLon, toXY, VIEW } from './uk-map.ts';

test('toXY/toLatLon round trip, and points land inside the viewBox', () => {
  for (const [lat, lon] of [[51.5074, -0.1278], [55.9533, -3.1883], [54.5973, -5.9301], [51.4816, -3.1791]]) {
    const { x, y } = toXY(lat, lon);
    assert.ok(x > 0 && x < VIEW.w && y > 0 && y < VIEW.h);
    const back = toLatLon(x, y);
    assert.ok(Math.abs(back.lat - lat) < 1e-9 && Math.abs(back.lon - lon) < 1e-9);
  }
});

test('north is up and east is right', () => {
  assert.ok(toXY(55.95, -3.19).y < toXY(51.51, -0.13).y); // Edinburgh above London
  assert.ok(toXY(51.51, -0.13).x > toXY(54.6, -5.93).x); // London right of Belfast
});

test('every UK region has a path and a label point; no extras', () => {
  assert.deepEqual(REGIONS.map((r) => r.name).sort(), [...UK_REGIONS].sort());
  for (const r of REGIONS) assert.ok(r.d.startsWith('M') && r.d.length > 100 && r.c.length === 2, r.name);
});
