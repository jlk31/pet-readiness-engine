import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitWithin, forStorage, isAllowedImage, loadItems, money, parsePounds, safeUrl, sanitizeItem, shoppingText, totals, type ShopItem } from './shopping.ts';

test('parsePounds', () => {
  const ok: [string, number][] = [['12', 1200], ['12.5', 1250], ['12.50', 1250], ['£12.99', 1299], ['1,299.00', 129900], ['0.07', 7], [' 5 ', 500], ['100000', 10_000_000]];
  for (const [s, p] of ok) assert.equal(parsePounds(s), p, s);
  for (const s of ['-1', '12.999', 'abc', '', '12.', '.5', '1,29', '100000.01', '1e3', '99999999999999999999']) assert.equal(parsePounds(s), null, s);
});

const item = (o: Partial<ShopItem>): ShopItem => ({ id: 'a', title: 'Bed', pricePence: 1000, image: null, qty: 1, ...o });

test('totals: kit selection plus products times quantity', () => {
  const kit = [{ name: 'Bowls', amount: 1500, on: true }, { name: 'Toys', amount: 800, on: false }, { name: 'Lead', amount: 1299, on: true }];
  const items = [item({ pricePence: 1999, qty: 3 }), item({ id: 'b', pricePence: null, qty: 2 })];
  assert.deepEqual(totals(kit, items), { kitCount: 2, kitPence: 2799, productCount: 5, productPence: 5997, unpriced: 1, total: 8796 });
  assert.equal(totals([], []).total, 0);
});

test('money and plain text', () => {
  assert.equal(money(129900), '£1,299.00');
  const text = shoppingText([{ name: 'Bowls', amount: 1500, on: true }, { name: 'Toys', amount: 800, on: false }], [item({ brand: 'Snug', pricePence: 500, qty: 3, url: 'https://shop.example/x' })]);
  assert.match(text, /- Bowls: £15\.00/);
  assert.doesNotMatch(text, /Toys/);
  assert.match(text, /- Bed, Snug: £15\.00 \(3 x £5\.00\) https:\/\/shop\.example\/x/);
  assert.match(text, /Total: £30\.00$/);
});

test('only http(s) links and safe images survive', () => {
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('https://a.example/p?q=1'), 'https://a.example/p?q=1');
  const bad = sanitizeItem({ title: 'X', url: 'javascript:alert(1)', image: 'data:image/svg+xml;base64,PHN2Zz4=', pricePence: -5, qty: 500 });
  assert.equal(bad?.url, undefined);
  assert.equal(bad?.image, null);
  assert.equal(bad?.pricePence, null);
  assert.equal(bad?.qty, 99);
  assert.equal(sanitizeItem({ title: '  ' }), null);
});

test('storage: junk is ignored, capped at 50, big images dropped', () => {
  assert.deepEqual(loadItems('not json'), []);
  assert.deepEqual(loadItems('{"a":1}'), []);
  assert.equal(loadItems(JSON.stringify(Array.from({ length: 60 }, (_, i) => ({ title: `p${i}` })))).length, 50);
  const small = 'data:image/png;base64,AAAA';
  const big = `data:image/png;base64,${'A'.repeat(300_001)}`;
  const saved = JSON.parse(forStorage([item({ image: small }), item({ id: 'b', image: big })]));
  assert.deepEqual(saved.map((s: ShopItem) => s.image), [small, null]);
  assert.equal(JSON.parse(forStorage([item({ image: small })], false))[0].image, null);
});

test('isAllowedImage: type allowlist and 8 MB cap', () => {
  assert.equal(isAllowedImage('image/png', 1000), true);
  for (const t of ['image/jpeg', 'image/webp', 'image/gif', 'image/avif']) assert.equal(isAllowedImage(t, 1), true, t);
  assert.equal(isAllowedImage('image/svg+xml', 1000), false);
  assert.equal(isAllowedImage('text/plain', 1000), false);
  assert.equal(isAllowedImage('', 1000), false);
  assert.equal(isAllowedImage('image/png', 8 * 1024 * 1024), true);
  assert.equal(isAllowedImage('image/png', 9 * 1024 * 1024), false);
  assert.equal(isAllowedImage('image/png', 0), false);
});

test('fitWithin: scales the long side down, never up', () => {
  assert.deepEqual(fitWithin(1000, 500, 192), [192, 96]);
  assert.deepEqual(fitWithin(500, 1000, 192), [96, 192]);
  assert.deepEqual(fitWithin(100, 50, 192), [100, 50]);
  assert.deepEqual(fitWithin(192, 192, 192), [192, 192]);
  assert.deepEqual(fitWithin(5000, 10, 192), [192, 1]);
});
