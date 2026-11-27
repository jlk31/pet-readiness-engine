'use server';

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { encrypt } from '@/lib/crypto';
import { createClient, getUser } from '@/lib/supabase';
import { isUuid, parseCredentials, parseScenario } from '@/lib/validate';

export type FormState = { error?: string; message?: string };

type Supabase = NonNullable<Awaited<ReturnType<typeof createClient>>>;
const NOT_CONFIGURED = { error: 'Accounts are not set up on this server yet.' };

// Keys are hashed so the rate-limit table never stores emails or IPs.
const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 40);

async function clientIp() {
  const h = await headers();
  // ponytail: trusts the host's proxy headers (Vercel/Netlify set x-real-ip); behind another proxy, use its header
  return h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
}

/** Fails closed: if the limiter errors, the request is refused. */
async function allowed(sb: Supabase, key: string, max: number, windowSeconds: number) {
  const { data, error } = await sb.rpc('hit_rate_limit', { p_key: key, p_max: max, p_window_seconds: windowSeconds });
  return !error && data === true;
}

const captcha = (form: FormData) => (form.get('cf-turnstile-response') as string | null) ?? undefined;

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const sb = await createClient();
  if (!sb) return NOT_CONFIGURED;
  const c = parseCredentials(form);
  if (!c.ok) return { error: c.error };
  const ip = hash(await clientIp());
  if (!(await allowed(sb, `login:ip:${ip}`, 20, 600)) || !(await allowed(sb, `login:email:${hash(c.value.email)}`, 5, 600))) {
    return { error: 'Too many sign-in attempts. Wait 10 minutes and try again.' };
  }
  const { error } = await sb.auth.signInWithPassword({ ...c.value, options: { captchaToken: captcha(form) } });
  // One message for every failure, so attackers can't tell which emails have accounts.
  if (error) return { error: 'Email or password is incorrect, or the email is not confirmed yet.' };
  redirect('/');
}

export async function signUp(_: FormState, form: FormData): Promise<FormState> {
  const sb = await createClient();
  if (!sb) return NOT_CONFIGURED;
  const c = parseCredentials(form);
  if (!c.ok) return { error: c.error };
  if (!(await allowed(sb, `signup:ip:${hash(await clientIp())}`, 5, 3600))) {
    return { error: 'Too many sign-ups from your network. Try again in an hour.' };
  }
  const site = process.env.SITE_URL; // fixed, never the request's Host header
  const { error } = await sb.auth.signUp({
    ...c.value,
    options: { captchaToken: captcha(form), emailRedirectTo: site ? `${site}/auth/confirm` : undefined },
  });
  if (error?.code === 'weak_password') return { error: 'That password is too easy to guess. Choose a longer or less common one.' };
  if (error && error.code !== 'user_already_exists') return { error: 'Sign-up failed. Check your details and try again.' };
  return { message: 'Check your email for a link to confirm your account.' };
}

export async function signOut() {
  const sb = await createClient();
  await sb?.auth.signOut();
  redirect('/');
}

export async function saveScenario(input: unknown): Promise<FormState> {
  const { sb, user } = await getUser();
  if (!sb) return NOT_CONFIGURED;
  if (!user) return { error: 'Sign in to save scenarios.' };
  const s = parseScenario(input);
  if (!s.ok) return { error: s.error };
  if (!(await allowed(sb, `save:${user.id}`, 30, 3600))) return { error: 'You have saved a lot recently. Try again later.' };
  const { error } = await sb.from('saved_scenarios').insert({ ...s.value, postcode: encrypt(s.value.postcode, user.id) });
  if (error) {
    console.error('save scenario failed', error.code);
    return { error: 'Could not save. Try again.' };
  }
  revalidatePath('/scenarios');
  return { message: `Saved "${s.value.name}".` };
}

export async function deleteScenario(form: FormData) {
  const id = form.get('id');
  const { sb, user } = await getUser();
  if (!sb || !user || !isUuid(id)) return;
  // RLS already limits this to the owner; the user_id filter is a second guard.
  await sb.from('saved_scenarios').delete().eq('id', id).eq('user_id', user.id);
  revalidatePath('/scenarios');
}
