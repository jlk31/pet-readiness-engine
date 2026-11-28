// Pulls a product's name, image, price and key details out of a shop page's HTML.
// Pure: no network. Sources in priority order: JSON-LD Product, Open Graph / product meta, <title>.
// Regex + JSON.parse only (no HTML parser dependency); good enough for the structured data shops publish for search engines.

export interface Product {
  title: string;
  brand?: string;
  pricePence: number | null; // integer pence, GBP only
  currency?: string;
  image?: string; // absolute https URL
  description?: string; // max 160 chars
  url: string;
}

type Json = Record<string, unknown>;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', pound: '£' };
const decode = (s: string) =>
  s.replace(/&(?:#(\d{1,6})|#x([0-9a-f]{1,6})|([a-z]+));/gi, (m, d, x, n) => {
    const cp = d ? +d : x ? parseInt(x, 16) : undefined;
    if (cp !== undefined) return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    return ENTITIES[n.toLowerCase()] ?? m;
  });
/** Plain text: decode entities, drop tags, collapse whitespace, cap length. */
const clean = (v: unknown, max: number) => {
  if (typeof v !== 'string') return undefined;
  const s = decode(v).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return s ? (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s) : undefined;
};

const first = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v);
const str = (v: unknown, max = 200) => { const f = first(v); return clean(typeof f === 'object' && f ? (f as Json).name ?? (f as Json).url : f, max); };

/** "12.99", "£1,299.00", 12.99 -> number, or undefined. */
function amount(v: unknown): number | undefined {
  if (typeof v !== 'number' && typeof v !== 'string') return undefined;
  const n = parseFloat(String(v).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 && n < 1e7 ? n : undefined;
}

function productNodes(node: unknown, out: Json[], depth = 0) {
  if (depth > 5 || !node || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach((n) => productNodes(n, out, depth + 1));
  const o = node as Json;
  const types = ([] as unknown[]).concat(o['@type']);
  if (types.includes('Product') || types.includes('ProductGroup')) out.push(o);
  productNodes(o['@graph'], out, depth + 1);
}

/** First usable { price, currency } in an Offer / AggregateOffer / array of them (AggregateOffer uses lowPrice). */
function offer(v: unknown, depth = 0): { price?: unknown; currency?: unknown } | undefined {
  if (depth > 3 || !v || typeof v !== 'object') return undefined;
  if (Array.isArray(v)) { for (const x of v) { const r = offer(x, depth + 1); if (r) return r; } return undefined; }
  const o = v as Json;
  const spec = (o.priceSpecification ?? {}) as Json;
  const price = o.price ?? o.lowPrice ?? spec.price;
  if (amount(price) !== undefined) return { price, currency: o.priceCurrency ?? spec.priceCurrency };
  return offer(o.offers, depth + 1);
}

function jsonLdProduct(html: string): Json | undefined {
  const out: Json[] = [];
  for (const m of html.matchAll(/<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { productNodes(JSON.parse(m[1].trim()), out); } catch { /* malformed block: skip it */ }
  }
  return out[0];
}

function metaTags(html: string) {
  const meta = new Map<string, string>();
  for (const [tag] of html.matchAll(/<meta\b(?:"[^"]*"|'[^']*'|[^>"'])*>/gi)) {
    const attr: Record<string, string> = {};
    for (const a of tag.matchAll(/([a-z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) attr[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4];
    const key = (attr.property ?? attr.name ?? attr.itemprop)?.toLowerCase();
    if (key && attr.content !== undefined && !meta.has(key)) meta.set(key, attr.content);
  }
  return meta;
}

function absoluteHttps(v: unknown, base: string): string | undefined {
  const f = first(v);
  const raw = typeof f === 'object' && f ? (f as Json).url : f;
  if (typeof raw !== 'string') return undefined;
  try { const u = new URL(decode(raw.trim()), base); return u.protocol === 'https:' ? u.href : undefined; } catch { return undefined; }
}

/** Returns null when the page has a title but nothing product-like (no price, image or Product markup). */
export function extractProduct(html: string, pageUrl: string): Product | null {
  const ld = jsonLdProduct(html);
  const meta = metaTags(html);
  const m = (...keys: string[]) => keys.map((k) => meta.get(k)).find((v) => v !== undefined);
  const o = ld && (offer(ld.offers) ?? offer(first(ld.hasVariant))); // ProductGroup keeps prices on its variants

  const price = amount(o?.price) ?? amount(m('product:price:amount', 'og:price:amount'));
  const cur = [o?.currency, m('product:price:currency', 'og:price:currency')].map((c) => (typeof c === 'string' ? c.trim().toUpperCase() : '')).find((c) => /^[A-Z]{3}$/.test(c));
  const image = absoluteHttps(ld?.image, pageUrl) ?? absoluteHttps(m('og:image:secure_url', 'og:image'), pageUrl);
  const title = str(ld?.name, 120) ?? clean(m('og:title'), 120) ?? clean(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1], 120);

  if (!title || (!ld && price === undefined && !image)) return null;
  const p: Product = { title, pricePence: cur === 'GBP' && price !== undefined ? Math.round(price * 100) : null, url: pageUrl };
  const brand = str(ld?.brand, 80) ?? clean(m('product:brand', 'og:brand'), 80);
  const description = clean(ld?.description, 160) ?? clean(m('og:description', 'description'), 160);
  if (brand) p.brand = brand;
  if (cur) p.currency = cur;
  if (image) p.image = image;
  if (description) p.description = description;
  return p;
}
