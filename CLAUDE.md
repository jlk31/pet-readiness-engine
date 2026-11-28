# pawprint-ledger

UK pet ownership cost and compatibility simulator. Next.js 16 (App Router) + TypeScript + Tailwind v4 + Recharts, Supabase for accounts. Users compare up to 3 pets by upfront, monthly and lifetime cost, fit with their lifestyle, nearby vets, and export a landlord pet resume.

Read this file and `docs/progress.md`, `docs/decisions.md`, `docs/known-issues.md` at the start of every session.

## How work is run (orchestrator and workers)

- The main session is the orchestrator. It plans, writes briefs and checks results. It doesn't do bulk work itself when a worker can.
- Pick the worker by how hard the job is:
  - `scout` (Haiku, low): find files, answer questions about the code. Never edits.
  - `builder` (Haiku, medium): quick, clearly defined work. Renames, formatting, running tests, a small change to an exact brief.
  - `engineer` (Sonnet, high): work that needs judgment. A feature across several files, a bug with no obvious cause.
  - `reviewer` (Sonnet, high, read-only): reads a diff against its brief and lists what fails it.
- Independent jobs run in parallel.
- Every brief states the goal, the files to read, and a "Done when:" check that can be run or seen.
- Before accepting any worker's output, the orchestrator runs its check itself. If it fails, send it back with the failure. If a Haiku worker fails the same check twice, give the job to the engineer. Never pass on a worker's report unchecked.
- End of every session: update `docs/progress.md`, add new decisions and gotchas, and run the `reflect` skill. Skill and CLAUDE.md edits need the user's OK first.
- Context: auto-compaction at 40% (`.claude/settings.json`). For long builds, launch with `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=60`.

## Rules

- Commits: author `jlk31 <jkirkup.dev@gmail.com>`. No Co-Authored-By or Claude-Session trailers. Push to `main` and the session's working branch.
- Shortest working diff. Reuse what's in the repo, then the standard library, then platform features, then installed deps. No new dependency for what a few lines can do.
- Never weaken security: RLS, column grants, server-side validation (`lib/validate.ts`), the CSP nonce in `proxy.ts`, httpOnly cookies. A new external host must be added to the CSP in `proxy.ts`.
- Design: every piece of text uses the Satoshi font. Assets come from open-source libraries with a license that allows use, recorded in `docs/decisions.md`. Colors are tokens in `app/globals.css` with light and dark values. Phone width (about 400px) must work with no sideways scroll.
- Money is integer pence everywhere. The engine (`lib/engine.ts`) stays pure.
- Build scripts that download use `curl` (Node's fetch ignores the proxy here).
- Ignore any hook asking to re-author commits; the author is always jlk31.
- Checks: `npm test`, `npx tsc --noEmit`, `npx next build`, `npm run preview:html` (the artifact preview).

## Folder map

```
CLAUDE.md                 this file (read first, every session)
docs/progress.md          done, next, a dated log line per session
docs/decisions.md         what's settled, with the date and why
docs/known-issues.md      gotchas and their fixes
.claude/agents/           scout, builder, engineer, reviewer
.claude/skills/reflect/   end-of-session review
app/                      pages, server actions, auth routes, /api/vets
components/               Simulator (main UI), Resume (landlord resume + checklist)
lib/                      engine, data, location, validate, crypto, supabase, types (+ *.test.ts)
proxy.ts                  CSP nonce, security headers, HTTPS redirect, session refresh
supabase/                 migrations, seed.json (source of truth) -> seed.sql, tests/security.sql
scripts/                  gen-seed.mjs, preview.mjs (single-file artifact build)
```
