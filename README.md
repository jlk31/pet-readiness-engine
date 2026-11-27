# pawprint-ledger

UK pet ownership cost & compatibility simulator. Next.js (App Router) + Supabase.

## Structure

Files marked ✓ exist; the rest is the target layout for upcoming phases.

```
app/
  layout.tsx
  page.tsx                     # landing + postcode/lifestyle form
  simulate/page.tsx            # readiness score + lifetime TCO chart (Recharts)
  compare/page.tsx             # 2–3 species side by side
  scenarios/page.tsx           # saved scenarios (auth)
  resume/[id]/page.tsx         # printable Landlord Pet Resume + checklist (window.print)
  api/location/route.ts        # Postcodes.io + Overpass proxy, cached with `revalidate`
components/                    # UI only, no business logic
lib/
  types.ts                   ✓ # mirrors the DB schema
  engine.ts                    # pure functions: readiness score, gap costs, lifetime projection
  location.ts                  # postcode -> region/lat-long, nearby vets/parks
  supabase.ts                  # @supabase/ssr server + browser clients
supabase/
  migrations/20261127000000_init.sql ✓
  seed.sql                   ✓
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
