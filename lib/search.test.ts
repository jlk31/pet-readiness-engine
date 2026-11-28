import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fold, rankMatches, searchPlaces } from './search.ts';

test('fold ignores case, accents and punctuation', () => {
  assert.equal(fold('  St. Ives '), 'st ives');
  assert.equal(fold('Llanélli'), 'llanelli');
  assert.equal(fold('Stoke-on-Trent'), 'stoke on trent');
});

test('rankMatches: prefix first, then word start, then substring; needs 2 characters; keeps input order inside a group', () => {
  const items = ['Newcastle', 'Castle Cary', 'Newcastle-under-Lyme', 'Lancaster', 'Castleford'];
  assert.deepEqual(rankMatches('cast', items, fold), ['Castle Cary', 'Castleford', 'Newcastle', 'Newcastle-under-Lyme', 'Lancaster']);
  assert.deepEqual(rankMatches('c', items, fold), []);
  assert.deepEqual(rankMatches('NEW', items, fold, 1), ['Newcastle']);
  assert.deepEqual(rankMatches('zzz', items, fold), []);
});

test('searchPlaces: Kendal is found as a town, accents and case do not matter', () => {
  const [r] = searchPlaces('kendal');
  assert.equal(r.name, 'Kendal');
  assert.equal(r.kind, 'town');
  assert.equal(searchPlaces('KENDAL')[0].name, 'Kendal');
});

test('searchPlaces: at most 8, cities before towns on a shared prefix, counties and council areas are searchable', () => {
  assert.ok(searchPlaces('st').length <= 8);
  assert.equal(searchPlaces('birm')[0].name, 'Birmingham');
  assert.equal(searchPlaces('Kent')[0].kind, 'county');
  assert.ok(searchPlaces('Westmorland').some((r) => r.name === 'Westmorland and Furness'));
  assert.equal(searchPlaces('Westmorland').filter((r) => r.name === 'Westmorland and Furness').length, 1);
  assert.ok(searchPlaces('Tower Hamlets').some((r) => r.kind === 'council area' && r.detail === 'London'));
});

test('searchPlaces: postcode districts, partial or full, come first when the text has a digit', () => {
  assert.equal(searchPlaces('SE1')[0].name, 'SE1');
  assert.equal(searchPlaces('se1')[0].kind, 'postcode district');
  assert.ok(searchPlaces('m1').some((r) => r.name === 'M11'));
  assert.equal(searchPlaces('SE1 7PB')[0].name, 'SE1');
  assert.deepEqual(searchPlaces('x'), []);
  assert.deepEqual(searchPlaces('qqqqqq'), []);
});
