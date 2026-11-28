'use client';

import { useRef, useState } from 'react';
import { gbp, type Simulation } from '@/lib/engine';
import type { Lifestyle, SpeciesWithCosts } from '@/lib/types';

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

  const active = sim.lines.filter((l) => l.active);
  const walker = active.find((l) => l.item.trigger === 'left_alone_too_long');
  const boarding = active.find((l) => l.item.frequency === 'per_night');
  const health = active.filter((l) => l.item.service === 'vet' && (l.item.frequency === 'monthly' || l.item.frequency === 'annual'));
  const kit = active.filter((l) => l.item.frequency === 'one_off');
  const pet = petName.trim() || `my ${sp.name.split(' (')[0].toLowerCase()}`;

  async function copy() {
    const text = doc.current?.innerText ?? '';
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
    <div className="mx-auto flex max-w-3xl flex-col gap-6 py-8 pl-[max(16px,env(safe-area-inset-left,0px))] pr-[max(16px,env(safe-area-inset-right,0px))]">
      <div className="flex flex-col gap-4 rounded-[2rem] border border-line bg-surface p-5 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={onClose} className="text-sm font-bold text-accent underline-offset-4 hover:underline">← Back to comparison</button>
          <div className="flex gap-2">
            <button type="button" onClick={copy} className="btn-ghost">Copy as text</button>
            {CAN_PRINT && <button type="button" onClick={() => window.print()} className="btn">Print / Save as PDF</button>}
          </div>
        </div>
        {copied && <p className="text-sm text-muted" role="status">{copied}</p>}
        {sim.readiness.issues.filter((i) => i.severity === 'blocker').map((i) => (
          <p key={i.message} className="text-sm text-bad">Before you send this: {i.message} (fit score {sim.readiness.score})</p>
        ))}
        <div className="grid gap-3 sm:grid-cols-2">
          <label htmlFor="owner" className="flex flex-col gap-1 text-sm font-semibold">Your name
            <input id="owner" value={owner} onChange={(e) => setOwner(e.target.value)} className="field font-normal" />
          </label>
          <label htmlFor="pet-name" className="flex flex-col gap-1 text-sm font-semibold">Pet's name (if you know it)
            <input id="pet-name" value={petName} onChange={(e) => setPetName(e.target.value)} className="field font-normal" />
          </label>
        </div>
      </div>

      <div ref={doc} className="flex flex-col gap-8 rounded-[2rem] border border-line bg-surface p-6 print:border-0 print:p-0">
        <article className="flex flex-col gap-5">
          <header className="flex flex-col gap-1 border-b border-line pb-4">
            <p className="text-xs font-bold uppercase tracking-widest text-accent">Landlord Pet Resume</p>
            <h1 className="font-display text-[clamp(2.25rem,7vw,4rem)] font-black leading-none tracking-tighter">{petName.trim() || sp.name}</h1>
            <p className="text-sm text-muted">
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

          {sp.legal_notes && <p className="text-sm text-muted">{sp.legal_notes}</p>}
          <p className="text-xs text-muted">
            Under the Renters&apos; Rights Act 2025 (England), tenants can ask to keep a pet and landlords must not unreasonably refuse.
            I&apos;m happy to agree reasonable conditions in writing.
          </p>
        </article>

        <article className="flex flex-col gap-4 border-t border-line pt-6 print:break-before-page print:border-0">
          <h2 className="font-display text-2xl font-semibold">Shopping checklist</h2>
          <ul className="flex flex-col">
            {kit.map((l) => (
              <li key={l.item.id} className="flex items-baseline gap-3 border-b border-line py-2 text-sm">
                <span aria-hidden className="inline-block size-3.5 shrink-0 rounded-sm border border-muted" />
                <span className="flex-1">{l.item.name}{!l.item.is_essential && <span className="text-muted"> (optional)</span>}</span>
                <span className="font-mono tabular-nums">{gbp(l.amount)}</span>
              </li>
            ))}
            <li className="flex justify-between py-2 text-sm font-semibold">
              <span>Total</span><span className="font-mono tabular-nums">{gbp(sim.upfront)}</span>
            </li>
          </ul>
          <h3 className="font-semibold">Before day one</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {life.renting && <Todo>Get written consent from your landlord (attach this resume).</Todo>}
            <Todo>Register with a vet{sp.kind === 'reptile' || sp.kind === 'bird' ? ' that treats exotics' : ''}.</Todo>
            {sim.insured && <Todo>Buy pet insurance from day one, before any condition counts as pre-existing.</Todo>}
            {sp.microchip_required && <Todo>Update the microchip database with your details.</Todo>}
            {walker && <Todo>Book a dog walker and trial a walk before your first full workday.</Todo>}
          </ul>
        </article>
      </div>
    </div>
  );
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">{children}</ul>
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
