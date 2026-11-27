# pawprint-ledger

UK pet ownership cost & compatibility simulator. Next.js (App Router) + Supabase.

## Structure

Files marked ✓ exist; the rest is the target layout for upcoming phases.

```
app/
  layout.tsx                 ✓
  page.tsx                   ✓ # simulator: lifestyle form, score, 2–3 pet comparison, lifetime chart
  scenarios/page.tsx         ✓ # saved scenarios (signed-in only)
  login/                     ✓ # sign in / create account (+ optional Turnstile)
  auth/confirm/route.ts      ✓ # email confirmation link target
  actions.ts                 ✓ # server actions: auth, save/delete scenario (validated, rate-limited)
  api/vets/route.ts          ✓ # Overpass vet search near a lat/lon, cached a week per ~100m
components/
  Simulator.tsx              ✓ # form, cards, side-by-side table, chart, vets, breakdown
  Resume.tsx                 ✓ # Landlord Pet Resume + shopping checklist (print / copy as text)
lib/
  types.ts                   ✓ # mirrors the DB schema
  engine.ts                  ✓ # pure functions: readiness score, gap costs, lifetime projection
  engine.test.ts             ✓
  data.ts                    ✓ # reads seed.json until Supabase is linked
  location.ts                ✓ # postcode -> region + lat/lon; Overpass results -> nearest vets
  location.test.ts           ✓
  supabase.ts                ✓ # server-only Supabase client, httpOnly session cookies
  validate.ts                ✓ # server-side validation for every client input
  crypto.ts                  ✓ # AES-256-GCM for postcodes at rest
  security.test.ts           ✓
proxy.ts                     ✓ # CSP nonce, security headers, HTTPS redirect, session refresh
supabase/
  migrations/20261127000000_init.sql ✓
  seed.json                  ✓ # source of truth for seed data
  seed.sql                   ✓ # generated: npm run seed:sql
  tests/security.sql         ✓ # RLS / grants attack test (psql against local Supabase)
scripts/
  gen-seed.mjs               ✓
  preview.mjs                ✓ # npm run preview:html -> dist/preview.html (single self-contained page)
```

## Commands

```bash
npm run dev           # http://localhost:3000
npm test              # engine, validation and crypto tests (node:test)
npm run audit         # dependency vulnerability scan
npm run seed:sql      # regenerate seed.sql after editing seed.json
npm run preview:html  # bundle the simulator into one HTML file
```

The engine stays as pure functions in `lib/engine.ts`, which can be tested without a DB or UI.

## Database

```bash
supabase db reset   # applies migrations + seed.sql
```

- Money is stored in integer pence.
- `cost_items.service` decides which `regional_multipliers` row applies (null = national price).
- `cost_items.trigger` marks gap costs added by the scorer (e.g. dog walker when `hours_out_per_day > max_hours_alone`).
- `per_night` and `emergency` items only feed the what-if toggles.
- Regions are matched on Postcodes.io `region` (England) or `country` (Scotland/Wales/NI); a missing row means a multiplier of 1.00.

## Accounts setup (Supabase)

The app runs without Supabase (accounts and saving are hidden). To enable them:

1. Create a Supabase project, then `supabase link` and `supabase db push` (applies both migrations), and run `supabase/seed.sql`.
2. Copy `.env.example` to `.env.local` and fill it in. See that file for what each variable is; only `SCENARIO_ENCRYPTION_KEY` is secret.
3. In the Supabase dashboard:
   - **Authentication > Providers > Email:** keep "Confirm email" on, and set the minimum password length to 10.
   - **Authentication > URL Configuration:** Site URL = `SITE_URL`, and add `SITE_URL/auth/confirm` to Redirect URLs.
   - **Authentication > Email Templates > Confirm signup:** link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`.
   - **Attack Protection:** enable CAPTCHA (Turnstile) with your Turnstile secret key if you set `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, and turn on leaked password protection if your plan has it.
4. Test the database rules against a local stack: `supabase start && supabase db reset`, then
   `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/security.sql` (prints PASS).

## Security

| Item | How |
|---|---|
| Hide API keys | Only `SCENARIO_ENCRYPTION_KEY` is secret; it has no `NEXT_PUBLIC_` prefix, so it is never sent to the browser. Real values live in `.env.local` (git-ignored). |
| Purge git secrets | Full history scanned: no secrets were ever committed. gitleaks runs in CI on every push. |
| Public DB key | Only the publishable (anon) key is used. No service-role key exists in the app. |
| RLS | Enabled on every table. Scenarios have one owner-only policy per operation. |
| Encrypt sensitive data | Postcodes are AES-256-GCM encrypted in the app before saving, bound to the owner's id. Supabase also encrypts the disk at rest. |
| Server-side auth | All Supabase calls run on the server. The user is verified with `auth.getUser()` (checked by Supabase Auth), never trusted from the cookie. |
| Lock record access | RLS owner policies, plus a `user_id` filter on deletes. `supabase/tests/security.sql` checks one user can't read, change or delete another's rows. |
| Block field tampering | Column-level grants: clients can't write `id`, `user_id` or `created_at`. Server validation rebuilds objects from known fields only. |
| Secure session cookies | `httpOnly`, `Secure` in production, `SameSite=Lax`. |
| Hash passwords | Supabase Auth stores bcrypt hashes. Passwords never touch our database. |
| Rate limit login | Postgres-backed limiter: sign-in 5 per email and 20 per IP per 10 minutes, sign-up 5 per IP per hour, saves 30 per user per hour. It fails closed. Supabase's own Auth rate limits also apply. |
| Bot protection | Cloudflare Turnstile on sign-in and sign-up, verified by Supabase (set `NEXT_PUBLIC_TURNSTILE_SITE_KEY`). |
| Parameterised queries | All DB access goes through supabase-js/PostgREST (parameterised). The only SQL function uses bound parameters and an empty `search_path`. |
| Validate all input | `lib/validate.ts` on every server action, length/type checks in the DB, UK bounding box on `/api/vets`. |
| Escape user content | React escapes all output; there is no `dangerouslySetInnerHTML`. Website links from OpenStreetMap are limited to `http(s)`. |
| Restrict file uploads | The app has no uploads and no storage buckets. Add size/type checks and bucket policies if uploads are ever added. |
| Trim API responses | Pages select only the columns they show. `/api/vets` returns only displayed fields. Error messages are generic. |
| Security headers | Nonce-based CSP with `strict-dynamic`, HSTS, nosniff, `frame-ancestors 'none'`/X-Frame-Options, Referrer-Policy, Permissions-Policy, COOP. `X-Powered-By` is removed. |
| Force HTTPS | 308 redirect in `proxy.ts`, HSTS (preload-ready) and `upgrade-insecure-requests`. |
| Scan dependencies | `npm audit` in CI (fails on high severity) and weekly Dependabot updates. |

## Environment

All variables are documented in `.env.example`.
