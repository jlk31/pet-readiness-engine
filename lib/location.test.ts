import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceKm, toPlace, toVets, type OsmElement } from './location.ts';

test('distanceKm: London to Edinburgh is ~534km', () => {
  assert.ok(Math.abs(distanceKm(51.5074, -0.1278, 55.9533, -3.1883) - 534) < 5);
});

test('toVets: nodes and ways, nearest first, tags mapped, unplaceable dropped', () => {
  const els: OsmElement[] = [
    { type: 'way', id: 2, center: { lat: 51.52, lon: -0.119 }, tags: { name: 'Far Vets', 'addr:street': 'High St', 'addr:postcode': 'N1 1AA', website: 'https://far.example' } },
    { type: 'node', id: 1, lat: 51.502, lon: -0.119, tags: { name: 'Near Vets', opening_hours: '24/7', 'contact:phone': '020 7000 0000', website: 'javascript:alert(1)' } },
    { type: 'relation', id: 3, tags: { name: 'No geometry' } },
    { type: 'node', id: 4, lat: 51.51, lon: -0.119 },
  ];
  const v = toVets(els, 51.5019, -0.119);
  assert.deepEqual(v.map((x) => x.id), ['node/1', 'node/4', 'way/2']);
  assert.equal(v[0].emergency, true);
  assert.equal(v[0].phone, '020 7000 0000');
  assert.equal(v[1].name, 'Unnamed vet practice');
  assert.equal(v[2].address, 'High St N1 1AA');
  assert.equal(v[2].emergency, false);
  assert.equal(v[0].website, undefined);
  assert.equal(v[2].website, 'https://far.example');
  assert.equal(toVets(els, 51.5, -0.1, 1).length, 1);
});

test('toPlace: region falls back to country, precise point wins, null means outside the UK', () => {
  const eng = { postcode: 'SE1 7PB', region: 'London', country: 'England', admin_district: 'Lambeth', latitude: 51.5, longitude: -0.11 };
  assert.deepEqual(toPlace(eng), { postcode: 'SE1 7PB', region: 'London', district: 'Lambeth', lat: 51.5, lon: -0.11 });
  const sco = { postcode: 'EH1 1YZ', region: null, country: 'Scotland', admin_district: null, latitude: 55.95, longitude: -3.19 };
  assert.deepEqual(toPlace(sco, { lat: 55.951, lon: -3.191 }), { postcode: 'EH1 1YZ', region: 'Scotland', district: '', lat: 55.951, lon: -3.191 });
  assert.throws(() => toPlace(null), /outside the UK/);
});
