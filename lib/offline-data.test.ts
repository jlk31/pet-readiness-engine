import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UK_REGIONS } from './location.ts';
import { lookupOutcode, OUTCODE_COUNT } from './outcodes.ts';
import { districtAt, DISTRICTS } from './uk-districts.ts';
import { countyLinks, nearestPlaces, PLACE_COUNTS } from './places.ts';

test('lookupOutcode: full postcodes, any case/spacing, outcode-only, all UK formats', () => {
  assert.ok(OUTCODE_COUNT > 2500);
  const cases: [string, string, string][] = [
    ['SE1 7PB', 'SE1', 'London'], ['se17pb', 'SE1', 'London'], ['M1 1AE', 'M1', 'North West'], ['EH12 9DN', 'EH12', 'Scotland'],
    ['BT1 5GS', 'BT1', 'Northern Ireland'], ['CF10 1EP', 'CF10', 'Wales'], ['W1A 1AA', 'W1A', 'London'], ['EC1A 1BB', 'EC1A', 'London'],
    ['eh12', 'EH12', 'Scotland'], ['  sw1a  ', 'SW1A', 'London'],
  ];
  for (const [input, outcode, region] of cases) {
    const o = lookupOutcode(input);
    assert.equal(o?.outcode, outcode, input);
    assert.equal(o?.region, region, input);
    assert.ok(UK_REGIONS.includes(o!.region) && o!.district && o!.lat > 49 && o!.lat < 61 && o!.lon > -9 && o!.lon < 2, input);
  }
});

test('lookupOutcode: unknown input gives null (GIR 0AA is the non-geographic Girobank code)', () => {
  for (const s of ['GIR 0AA', 'nonsense', '', 'ZZ99 9ZZ', '12345']) assert.equal(lookupOutcode(s), null, s);
});

test('districtAt: big cities resolve to the right district and region; sea is null', () => {
  assert.deepEqual(districtAt(51.4998, -0.0886)?.region, 'London');
  assert.ok(['Southwark', 'Lambeth', 'Westminster'].includes(districtAt(51.5014, -0.1419)!.name)); // Buckingham Palace area
  assert.deepEqual(districtAt(53.4808, -2.2426), { name: 'Manchester', region: 'North West' });
  assert.deepEqual(districtAt(55.9533, -3.1883), { name: 'City of Edinburgh', region: 'Scotland' });
  assert.deepEqual(districtAt(51.4816, -3.1791), { name: 'Cardiff', region: 'Wales' });
  assert.deepEqual(districtAt(54.5973, -5.9301), { name: 'Belfast', region: 'Northern Ireland' });
  assert.equal(districtAt(50.0, -6.5), null); // Atlantic, south-west of Cornwall
  assert.equal(districtAt(53.5, -4.8), null); // Irish Sea
  assert.ok(DISTRICTS.every((d) => UK_REGIONS.includes(d.region)));
});

test('outcode centroids fall in a district of the same region (data layers agree)', () => {
  const bad = ['SE1', 'M1', 'EH12', 'CF10', 'BT1', 'LS1', 'B1', 'PL1'].filter((c) => {
    const o = lookupOutcode(c)!;
    return districtAt(o.lat, o.lon)?.region !== o.region;
  });
  assert.deepEqual(bad, []);
});

test('nearestPlaces: ascending km, kind filtered, links are http(s)', () => {
  assert.ok(PLACE_COUNTS.shelter > 100 && PLACE_COUNTS.petshop > 1000);
  for (const [lat, lon] of [[51.4991, -0.0914], [54.5, -3.1]]) for (const kind of ['shelter', 'petshop'] as const) {
    const r = nearestPlaces(lat, lon, kind, 5);
    assert.equal(r.length, 5);
    assert.ok(r.every((p) => p.kind === kind && /^https?:\/\//.test(p.link) && p.name));
    assert.ok(r.every((p, i) => i === 0 || r[i - 1].km <= p.km));
  }
  assert.equal(nearestPlaces(51.5, -0.09, 'shelter').length, 3);
});

test('countyLinks: 2 to 3 https links for every region, national bodies where they apply', () => {
  for (const r of UK_REGIONS) {
    const l = countyLinks(r);
    assert.ok(l.length >= 2 && l.length <= 3 && l.every((x) => x.url.startsWith('https://')), r);
  }
  assert.ok(countyLinks('Scotland').some((l) => /scottishspca/.test(l.url)));
  assert.ok(countyLinks('Northern Ireland').some((l) => /uspca/.test(l.url)));
});
