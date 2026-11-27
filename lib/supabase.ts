import 'server-only';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Supabase is only ever called from the server, so session cookies can be httpOnly (no JS access).
export const COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
};

/** The publishable (anon) key is public by design; RLS + grants protect the data. No service-role key is used anywhere. */
export function supabaseEnv() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : null;
}

export async function createClient() {
  const env = supabaseEnv();
  if (!env) return null; // app still runs without accounts (local dev, previews)
  const store = await cookies();
  return createServerClient(env.url, env.key, {
    cookieOptions: COOKIE_OPTIONS,
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, { ...options, ...COOKIE_OPTIONS });
        } catch {
          // Server Components can't set cookies; proxy.ts refreshes the session instead.
        }
      },
    },
  });
}

/** Verified user: getUser() checks the JWT with Supabase Auth (getSession() would trust the cookie). */
export async function getUser() {
  const sb = await createClient();
  if (!sb) return { sb: null, user: null };
  const { data } = await sb.auth.getUser();
  return { sb, user: data.user };
}
