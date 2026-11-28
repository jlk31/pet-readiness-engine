import { safeFetch } from '@/lib/fetch-safe';
import { extractProduct, type Product } from '@/lib/product';
import { allowed, hash, ipFromHeaders } from '@/lib/ratelimit';
import { createClient } from '@/lib/supabase';
import { parseProductUrl } from '@/lib/validate';

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']; // no SVG: it can carry script
const DAY = 86_400_000;
const err = (error: string, status: number) => Response.json({ error }, { status });

// ponytail: per-instance memory cache (50 entries, 1 day). Serverless instances don't share it; use a DB table if hit rates matter.
const cache = new Map<string, { at: number; body: Omit<Product, 'image'> & { image: string | null } }>();

export async function POST(req: Request) {
  if (Number(req.headers.get('content-length') ?? 0) > 4096) return err('Request too large.', 400);
  const input = await req.json().catch(() => null);
  const url = parseProductUrl(input?.url);
  if (!url.ok) return err(url.error, 400);

  // Same limiter as the server actions, and the same stance when Supabase isn't configured: refuse (fail closed).
  const sb = await createClient();
  if (!sb) return err('Product lookup is not set up on this server yet.', 503);
  if (!(await allowed(sb, `product:ip:${hash(ipFromHeaders(req.headers))}`, 20, 600))) {
    return err('Too many lookups. Try again in a few minutes.', 429);
  }

  const hit = cache.get(url.value);
  if (hit && Date.now() - hit.at < DAY) return Response.json(hit.body);

  try {
    const page = await safeFetch(url.value, { maxBytes: 1_500_000, timeoutMs: 8000, accept: 'text/html,application/xhtml+xml' });
    if (page.status < 200 || page.status >= 300) throw new Error(`shop returned ${page.status}`);
    const product = extractProduct(page.body.toString('utf8'), page.url);
    if (!product) return err("We couldn't find a product on that page. Add the item by hand instead.", 422);

    let image: string | null = null;
    if (product.image) {
      // Returned as a data: URI so the CSP's img-src needs no new host. Any failure just means no picture.
      try {
        const img = await safeFetch(product.image, { maxBytes: 1_000_000, timeoutMs: 8000, accept: IMAGE_TYPES.join(',') });
        const type = img.type.split(';')[0].trim().toLowerCase();
        if (img.status === 200 && !img.truncated && IMAGE_TYPES.includes(type)) image = `data:${type};base64,${img.body.toString('base64')}`;
      } catch { /* picture is optional */ }
    }

    const body = { ...product, image };
    if (cache.size >= 50) cache.delete(cache.keys().next().value!);
    cache.set(url.value, { at: Date.now(), body });
    return Response.json(body);
  } catch (e) {
    console.error('product lookup failed', e instanceof Error ? e.message : e);
    return err("This shop doesn't allow its pages to be read. Add the item by hand instead.", 502);
  }
}
