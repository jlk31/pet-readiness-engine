# Progress

## Done
- Phase 1: schema, UK seed data for 3 pets, TypeScript types.
- Phase 2: pure calculation engine + simulator page.
- Phase 3: nearby vets via Overpass (`/api/vets`).
- Phase 4: lifetime TCO and stress tests (insurance, emergency year, assumptions).
- Phase 5: side-by-side table, landlord resume and shopping checklist (print / copy).
- Accounts: Supabase sign-in, saved scenarios, security hardening (RLS, grants, encryption, rate limits, CSP, CI scans).
- Omega orchestration setup (CLAUDE.md, docs, agents, reflect skill, compaction at 40%).
- Redesign: Satoshi everywhere, Fluent Emoji + Phosphor art (MIT), editorial hero, illustrated species tiles, bento results, warm paper/vermillion palette (light + dark).
- Exact-location Google map (follows system theme); anti-AI-look pass (game-icons silhouettes, plain copy, flat layout); shopping checklist with product links, quantities, kit toggles and live total.

## Next
- Connect Supabase so the product link reader (rate-limited) works; add a Google Maps key.
- Connect a real Supabase project and test sign-in end to end.
- Parks near the postcode for dogs; more species in seed.json.

## Log
- 2026-11-27: Phases 1–5 built and pushed.
- 2026-11-28: Supabase accounts + security hardening. Omega setup added.
- 2026-11-28: Redesign via orchestrated workers (2 Haiku builders, Sonnet engineer, Sonnet reviewer); every check rerun by the orchestrator.
- 2026-11-28: Map, anti-AI pass, product link reader (SSRF-safe) and shopping list; tested against the user's real Max & Woody's and Moonbox pages.
