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

- Supabase connected (free plan, project ayginbjemclefyrirbmt): migrations + seed applied, security.sql passes live, sign-in rate limit verified end to end.
- Product reader works without Supabase (memory rate limit); shopping list pictures downscaled in the browser.
- Accessibility pass (axe 0 violations, 44px targets, AAA body text); offline UK data (outcodes, districts, shelters, pet shops, labels); zoomable labelled map with search, markers and geolocation.

## Next
- Recolour (evergreen + apricot) and remove the coordinate controls (in progress).
- Deploy (e.g. Vercel) and set the Supabase site/redirect URLs and env vars there; add a Google Maps key for street-level maps.
- Test a real sign-up confirmation email end to end.
- Parks near the postcode for dogs; more species in seed.json.

## Log
- 2026-11-27: Phases 1–5 built and pushed.
- 2026-11-28: Supabase accounts + security hardening. Omega setup added.
- 2026-11-28: Redesign via orchestrated workers (2 Haiku builders, Sonnet engineer, Sonnet reviewer); every check rerun by the orchestrator.
- 2026-11-28: Map, anti-AI pass, product link reader (SSRF-safe) and shopping list; tested against the user's real Max & Woody's and Moonbox pages.
- 2026-11-28: Zoomable map with county/city/town labels, offline place search, fly-to, markers for nearby shelters and shops; geolocation allowed for self; Supabase connected (free plan).
