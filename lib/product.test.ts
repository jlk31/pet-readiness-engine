import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractProduct } from './product.ts';

const PAGE = 'https://shop.example.co.uk/beds/cosy-bed';

const jsonLd = `<html><head><title>ignored | Shop</title>
<meta property="og:title" content="OG title loses to JSON-LD">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
  {"@type":"WebSite","name":"Shop"},
  {"@type":["Product","Thing"],"name":"Cosy Donut Bed &amp; Blanket","brand":{"@type":"Brand","name":"Snuggle"},
   "description":"<p>Soft  &lt;b&gt;calming&lt;/b&gt; bed.</p> ${'x'.repeat(200)}",
   "image":[{"@type":"ImageObject","url":"/img/bed.jpg"},"https://cdn.example.com/other.jpg"],
   "offers":{"@type":"AggregateOffer","lowPrice":"12.99","highPrice":"29.99","priceCurrency":"GBP","offerCount":3}}
]}</script></head><body></body></html>`;

test('extractProduct: JSON-LD @graph + AggregateOffer', () => {
  const p = extractProduct(jsonLd, PAGE)!;
  assert.equal(p.title, 'Cosy Donut Bed & Blanket');
  assert.equal(p.brand, 'Snuggle');
  assert.equal(p.pricePence, 1299);
  assert.equal(p.currency, 'GBP');
  assert.equal(p.image, 'https://shop.example.co.uk/img/bed.jpg');
  assert.equal(p.url, PAGE);
  assert.ok(p.description!.length <= 160 && p.description!.startsWith('Soft calming bed.') && !p.description!.includes('<'));
});

test('extractProduct: JSON-LD offers array, numeric price, price in priceSpecification', () => {
  const ld = (offers: unknown) => `<script type="application/ld+json">${JSON.stringify([{ '@type': 'Product', name: 'Bowl', offers }])}</script>`;
  assert.equal(extractProduct(ld([{ '@type': 'Offer', price: 4.5, priceCurrency: 'GBP' }]), PAGE)!.pricePence, 450);
  assert.equal(extractProduct(ld({ priceSpecification: { price: '1,299.10', priceCurrency: 'GBP' } }), PAGE)!.pricePence, 129910);
  assert.equal(extractProduct(ld({ price: '19.99' }), PAGE)!.pricePence, null); // no currency: never guess
});

test('extractProduct: Open Graph only', () => {
  const html = `<head><title>Fallback</title>
    <meta property='og:title' content='Scratch Post &#8211; Tall'>
    <meta property="og:image" content="//cdn.example.com/p.png">
    <meta content="24.995" property="product:price:amount"><meta property="product:price:currency" content="gbp">
    <meta name="description" content="A tall post."></head>`;
  const p = extractProduct(html, PAGE)!;
  assert.deepEqual(p, { title: 'Scratch Post – Tall', pricePence: 2500, currency: 'GBP', image: 'https://cdn.example.com/p.png', description: 'A tall post.', url: PAGE });
});

test('extractProduct: non-GBP keeps currency but no pence; http image dropped; title falls back to <title>', () => {
  const html = `<title> Dog Coat\n | Store </title><meta property="og:price:amount" content="39.00"><meta property="og:price:currency" content="USD"><meta property="og:image" content="http://cdn.example.com/a.jpg">`;
  const p = extractProduct(html, PAGE)!;
  assert.equal(p.title, 'Dog Coat | Store');
  assert.equal(p.pricePence, null);
  assert.equal(p.currency, 'USD');
  assert.equal(p.image, undefined);
});

test('extractProduct: caps title at 120, ignores bad JSON-LD, null when nothing product-like', () => {
  const long = extractProduct(`<script type="application/ld+json">{oops</script><meta property="og:title" content="${'a'.repeat(300)}"><meta property="og:image" content="https://x.example.com/i.jpg">`, PAGE)!;
  assert.equal(long.title.length, 120);
  assert.equal(extractProduct('<title>About us</title><p>Hello</p>', PAGE), null);
  assert.equal(extractProduct('', PAGE), null);
});
