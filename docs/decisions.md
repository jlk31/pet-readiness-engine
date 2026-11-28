# Decisions

- 2026-11-27: Money stored as integer pence. Avoids float rounding in the engine.
- 2026-11-27: `supabase/seed.json` is the single source of seed data; `seed.sql` is generated (`npm run seed:sql`).
- 2026-11-27: Artifact preview is a single self-contained HTML file built by `scripts/preview.mjs` (the artifact CSP blocks other hosts, so fonts and art must be inlined there).
- 2026-11-27: Emergency what-if: insured pets pay a flat £150 excess; uninsured pay the full bill inflated to the chosen year.
- 2026-11-28: All Supabase calls are server-side, so session cookies are httpOnly. Only the publishable key is used.
- 2026-11-28: Postcodes encrypted with AES-256-GCM in the app, bound to the owner's id.
- 2026-11-28: Login rate limiting lives in Postgres (`hit_rate_limit`), because server-side calls hide the user's IP from Supabase's own limits.
- 2026-11-28: Work is run Omega-style: Opus orchestrates, Haiku/Sonnet agents do the work, every brief has a "Done when:" check.

- 2026-11-28: Illustration assets come from two MIT-licensed Iconify sets, both open source and free to use: Fluent Emoji (Microsoft, `@iconify-json/fluent-emoji`, https://github.com/microsoft/fluentui-emoji/blob/main/LICENSE) for species art, and Phosphor (`@iconify-json/ph`, https://github.com/phosphor-icons/core/blob/main/LICENSE) for UI duotone icons. `scripts/gen-art.mjs` (`npm run art`) builds `lib/art.ts` from them: `SPECIES_ART` as data URIs and `ICONS` as raw SVG bodies that inherit currentColor.
- 2026-11-28: Anti-AI-look rules (from sinton.agency, Fountain Institute and MindStudio articles; Medium blocked): no emoji or icon decorating headings; no em dashes; no buzzwords or vague CTAs ("seamless", "unlock", "effortless", "Get started"); no blue/purple gradients, neon, aurora glows, rainbow side tabs, decorative status dots; no cards nested in cards; no copy-paste 3-column icon feature grids; even spacing scale; WCAG AA contrast; real meta description and Open Graph tags; buttons say what happens next.
