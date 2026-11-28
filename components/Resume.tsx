'use client';

import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent } from 'react';
import { gbp, type Simulation } from '@/lib/engine';
import {
  MAX_PICTURE_BYTES, MAX_PRODUCTS, MAX_QTY, PICTURE_SIDE, fitWithin, forStorage, hostOf, isAllowedImage, loadItems, money, parsePounds, safeUrl, sanitizeItem, shoppingText, totals, type ShopItem,
} from '@/lib/shopping';
import type { Lifestyle, SpeciesWithCosts } from '@/lib/types';
import Icon from './Icon';

/** Money with the pence muted: £12 then .99 in the muted colour. */
function Pounds({ p }: { p: number }) {
  const [whole, pence] = money(p).split('.');
  return <>{whole}<span className="text-muted">.{pence}</span></>;
}

const LEVEL = ['', 'very low', 'low', 'moderate', 'high', 'very high'];
// The artifact preview can't open a print dialog; scripts/preview.mjs sets this.
const CAN_PRINT = process.env.NEXT_PUBLIC_PREVIEW !== '1';

export default function Resume({ sp, sim, life, region, onClose }: {
  sp: SpeciesWithCosts; sim: Simulation; life: Lifestyle; region: string; onClose: () => void;
}) {
  const [owner, setOwner] = useState('');
  const [petName, setPetName] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const doc = useRef<HTMLDivElement>(null);
  const intro = useRef<HTMLElement>(null);
  const todo = useRef<HTMLDivElement>(null);
  const key = `pawprint-shopping:${sp.id}`;
  const [items, setItems] = useState<ShopItem[]>(() => { try { return loadItems(localStorage.getItem(key)); } catch { return []; } });
  const [pick, setPick] = useState<Record<number, boolean>>({}); // kit lines the user changed; the rest follow is_essential
  const [manual, setManual] = useState<{ url: string } | null>(null);

  const active = sim.lines.filter((l) => l.active);
  const walker = active.find((l) => l.item.trigger === 'left_alone_too_long');
  const boarding = active.find((l) => l.item.frequency === 'per_night');
  const health = active.filter((l) => l.item.service === 'vet' && (l.item.frequency === 'monthly' || l.item.frequency === 'annual'));
  const kit = active.filter((l) => l.item.frequency === 'one_off');
  const kitLines = kit.map((l) => ({ id: l.item.id, name: l.item.name, amount: l.amount, on: pick[l.item.id] ?? l.item.is_essential, optional: !l.item.is_essential }));
  const sum = totals(kitLines, items);
  const full = items.length >= MAX_PRODUCTS;
  const add = (p: ShopItem | null) => { if (p) setItems((a) => [...a, p].slice(0, MAX_PRODUCTS)); };
  const edit = (id: string, patch: Partial<ShopItem>) => setItems((a) => a.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const pet = petName.trim() || `my ${sp.name.split(' (')[0].toLowerCase()}`;

  useEffect(() => {
    // Storage can be blocked or full: try with pictures, then without, then give up quietly.
    try { localStorage.setItem(key, forStorage(items)); } catch { try { localStorage.setItem(key, forStorage(items, false)); } catch { /* not saved */ } }
  }, [key, items]);

  async function copy() {
    const text = [intro.current?.innerText, shoppingText(kitLines, items), todo.current?.innerText].filter(Boolean).join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied('Copied. Paste it into an email or document.');
    } catch {
      // Clipboard refused (some embedded views): select the text so the user can copy it.
      const range = document.createRange();
      if (doc.current) range.selectNodeContents(doc.current);
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(range);
      setCopied('Copying is blocked here. The text is selected: press Ctrl+C or ⌘C.');
    }
  }

  return (
    <main className={`mx-auto flex max-w-[44rem] flex-col gap-6 py-8 ${PAGE_X}`}>
      <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <button type="button" onClick={onClose} className="link">← Back to comparison</button>
          <div className="flex flex-wrap gap-2">
            {/* One filled button per view: Print where the browser can print, Copy where it cannot. */}
            <button type="button" onClick={copy} className={CAN_PRINT ? 'btn-ghost' : 'btn'}>Copy as text</button>
            {CAN_PRINT && <button type="button" onClick={() => window.print()} className="btn">Print / Save as PDF</button>}
          </div>
        </div>
        {copied && <p className="text-muted" role="status">{copied}</p>}
        {sim.readiness.issues.filter((i) => i.severity === 'blocker').map((i) => (
          <p key={i.message} className="text-bad"><span className="font-bold">Blocker.</span> Before you send this: {i.message} (fit score {sim.readiness.score})</p>
        ))}
        <div className="grid gap-3 sm:grid-cols-2">
          <label htmlFor="owner" className="flex flex-col gap-1 font-semibold">Your name
            <input id="owner" value={owner} onChange={(e) => setOwner(e.target.value)} className="field font-normal" />
          </label>
          <label htmlFor="pet-name" className="flex flex-col gap-1 font-semibold">Pet's name (if you know it)
            <input id="pet-name" value={petName} onChange={(e) => setPetName(e.target.value)} className="field font-normal" />
          </label>
        </div>
      </div>

      <div ref={doc} className="flex flex-col gap-8 rounded-card border border-line bg-surface p-4 sm:p-6 print:border-0 print:p-0">
        <article ref={intro} className="flex max-w-[70ch] flex-col gap-5">
          <header className="flex flex-col gap-1 border-b border-line pb-4">
            <p className="font-bold text-accent">Landlord pet resume</p>
            <h1 className="font-display text-[clamp(2rem,5vw,3rem)] font-bold leading-tight tracking-tight">{petName.trim() || sp.name}</h1>
            <p className="text-muted">
              {petName.trim() ? `${sp.name}. ` : ''}Prepared by {owner.trim() || '[your name]'} on {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.
            </p>
          </header>

          <Section title="About the pet">
            <li>Typical lifespan {sp.lifespan_years} years.</li>
            <li>Noise: {LEVEL[sp.noise_level]}. Allergen and shedding: {LEVEL[sp.allergen_level]}.</li>
            {sp.housing === 'flat_ok' && <li>Suited to flat living.</li>}
            {sp.kind === 'reptile' && <li>Lives in a sealed vivarium; no contact with carpets or furnishings.</li>}
          </Section>

          <Section title="Care plan">
            {walker ? (
              <li>A daily dog walker is budgeted ({gbp(walker.amount)}/month), so {pet} is never left longer than {sp.max_hours_alone} hours.</li>
            ) : life.hours_out_per_day <= sp.max_hours_alone ? (
              <li>{cap(pet)} will not be left alone longer than {sp.max_hours_alone} hours, the recommended limit.</li>
            ) : (
              <li>Someone in my household covers the hours I am out, so {pet} is not left longer than {sp.max_hours_alone} hours.</li>
            )}
            {boarding && <li>When I am away, {pet} goes to {boarding.item.name.toLowerCase()}; never left unattended.</li>}
            {health.map((l) => <li key={l.item.id}>{l.item.name}{l.item.frequency === 'monthly' ? ', monthly' : ', every year'}.</li>)}
            {sp.microchip_required && <li>Microchipped with my current contact details, as the law requires.</li>}
          </Section>

          <Section title="Money set aside">
            <li>Budgeted {gbp(sim.monthly)} a month for food, care and treatment in {region}.</li>
            <li>{sim.insured ? `Pet insurance in place; I cover the ${gbp(sim.emergency)} excess on any claim.` : `Emergency fund of ${gbp(sim.emergency)} set aside for vet bills.`}</li>
          </Section>

          {sp.legal_notes && <p className="text-muted">{sp.legal_notes}</p>}
          <p className="text-sm text-muted">
            Under the Renters&apos; Rights Act 2025 (England), tenants can ask to keep a pet and landlords must not unreasonably refuse.
            I&apos;m happy to agree reasonable conditions in writing.
          </p>
        </article>

        <article className="flex flex-col gap-6 border-t border-line pt-6 print:break-before-page print:border-0">
          <h2 className="font-display text-2xl font-semibold">Shopping checklist</h2>

          <div className="flex flex-col gap-3 print:hidden">
            {full ? (
              <p className="text-muted">You have {MAX_PRODUCTS} products, the most this list holds. Remove one to add another.</p>
            ) : (
              <>
                {process.env.NEXT_PUBLIC_PREVIEW !== '1' && <LinkForm onAdd={add} onFail={(url) => setManual({ url })} />}
                {manual ? (
                  <ManualForm key={manual.url} url={manual.url} onAdd={(p) => { add(p); setManual(null); }} onCancel={() => setManual(null)} />
                ) : (
                  <button type="button" onClick={() => setManual({ url: '' })} className="link self-start">Add by hand</button>
                )}
              </>
            )}
          </div>

          <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-1">
              <h3 className="font-semibold">Starter kit</h3>
              <p className="max-w-[70ch] text-muted print:hidden">Tick what you plan to buy. Untick a line to swap it for your own product.</p>
              <ul className="flex flex-col border-t border-line">
                {kitLines.map((l) => (
                  <li key={l.id} className={`border-b border-line ${l.on ? '' : 'text-muted print:hidden'}`}>
                    <label className="flex min-h-12 cursor-pointer items-center gap-3 py-2">
                      <input type="checkbox" checked={l.on} onChange={(e) => setPick((p) => ({ ...p, [l.id]: e.target.checked }))} className="print:hidden" />
                      <span aria-hidden className="hidden size-3.5 shrink-0 rounded-sm border border-muted print:inline-block" />
                      <span className="min-w-0 flex-1">{l.name}{l.optional && <span className="text-muted"> (optional)</span>}</span>
                      <span className="min-w-[6ch] text-right tabular-nums"><Pounds p={l.amount} /></span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>

            <section className={`flex flex-col gap-1 ${items.length ? '' : 'print:hidden'}`}>
              <h3 className="font-semibold">Your products</h3>
              {items.length === 0 ? (
                <p className="border-t border-line pt-3 text-muted">Nothing added yet. Paste a product link or add an item by hand.</p>
              ) : (
                <ul className="flex flex-col border-t border-line">
                  {items.map((it) => (
                    <ProductRow key={it.id} it={it} kind={sp.kind} set={(patch) => edit(it.id, patch)} remove={() => setItems((a) => a.filter((i) => i.id !== it.id))} />
                  ))}
                </ul>
              )}
            </section>

            <div className="dock sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 border-x-0 border-b-0 px-4 pb-[max(.75rem,env(safe-area-inset-bottom,0px))] pt-3 sm:static sm:mx-0 sm:px-0 print:static print:mx-0 print:border-x-0 print:px-0">
              <dl className="flex flex-col gap-1">
                <div className="flex justify-between gap-3"><dt className="text-muted">Starter kit ({sum.kitCount} {sum.kitCount === 1 ? 'item' : 'items'})</dt><dd className="tabular-nums"><Pounds p={sum.kitPence} /></dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">Your products ({sum.productCount} {sum.productCount === 1 ? 'item' : 'items'})</dt><dd className="tabular-nums"><Pounds p={sum.productPence} /></dd></div>
              </dl>
              <div aria-live="polite" aria-atomic="true" className="flex items-baseline justify-between gap-3">
                <span className="font-bold">Total</span>
                <span className="font-display text-3xl font-bold tabular-nums"><Pounds p={sum.total} /></span>
              </div>
              {sum.unpriced > 0 && <p className="text-sm text-muted">{sum.unpriced} {sum.unpriced === 1 ? 'product has' : 'products have'} no price yet and {sum.unpriced === 1 ? 'is' : 'are'} not counted.</p>}
            </div>
          </div>

          <div ref={todo} className="flex flex-col gap-4">
            <h3 className="font-semibold">Before day one</h3>
            <ul className="flex max-w-[70ch] flex-col gap-1">
              {life.renting && <Todo>Get written consent from your landlord (attach this resume).</Todo>}
              <Todo>Register with a vet{sp.kind === 'reptile' || sp.kind === 'bird' ? ' that treats exotics' : ''}.</Todo>
              {sim.insured && <Todo>Buy pet insurance from day one, before any condition counts as pre-existing.</Todo>}
              {sp.microchip_required && <Todo>Update the microchip database with your details.</Todo>}
              {walker && <Todo>Book a dog walker and trial a walk before your first full workday.</Todo>}
            </ul>
          </div>
        </article>
      </div>
    </main>
  );
}

const PAGE_X = 'pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))]';
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      <ul className="flex list-disc flex-col gap-1 pl-5">{children}</ul>
    </section>
  );
}

function Todo({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-baseline gap-3">
      <span aria-hidden className="inline-block size-3.5 shrink-0 rounded-sm border border-muted" />
      <span>{children}</span>
    </li>
  );
}

const PRICE_HINT = 'Enter a price in pounds, like 12.99. Up to 2 decimals, no more than £100,000.';

// Only rendered outside the artifact preview, so the preview bundle has no /api/product call.
function LinkForm({ onAdd, onFail }: { onAdd: (p: ShopItem | null) => void; onFail: (url: string) => void }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const u = url.trim();
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch('/api/product', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: u }) });
      const body = await res.json().catch(() => null);
      const item = res.ok ? sanitizeItem(body) : null;
      if (item) {
        item.image = item.image && await downscale(item.image).catch(() => null); // small enough to always be saved
        onAdd(item); setUrl(''); setMsg(`Added ${item.title}.`); return;
      }
      setMsg(res.ok ? "We couldn't read that product. Add the item by hand instead." : body?.error ?? 'Something went wrong. Add the item by hand instead.');
      if (res.ok || [422, 502, 503].includes(res.status)) onFail(u);
    } catch {
      setMsg('The product lookup could not be reached. Add the item by hand instead.');
      onFail(u);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label htmlFor="product-url" className="font-bold">Add a product from a link</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input id="product-url" type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://shop.example/dog-bed" className="field min-w-0 flex-1" />
        <button type="submit" disabled={busy} aria-busy={busy} className="btn-ghost">{busy ? 'Adding product…' : 'Add product'}</button>
      </div>
      <p role="status" className="text-sm text-muted empty:hidden">{msg}</p>
    </form>
  );
}

