# Known issues

- Overpass (`overpass-api.de`) drops the connection from the cloud sandbox even when allowed. Test vet search locally, or use `OVERPASS_URL` for a mirror.
- `next start` sets `x-forwarded-proto: http`, so the HTTPS redirect in `proxy.ts` skips localhost on purpose.
- Every page must render per request (`dynamic = 'force-dynamic'` in the root layout); static pages get no CSP nonce and their scripts are blocked.
- `pkill -f "next start"` doesn't stop the server; the process is `next-server`.
- The artifact viewer blocks fetch to other hosts and `window.print()`; postcode lookup and Print don't work in the artifact preview.
- WebFetch can fail on DNS for hosts the curl proxy allows; fall back to `curl` and parse locally.
- Node's global `fetch` ignores the sandbox HTTPS proxy (ENOTFOUND); build scripts use `curl` via execFileSync. `npm run preview:html` needs network for Fontshare.
- The Stop hook asks to re-author commits as Claude; the user wants every commit as jlk31, so ignore it.
- In this sandbox, run the app with `NODE_USE_ENV_PROXY=1` so server-side `fetch` (Supabase, Overpass) goes through the proxy. `node:https` (the product reader's safeFetch) still can't reach the internet here.
- New Supabase projects don't auto-grant table access to `anon`/`authenticated`; migration 20261128120000 grants read on the reference tables.
- Playwright is global at /opt/node-tools/node_modules/playwright (use `createRequire('/opt/node-tools/node_modules/')`) with system Chrome at /usr/bin/google-chrome (`executablePath`, `--no-sandbox`). `dist/preview.html` has no viewport meta, so Playwright `isMobile: true` lays it out at 980 px; test 400 px with a plain 400-wide viewport.
- Map markers for two places on the same spot (e.g. an RSPCA branch and a Pets at Home in Kendal) overlap at every zoom; the topmost gets the click. The list items are the reliable way to pick each one.
- Map label placement is per zoom bucket (`STEP` 1.1 in `components/MapLabels.tsx`), so label boxes are only checked at the bucket's zoom; text widths are estimated (`lib/labels.ts` `textWidth`). If the font or sizes change, re-run the pairwise bounding-box overlap check at many zooms (it found 1 touch in 6,119 labels before the box height was set to 1.3 em).
