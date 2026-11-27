import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getUser, supabaseEnv } from '@/lib/supabase';
import LoginForm from './LoginForm';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ confirm?: string }> }) {
  const { user } = await getUser();
  if (user) redirect('/');
  const { confirm } = await searchParams;
  return (
    <LoginForm
      configured={!!supabaseEnv()}
      siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
      nonce={(await headers()).get('x-nonce') ?? undefined}
      confirmFailed={confirm === 'failed'}
    />
  );
}