const loadImage = (src: string) => new Promise<HTMLImageElement>((ok, no) => {
  const i = new Image();
  i.onload = () => (i.naturalWidth ? ok(i) : no(new Error('empty')));
  i.onerror = () => no(new Error('decode'));
  i.src = src;
});

/** Decodes a data: URI (rejects if it is not a real image) and re-encodes it at most PICTURE_SIDE px: webp, or jpeg where toDataURL has no webp. */
async function downscale(src: string): Promise<string> {
  const img = await loadImage(src);
  const [w, h] = fitWithin(img.naturalWidth, img.naturalHeight, PICTURE_SIDE);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0, w, h);
  const webp = c.toDataURL('image/webp', 0.82);
  if (webp.startsWith('data:image/webp')) return webp;
  g.globalCompositeOperation = 'destination-over'; // jpeg has no transparency: put the picture on white
  g.fillStyle = '#fff';
  g.fillRect(0, 0, w, h);
  return c.toDataURL('image/jpeg', 0.82);
}

/** Optional picture for a product. Local only: the file is validated, decoded and shrunk in the browser, never sent anywhere. */
function PictureField({ id, image, onChange }: { id: string; image: string | null; onChange: (v: string | null) => void }) {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function take(f: File | undefined) {
    if (!f) return;
    setErr('');
    if (!isAllowedImage(f.type, f.size)) {
      return setErr(f.size > MAX_PICTURE_BYTES ? 'That picture is over 8 MB. Choose a smaller one.' : 'Choose a PNG, JPEG, WebP, GIF or AVIF picture. SVG files are not accepted.');
    }
    setBusy(true);
    try {
      const url = await new Promise<string>((ok, no) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result));
        r.onerror = () => no(r.error);
        r.readAsDataURL(f);
      });
      onChange(await downscale(url));
    } catch {
      setErr("That file couldn't be read as a picture. Choose a different one.");
    } finally {
      setBusy(false);
    }
  }
  const paste = (e: ClipboardEvent) => {
    const f = [...e.clipboardData.files].find((x) => x.type.startsWith('image/'));
    if (f) { e.preventDefault(); take(f); }
  };

  return (
    <div onPaste={paste} className="flex flex-col gap-1">
      <label htmlFor={id} className="font-bold">Picture (optional)</label>
      {image && (
        <div className="flex items-center gap-3">
          <img src={image} alt="Chosen picture" className="size-16 shrink-0 rounded-control border border-line object-cover" />
          <button type="button" onClick={() => onChange(null)} className="link">Remove picture</button>
        </div>
      )}
      <input id={id} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" aria-busy={busy}
        onChange={(e) => { take(e.target.files?.[0]); e.target.value = ''; }}
        className="min-w-0 text-sm text-muted file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-control file:border file:border-fg file:bg-transparent file:px-5 file:py-2 file:font-bold file:text-fg hover:file:bg-fg hover:file:text-bg" />
      <p className="text-xs text-muted">Or click here and paste an image (Ctrl+V or ⌘V). It stays on this device.</p>
      <p role="status" className="text-sm text-bad empty:hidden">{err}</p>
    </div>
  );
}

