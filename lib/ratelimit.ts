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
