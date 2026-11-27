# pawprint-ledger

UK pet ownership cost & compatibility simulator. Next.js (App Router) + Supabase.

## Structure

Files marked ✓ exist; the rest is the target layout for upcoming phases.

```
app/
  layout.tsx                 ✓
  page.tsx                   ✓ # simulator: lifestyle form, score, 2–3 pet comparison, lifetime chart
  scenarios/page.tsx           # saved scenarios (auth)
  resume/[id]/page.tsx         # printable Landlord Pet Resume + checklist (window.print)
  api/vets/route.ts          ✓ # Overpass vet search near a lat/lon, cached a week per ~100m
components/Simulator.tsx     ✓ # UI only, no business logic
lib/
  types.ts                   ✓ # mirrors the DB schema
  engine.ts                  ✓ # pure functions: readiness score, gap costs, lifetime projection
  engine.test.ts             ✓
  data.ts                    ✓ # reads seed.json until Supabase is linked
  location.ts                ✓ # postcode -> region + lat/lon; Overpass results -> nearest vets
  location.test.ts           ✓
  supabase.ts                  # @supabase/ssr server + browser clients
supabase/
  migrations/20261127000000_init.sql ✓
  seed.json                  ✓ # source of truth for seed data
  seed.sql                   ✓ # generated: npm run seed:sql
scripts/
  gen-seed.mjs               ✓
  preview.mjs                ✓ # npm run preview:html -> dist/preview.html (single self-contained page)
```

## Commands

```bash
npm run dev           # http://localhost:3000
npm test              # engine tests (node:test, no framework)
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

## Environment

- `OVERPASS_URL` (optional): Overpass endpoint for the vet search. Defaults to `https://overpass-api.de/api/interpreter`; set a mirror if the public server is overloaded.