function ManualForm({ url, onAdd, onCancel }: { url: string; onAdd: (p: ShopItem) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [link, setLink] = useState(url);
  const [image, setImage] = useState<string | null>(null);
  const [err, setErr] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    const pence = parsePounds(price);
    if (!name.trim()) return setErr('Enter a name for the item.');
    if (pence === null) return setErr(PRICE_HINT);
    if (link.trim() && !safeUrl(link)) return setErr('The link must start with http:// or https://.');
    const item = sanitizeItem({ title: name, pricePence: pence, url: link, image, qty: 1 });
    if (item) onAdd(item);
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 border-t border-line pt-3">
      <p className="font-bold">Add by hand</p>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <label className="flex flex-col gap-1 font-semibold">Name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus className="field font-normal" />
        </label>
        <label className="flex flex-col gap-1 font-semibold">Price in £
          <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="12.99" className="field font-normal" />
        </label>
      </div>
      <label className="flex flex-col gap-1 font-semibold">Link to the shop (optional)
        <input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" className="field font-normal" />
      </label>
      <PictureField id="pic-new" image={image} onChange={setImage} />
      <p role="status" className="text-sm text-bad empty:hidden">{err}</p>
      <div className="flex gap-2">
        <button type="submit" className="btn-ghost">Add item</button>
        <button type="button" onClick={onCancel} className="btn-ghost">Cancel</button>
      </div>
    </form>
  );
}

