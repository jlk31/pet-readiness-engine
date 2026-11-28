import { createHash } from 'node:crypto';
import type { createClient } from './supabase.ts';

export type Supabase = NonNullable<Awaited<ReturnType<typeof createClient>>>;

// Keys are hashed so the rate-limit table never stores emails or IPs.
export const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 40);

export function ipFromHeaders(h: Headers) {
  // ponytail: trusts the host's proxy headers (Vercel/Netlify set x-real-ip); behind another proxy, use its header
  return h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
}

/** Fails closed: if the limiter errors, the request is refused. */
export async function allowed(sb: Supabase, key: string, max: number, windowSeconds: number) {
  const { data, error } = await sb.rpc('hit_rate_limit', { p_key: key, p_max: max, p_window_seconds: windowSeconds });
  return !error && data === true;
}

// ponytail: per-instance memory limiter, only used when Supabase isn't configured; shared limits need the DB
const windows = new Map<string, { start: number; hits: number }>();

/** Same window rule as hit_rate_limit: a window resets once it is older than windowSeconds. */
export function memoryAllowed(key: string, max: number, windowSeconds: number, now = Date.now()) {
  const w = windows.get(key);
  if (!w || now - w.start > windowSeconds * 1000) {
    windows.delete(key);
    if (windows.size >= 10_000) windows.delete(windows.keys().next().value!);
    windows.set(key, { start: now, hits: 1 });
    return true;
  }
  w.hits++;
  return w.hits <= max;
}
