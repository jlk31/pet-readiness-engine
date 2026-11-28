# Known issues

- Overpass (`overpass-api.de`) drops the connection from the cloud sandbox even when allowed. Test vet search locally, or use `OVERPASS_URL` for a mirror.
- `next start` sets `x-forwarded-proto: http`, so the HTTPS redirect in `proxy.ts` skips localhost on purpose.
- Every page must render per request (`dynamic = 'force-dynamic'` in the root layout); static pages get no CSP nonce and their scripts are blocked.
- `pkill -f "next start"` doesn't stop the server; the process is `next-server`.
- The artifact viewer blocks fetch to other hosts and `window.print()`; postcode lookup and Print don't work in the artifact preview.
- WebFetch can fail on DNS for hosts the curl proxy allows; fall back to `curl` and parse locally.
