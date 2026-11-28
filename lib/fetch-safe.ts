// Fetches a user-supplied URL without letting it reach our own network (SSRF).
// Built on node:https, not global fetch, so the DNS check runs inside the socket's own lookup:
// the address we validate is the address we connect to, which defeats DNS rebinding.
import dns from 'node:dns';
import https from 'node:https';
import { isIP } from 'node:net';
import zlib from 'node:zlib';
import { parseProductUrl } from './validate.ts';

const v4 = (a: number, b: number) =>
  a === 0 || a === 10 || a === 127 || a >= 224 || // 0/8, 10/8, loopback, multicast + reserved
  (a === 100 && b >= 64 && b <= 127) ||           // CGNAT 100.64/10
  (a === 169 && b === 254) ||                     // link-local
  (a === 172 && b >= 16 && b <= 31) ||
  (a === 192 && b === 168) ||
  (a === 198 && (b === 18 || b === 19));          // benchmarking 198.18/15

/** True for any address we must never connect to (loopback, private, link-local, CGNAT, multicast, ULA, mapped forms of those). */
export function isBlockedIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) { const [a, b] = ip.split('.').map(Number); return v4(a, b); }
  if (kind !== 6) return true; // not an IP at all: refuse
  // Expand to eight 16-bit groups; a dotted tail (::ffff:1.2.3.4) becomes two groups.
  let s = ip.toLowerCase().split('%')[0];
  const tail = s.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (tail) s = s.slice(0, tail.index) + ((+tail[1] << 8) | +tail[2]).toString(16) + ':' + ((+tail[3] << 8) | +tail[4]).toString(16);
  const [head, rest] = s.split('::');
  const h = head ? head.split(':') : [];
  const t = rest === undefined ? [] : rest ? rest.split(':') : [];
  const g = [...h, ...Array(rest === undefined ? 0 : 8 - h.length - t.length).fill('0'), ...t].map((x) => parseInt(x, 16));
  const embedded = (hi: number) => v4(g[hi] >> 8, g[hi] & 255);
  if (g.slice(0, 5).every((x) => x === 0)) {
    if (g[5] === 0xffff || g[5] === 0) return embedded(6); // ::ffff:a.b.c.d, ::a.b.c.d; also :: and ::1 (a = 0)
  }
  return (
    (g[0] & 0xfe00) === 0xfc00 || // fc00::/7 unique local
    (g[0] & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (g[0] & 0xffc0) === 0xfec0 || // fec0::/10 site-local (deprecated)
    (g[0] & 0xff00) === 0xff00 || // multicast
    (g[0] === 0x2002 && embedded(1)) || // 6to4 wrapping a blocked IPv4
    (g[0] === 0x64 && g[1] === 0xff9b && embedded(6)) // NAT64 wrapping a blocked IPv4
  );
}

export class BlockedAddress extends Error {}

type Resolver = (host: string, opts: dns.LookupAllOptions, cb: (err: NodeJS.ErrnoException | null, addrs: dns.LookupAddress[]) => void) => void;

/** A `lookup` for https.request: resolves, then refuses if ANY returned address is blocked. */
export const safeLookup = (resolve: Resolver = dns.lookup as Resolver) =>
  ((host: string, opts: dns.LookupOptions, cb: (...a: unknown[]) => void) => {
    resolve(host, { family: opts.family, hints: opts.hints, all: true }, (err, addrs) => {
      if (err) return cb(err);
      if (!addrs.length || addrs.some((a) => isBlockedIp(a.address))) return cb(new BlockedAddress('blocked address'));
      if (opts.all) return cb(null, addrs);
      cb(null, addrs[0].address, addrs[0].family);
    });
  }) as unknown as typeof dns.lookup;

export interface SafeResponse { status: number; type: string; body: Buffer; truncated: boolean; url: string }
export interface SafeOptions { maxBytes: number; timeoutMs: number; accept: string; lookup?: typeof dns.lookup }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MAX_REDIRECTS = 3;

/** https only, port 443, max 3 redirects (each re-validated), one deadline for the whole call. Body is capped at maxBytes (`truncated` says if it was cut). */
export async function safeFetch(url: string, o: SafeOptions): Promise<SafeResponse> {
  const signal = AbortSignal.timeout(o.timeoutMs);
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const ok = parseProductUrl(current);
    if (!ok.ok) throw new BlockedAddress('url not allowed');
    const res = await get(ok.value, o, signal);
    if (res.status >= 300 && res.status < 400 && res.location) {
      current = new URL(res.location, ok.value).href;
      continue;
    }
    return { status: res.status, type: res.type, body: res.body, truncated: res.truncated, url: ok.value };
  }
  throw new Error('too many redirects');
}

function get(url: string, o: SafeOptions, signal: AbortSignal) {
  return new Promise<{ status: number; type: string; location?: string; body: Buffer; truncated: boolean }>((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname, port: 443, path: u.pathname + u.search, method: 'GET', signal,
        lookup: o.lookup ?? safeLookup(),
        headers: { 'User-Agent': UA, Accept: o.accept, 'Accept-Language': 'en-GB,en;q=0.8', 'Accept-Encoding': 'gzip, br' },
      },
      (res) => {
        const enc = res.headers['content-encoding'];
        // Decompress inside the byte cap, so a zip bomb can't exceed it.
        const src = enc === 'gzip' ? res.pipe(zlib.createGunzip()) : enc === 'br' ? res.pipe(zlib.createBrotliDecompress()) : res;
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        const done = () => resolve({
          status: res.statusCode ?? 0, type: String(res.headers['content-type'] ?? ''),
          location: res.headers.location, body: Buffer.concat(chunks), truncated,
        });
        src.on('data', (c: Buffer) => {
          if (truncated) return;
          size += c.length;
          if (size > o.maxBytes) {
            chunks.push(c.subarray(0, c.length - (size - o.maxBytes)));
            truncated = true;
            req.destroy(); // stop downloading; what we have is returned
            return done();
          }
          chunks.push(c);
        });
        src.on('end', () => !truncated && done());
        src.on('error', (e) => !truncated && reject(e));
        res.on('error', (e) => !truncated && reject(e));
        res.on('close', () => reject(new Error('connection closed'))); // no-op once resolved
      },
    );
    req.on('error', (e) => reject(e));
    req.end();
  });
}