function ProductRow({ it, kind, set, remove }: { it: ShopItem; kind: string; set: (p: Partial<ShopItem>) => void; remove: () => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [pic, setPic] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const link = safeUrl(it.url);
  const meta = [it.brand, link && hostOf(link)].filter(Boolean).join(' · ');
  const clamp = (n: number) => set({ qty: Math.min(MAX_QTY, Math.max(1, n)) });

  function startEdit() {
    setTitle(it.title);
    setPrice(it.pricePence === null ? '' : (it.pricePence / 100).toFixed(2));
    setPic(it.image);
    setErr('');
    setEditing(true);
  }
  function save(e: FormEvent) {
    e.preventDefault();
    const pence = price.trim() === '' ? null : parsePounds(price);
    if (!title.trim()) return setErr('Enter a name for the item.');
    if (pence === null && price.trim() !== '') return setErr(PRICE_HINT);
    set({ title: title.trim().slice(0, 120), pricePence: pence, image: pic });
    setEditing(false);
  }
  function setPriceOnly(e: FormEvent) {
    e.preventDefault();
    const pence = parsePounds(price);
    if (pence === null) return setErr(PRICE_HINT);
    set({ pricePence: pence });
    setPrice('');
    setErr('');
  }

  const text = 'font-semibold underline-offset-4';
  return (
    <li className="grid grid-cols-[4rem_minmax(0,1fr)] items-start gap-x-3 gap-y-3 border-b border-line py-4 sm:grid-cols-[4rem_minmax(0,1fr)_auto] print:grid-cols-[2.5rem_minmax(0,1fr)_auto] print:break-inside-avoid print:py-2">
      {it.image ? (
        <img src={it.image} alt={it.title} className="aspect-square w-16 rounded-control border border-line object-cover print:w-10" />
      ) : (
        <div className="grid aspect-square w-16 place-items-center rounded-control border border-line bg-bg text-muted print:w-10"><Icon name={kind} className="size-8 print:size-5" /></div>
      )}

      {editing ? (
        <form onSubmit={save} noValidate className="flex min-w-0 flex-col gap-3 sm:col-span-2">
          <label className="flex flex-col gap-1 font-semibold">Name
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className="field font-normal" />
          </label>
          <label className="flex flex-col gap-1 font-semibold">Price in £
            <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className="field font-normal sm:w-40" />
          </label>
          <PictureField id={`pic-${it.id}`} image={pic} onChange={setPic} />
          <p role="status" className="text-sm text-bad empty:hidden">{err}</p>
          <div className="flex gap-2">
            <button type="submit" className="btn-ghost">Save changes</button>
            <button type="button" onClick={() => setEditing(false)} className="btn-ghost">Cancel</button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex min-w-0 flex-col gap-0.5">
            {link ? (
              <a href={link} target="_blank" rel="noopener noreferrer" className={`${text} line-clamp-2 underline decoration-line hover:decoration-fg`}>{it.title}</a>
            ) : (
              <span className={`${text} line-clamp-2`}>{it.title}</span>
            )}
            {meta && <p className="truncate text-xs text-muted">{meta}</p>}
            {it.description && <p className="hidden truncate text-xs text-muted sm:block print:hidden">{it.description}</p>}
          </div>

          <div className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-2 sm:col-span-1 sm:flex-col sm:items-end print:col-span-1 print:flex-col print:items-end">
            <p className="hidden text-sm text-muted print:block">Qty {it.qty}</p>
            <div className="inline-flex items-center rounded-control border border-edge print:hidden">
              <button type="button" aria-label={`Decrease quantity of ${it.title}`} disabled={it.qty <= 1} onClick={() => clamp(it.qty - 1)} className="size-11 cursor-pointer text-xl font-bold hover:bg-line disabled:cursor-not-allowed disabled:opacity-40">−</button>
              <input type="number" min={1} max={MAX_QTY} inputMode="numeric" aria-label={`Quantity of ${it.title}`} value={it.qty}
                onChange={(e) => e.target.value !== '' && clamp(Math.trunc(Number(e.target.value)))}
                className="h-11 w-12 bg-transparent text-center tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
              <button type="button" aria-label={`Increase quantity of ${it.title}`} disabled={it.qty >= MAX_QTY} onClick={() => clamp(it.qty + 1)} className="size-11 cursor-pointer text-xl font-bold hover:bg-line disabled:cursor-not-allowed disabled:opacity-40">+</button>
            </div>

            {it.pricePence === null ? (
              <form onSubmit={setPriceOnly} noValidate className="ml-auto flex flex-col items-end gap-1 sm:ml-0">
                <p className="font-semibold">Price not found</p>
                <div className="flex gap-2 print:hidden">
                  <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="£" aria-label={`Price in £ for ${it.title}`} className="field w-24" />
                  <button type="submit" className="btn-ghost">Set price</button>
                </div>
                <p role="status" className="max-w-56 text-right text-xs text-bad empty:hidden">{err}</p>
              </form>
            ) : (
              <p className="ml-auto flex flex-col items-end sm:ml-0">
                <span className="min-w-[6ch] text-right font-bold tabular-nums"><Pounds p={it.pricePence * it.qty} /></span>
                {it.qty > 1 && <span className="text-sm text-muted tabular-nums"><Pounds p={it.pricePence} /> each</span>}
              </p>
            )}

            <div className="flex basis-full gap-4 sm:basis-auto print:hidden">
              <button type="button" onClick={startEdit} aria-label={`Edit ${it.title}`} className="link">Edit</button>
              <button type="button" onClick={remove} aria-label={`Remove ${it.title}`} className="link">Remove</button>
            </div>
          </div>
        </>
      )}
    </li>
  );
}
