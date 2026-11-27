'use client';

import Script from 'next/script';
import { useActionState, useEffect } from 'react';
import { signIn, signUp, type FormState } from '../actions';

declare global { interface Window { turnstile?: { reset: () => void } } }

export default function LoginForm({ configured, siteKey, nonce, confirmFailed }: {
  configured: boolean; siteKey?: string; nonce?: string; confirmFailed: boolean;
}) {
  const [inState, signInAction, signingIn] = useActionState<FormState, FormData>(signIn, {});
  const [upState, signUpAction, signingUp] = useActionState<FormState, FormData>(signUp, {});
  const state = signingIn || signingUp ? {} : { ...upState, ...inState };
  // Turnstile tokens are single-use: get a fresh one after every attempt.
  useEffect(() => window.turnstile?.reset(), [inState, upState]);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 py-12 pl-[max(16px,env(safe-area-inset-left,0px))] pr-[max(16px,env(safe-area-inset-right,0px))]">
      <a href="/" className="text-sm font-semibold text-accent">← Back to the simulator</a>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-extrabold">Sign in</h1>
        <p className="text-muted">Save scenarios and come back to them later.</p>
      </div>
      {!configured ? (
        <p className="rounded-xl border border-line bg-surface p-5 text-sm text-warn">
          Accounts are not set up on this server yet. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (see README).
        </p>
      ) : (
        <form className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
          <label htmlFor="email" className="flex flex-col gap-1 text-sm font-semibold">Email
            <input id="email" name="email" type="email" required maxLength={254} autoComplete="email"
              className="rounded-md border border-line bg-bg px-3 py-2 font-normal" />
          </label>
          <label htmlFor="password" className="flex flex-col gap-1 text-sm font-semibold">Password
            <input id="password" name="password" type="password" required minLength={10} maxLength={72} autoComplete="current-password"
              className="rounded-md border border-line bg-bg px-3 py-2 font-normal" />
            <span className="font-normal text-muted">At least 10 characters.</span>
          </label>
          {siteKey && (
            <>
              <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" nonce={nonce} />
              <div className="cf-turnstile" data-sitekey={siteKey} />
            </>
          )}
          {confirmFailed && !state.error && !state.message && <p className="text-sm text-bad">That confirmation link has expired or was already used. Sign up again to get a new one.</p>}
          {state.error && <p className="text-sm text-bad" role="alert">{state.error}</p>}
          {state.message && <p className="text-sm text-good" role="status">{state.message}</p>}
          <div className="flex flex-wrap gap-2">
            <button formAction={signInAction} disabled={signingIn || signingUp} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg disabled:opacity-60">
              {signingIn ? 'Signing in…' : 'Sign in'}
            </button>
            <button formAction={signUpAction} disabled={signingIn || signingUp} className="rounded-md border border-line px-4 py-2 text-sm font-semibold disabled:opacity-60">
              {signingUp ? 'Creating account…' : 'Create account'}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
