// Shopping checklist maths and (un)trusted-data cleaning. Pure, no I/O. Money is integer pence.
import type { Pence } from './types';

export const MAX_PRODUCTS = 50;
export const MAX_QTY = 99;
export const MAX_PENCE: Pence = 10_000_000; // £100,000
export const MAX_SAVED_IMAGE = 300_000; // safety net: chars of data URI kept in localStorage (downscaled pictures are ~10-40 KB)
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']; // no SVG: it can carry script
export const MAX_PICTURE_BYTES = 8 * 1024 * 1024;
export const PICTURE_SIDE = 192; // longest side, px, of every stored product picture

export interface ShopItem {
  id: string;
  title: string;
  brand?: string;
  pricePence: Pence | null; // null = not found / not set yet
  image: string | null; // data: URI
  description?: string;
  url?: string; // http(s) only
  qty: number;
}

/** "12", "12.5", "£1,299.00" -> pence. null for anything else: negatives, more than 2 decimals, text, over £100,000. */
export function parsePounds(s: string): Pence | null {
  const m = /^£?\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/.exec(s.trim());
  if (!m) return null;
  const p = Number(m[1].replace(/,/g, '')) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return p <= MAX_PENCE ? p : null;
}

export const money = (p: Pence) => `£${(p / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The URL if it is http(s), else null. Anything rendered as a link goes through this. */
export function safeUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  try { const u = new URL(v.trim()); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null; } catch { return null; }
}

export const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, '');

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** A picked file is worth decoding only if its type is on the list and it is 1 byte to 8 MB. */
export const isAllowedImage = (type: string, size: number) => IMAGE_TYPES.includes(type) && size > 0 && size <= MAX_PICTURE_BYTES;

/** Size that fits w x h inside max x max, same shape, never enlarged, at least 1px. */
export function fitWithin(w: number, h: number, max: number): [number, number] {
  const k = Math.min(1, max / Math.max(w, h));
  return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
}

const IMAGE = /^data:image\/(?:png|jpeg|webp|gif|avif);base64,[A-Za-z0-9+/=]+$/; // no SVG: it can carry script
const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);

/** Turns an API response or a localStorage entry into a ShopItem, or null if it has no usable title. */
export function sanitizeItem(x: unknown): ShopItem | null {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const title = text(o.title, 120);
  if (!title) return null;
  const p = o.pricePence;
  const qty = Number(o.qty);
  const url = safeUrl(o.url);
  const brand = text(o.brand, 80);
  const description = text(o.description, 160);
  return {
    id: text(o.id, 40) ?? newId(),
    title,
    ...(brand && { brand }),
    pricePence: typeof p === 'number' && Number.isInteger(p) && p >= 0 && p <= MAX_PENCE ? p : null,
    image: typeof o.image === 'string' && IMAGE.test(o.image) ? o.image : null,
    ...(description && { description }),
    ...(url && { url }),
    qty: Number.isInteger(qty) && qty >= 1 ? Math.min(qty, MAX_QTY) : 1,
  };
}

export function loadItems(raw: string | null): ShopItem[] {
  let a: unknown;
  try { a = JSON.parse(raw ?? '[]'); } catch { return []; }
  return Array.isArray(a) ? a.slice(0, MAX_PRODUCTS).flatMap((x) => sanitizeItem(x) ?? []) : [];
}

/** What goes to localStorage. Pictures are downscaled before this; the size cap is only a safety net (tile falls back to a placeholder). */
export const forStorage = (items: ShopItem[], keepImages = true) =>
  JSON.stringify(items.map((i) => ({ ...i, image: keepImages && i.image && i.image.length <= MAX_SAVED_IMAGE ? i.image : null })));

export interface KitLine { name: string; amount: Pence; on: boolean }

export function totals(kit: KitLine[], items: ShopItem[]) {
  const picked = kit.filter((k) => k.on);
  const kitPence = picked.reduce((t, k) => t + k.amount, 0);
  const productPence = items.reduce((t, i) => t + (i.pricePence ?? 0) * i.qty, 0);
  return {
    kitCount: picked.length,
    kitPence,
    productCount: items.reduce((t, i) => t + i.qty, 0),
    productPence,
    unpriced: items.filter((i) => i.pricePence === null).length,
    total: kitPence + productPence,
  };
}

const n = (c: number) => `${c} ${c === 1 ? 'item' : 'items'}`;

/** Plain-text version of the checklist, for "Copy as text". */
export function shoppingText(kit: KitLine[], items: ShopItem[]): string {
  const t = totals(kit, items);
  return [
    'Shopping checklist',
    ...kit.filter((k) => k.on).map((k) => `- ${k.name}: ${money(k.amount)}`),
    ...items.map((i) => {
      const unit = i.pricePence === null ? 'price not set' : `${money(i.pricePence * i.qty)}${i.qty > 1 ? ` (${i.qty} x ${money(i.pricePence)})` : ''}`;
      return `- ${i.title}${i.brand ? `, ${i.brand}` : ''}: ${unit}${i.url ? ` ${i.url}` : ''}`;
    }),
    `Starter kit (${n(t.kitCount)}): ${money(t.kitPence)}`,
    `Your products (${n(t.productCount)}): ${money(t.productPence)}`,
    `Total: ${money(t.total)}`,
  ].join('\n');
}
