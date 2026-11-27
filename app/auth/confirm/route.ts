import { type EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase';

const TYPES: EmailOtpType[] = ['signup', 'email', 'recovery', 'email_change'];

// Target of the confirmation email link. Always redirects to a fixed local path (no open redirect).
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const token_hash = p.get('token_hash');
  const type = p.get('type') as EmailOtpType | null;
  const sb = await createClient();
  if (sb && token_hash && token_hash.length < 200 && type && TYPES.includes(type)) {
    const { error } = await sb.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(new URL('/', req.url));
  }
  return NextResponse.redirect(new URL('/login?confirm=failed', req.url));
}
