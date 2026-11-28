# pawprint-ledger

UK pet ownership cost & compatibility simulator. Next.js (App Router) + Supabase.

## Structure

Files marked ✓ exist; the rest is the target layout for upcoming phases.

```
app/
  layout.tsx                 ✓
  page.tsx                   ✓ # simulator: lifestyle form, score, 2 or 3 pet comparison, lifetime chart
  scenarios/page.tsx         ✓ # saved scenarios (signed-in only)
  login/                     ✓ # sign in / create account (+ optional Turnstile)
  auth/confirm/route.ts      ✓ # email confirmation link target
  actions.ts                 ✓ # server actions: auth, save/delete scenario (validated, rate-limited)
  api/vets/route.ts          ✓ # Overpass vet search near a lat/lon, cached a week per ~100m
  api/product/route.ts       ✓ # POST {url}: shop page -> name, image (data: URI), price in pence; SSRF-guarded, 20 per IP per 10 min
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
  validate.ts                ✓ # server-side validation for every client input (incl. product links)
  product.ts                 ✓ # pure: product name/price/image from JSON-LD, Open Graph or <title>
  fetch-safe.ts              ✓ # https fetch that refuses private/loopback addresses at connect time
  ratelimit.ts               ✓ # hit_rate_limit helpers shared by server actions and API routes
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
   - **Authentication > Email Templates > Confirm signup (optional, paid plan or custom SMTP):** link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`. On the free plan the default template works too: `/auth/confirm` also accepts the PKCE `code` it sends.
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
| Restrict file uploads | Nothing is uploaded to the server and there are no storage buckets. Product pictures are chosen (or pasted) locally, checked by type (PNG, JPEG, WebP, GIF, AVIF; no SVG), size (8 MB) and by actually decoding them, then downscaled to 192px in the browser and kept in the browser only. Add server-side checks and bucket policies if uploads are ever added. |
| Trim API responses | Pages select only the columns they show. `/api/vets` returns only displayed fields. Error messages are generic. |
| Security headers | Permissions-Policy blocks camera, microphone, payment and USB, and allows geolocation for this site only ("Use my location"). Nonce-based CSP with `strict-dynamic`, HSTS, nosniff, `frame-ancestors 'none'`/X-Frame-Options, Referrer-Policy, Permissions-Policy, COOP. `X-Powered-By` is removed. |
| Force HTTPS | 308 redirect in `proxy.ts`, HSTS (preload-ready) and `upgrade-insecure-requests`. |
| SSRF protection | `/api/product` fetches user-supplied links only through `lib/fetch-safe.ts`: https and port 443 only, no credentials or IP-literal hosts, and DNS is resolved inside the socket's own `lookup`, which refuses loopback, private, link-local, CGNAT, multicast and ULA addresses (and IPv4-mapped forms), so DNS rebinding can't slip past. Redirects (max 3) are re-checked, 8 s timeout, 1.5 MB page / 1 MB image caps, SVG images refused, 20 lookups per IP per 10 minutes (fails closed). Images are returned as `data:` URIs so the CSP is unchanged. |
| Scan dependencies | `npm audit` in CI (fails on high severity) and weekly Dependabot updates. |

## Environment

All variables are documented in `.env.example`.

### Exact-location map (optional)

Set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` to show a Google map under the postcode box. Users click the map or drag the pin to set an exact spot; the nearest postcode (Postcodes.io) fills the postcode field and sets the region, and the vet search uses the exact point. Without the key, a built-in UK region map (ONS boundaries, no external requests) is shown instead.

- Create a **browser** key (Google Cloud > APIs & Services > Credentials), enable the **Maps JavaScript API**, and restrict the key by **HTTP referrer** to your site URL (and `localhost:3000/*` for development) and by API to the Maps JavaScript API. The key ships to the browser, so the referrer restriction is what protects it.
- Optionally set `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` to a map ID from Google Cloud (Map Management); it falls back to `DEMO_MAP_ID`. A map ID is required for the pin and for the map to follow the system light/dark theme.
- Privacy: the exact point stays in the browser. Only the existing `/api/vets` query receives it; saved scenarios still store just the encrypted postcode. `proxy.ts` allows the Google hosts the Maps JS CSP guide lists.
- The artifact preview (`npm run preview:html`) always uses the built-in region map; Google scripts cannot load there.

## Credits

Pet silhouettes are from [game-icons.net](https://game-icons.net) by Lorc, Delapouite and contributors, licensed [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). UI icons are [Phosphor](https://github.com/phosphor-icons/core) (MIT). Both reach the app through `npm run art`, which writes `lib/art.ts`.

The built-in UK map (shown without a Google key, and always in the artifact preview) is drawn from ONS Open Geography Portal boundaries (Regions and Countries, December 2025, ultra-generalised), simplified by `node scripts/gen-uk-map.mjs` into `lib/uk-map.ts`. Contains National Statistics and OS data &copy; Crown copyright and database right 2026, under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).

Offline lookups (postcode districts, Local Authority Districts, nearest animal shelter and pet shop) come from bundled data built by `npm run data`. Postcode district centroids are from the ONS Postcode Directory via [Postcodes.io](https://postcodes.io), and district outlines are ONS Local Authority Districts (May 2026, ultra-generalised); both are Contains National Statistics and OS data &copy; Crown copyright and database right 2026, Royal Mail data &copy; Royal Mail copyright and database right 2026, under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/). Shelter and pet shop locations are &copy; [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the [Open Database Licence](https://opendatacommons.org/licenses/odbl/1-0/).
