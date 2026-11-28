'use client';

import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SPECIES_ART } from '@/lib/art';
import { MULTIPLIERS, SPECIES } from '@/lib/data';
import { DEFAULT_ASSUMPTIONS, gbp, multipliersFor, simulate, type Assumptions, type Issue, type Simulation } from '@/lib/engine';
import { lookupPostcode, UK_REGIONS, type Vet } from '@/lib/location';
import type { Lifestyle, SpeciesWithCosts, WhatIfs } from '@/lib/types';
import type { ScenarioInput } from '@/lib/validate';
import Icon from './Icon';
import Resume from './Resume';

const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)'];
const FREQ = { one_off: 'one-off', monthly: '/month', annual: '/year', per_night: '/night', emergency: 'if needed' } as const;
const CELL = 'rounded-[2rem] border border-line bg-surface p-5 sm:p-6';
const H2 = 'flex items-center gap-2 font-display text-2xl font-black tracking-tight';
const SEVERITY: Record<Issue['severity'], string> = { blocker: 'text-bad', warning: 'text-warn', info: 'text-muted' };

// Example starting point, labelled as such in the UI.
const EXAMPLE: Lifestyle = {
  housing: 'flat', has_garden: false, renting: true, hours_out_per_day: 9, lives_alone: true,
  allergies: false, noise_tolerance: 3, holiday_nights_per_year: 7,
};

interface Props {
  account?: { email: string | null } | null; // null = accounts not configured
  initial?: ScenarioInput;
  onSave?: (input: ScenarioInput) => Promise<{ error?: string; message?: string }>;
  onSignOut?: () => Promise<void>;
}

export default function Simulator({ account = null, initial, onSave, onSignOut }: Props) {
  const [life, setLife] = useState<Lifestyle>(initial?.lifestyle ?? EXAMPLE);
  const [postcode, setPostcode] = useState(initial?.postcode ?? 'SE1 7PB');
  const [region, setRegion] = useState(initial?.region ?? 'London');
  const [place, setPlace] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>(initial?.species_ids ?? SPECIES.map((s) => s.id).slice(0, 3));
  const [whatIfs, setWhatIfs] = useState<WhatIfs>(initial?.what_ifs ?? { emergency_year: 1 });
  const [assume, setAssume] = useState<Assumptions>(initial?.assumptions ?? DEFAULT_ASSUMPTIONS);
  const [scenarioName, setScenarioName] = useState(initial?.name ?? '');
  const [saveState, setSaveState] = useState<{ error?: string; message?: string; saving?: boolean }>({});
  const [perYear, setPerYear] = useState(false);
  const [resumeFor, setResumeFor] = useState<string | null>(null);
  const [vets, setVets] = useState<Vet[] | 'loading' | { error: string } | null>(null);

  const set = <K extends keyof Lifestyle>(k: K, v: Lifestyle[K]) => setLife((l) => ({ ...l, [k]: v }));
  const mult = useMemo(() => multipliersFor(region, MULTIPLIERS), [region]);
  const results = useMemo(
    () => SPECIES.filter((s) => picked.includes(s.id)).map((sp) => ({ sp, sim: simulate(sp, life, mult, whatIfs, assume) })),
    [picked, life, mult, whatIfs, assume],
  );
  const chart = useMemo(() => {
    const n = Math.max(0, ...results.map((r) => r.sim.years.length));
    return Array.from({ length: n }, (_, i) =>
      Object.fromEntries([['year', i + 1], ...results.map((r) => [r.sp.id, perYear ? r.sim.years[i]?.cost : r.sim.years[i]?.cumulative])]));
  }, [results, perYear]);
  const maxYears = chart.length;

  async function onLookup(e: React.FormEvent) {
    e.preventDefault();
    setLookupError(null);
    try {
      const r = await lookupPostcode(postcode);
      setRegion(r.region);
      setPlace(`${r.district}, ${r.region}`);
      findVets(r.lat, r.lon);
    } catch (err) {
      setPlace(null);
      setVets(null);
      setLookupError(`${err instanceof Error ? err.message : 'Lookup failed.'} Pick your region below instead.`);
    }
  }

  async function onSaveClick(e: React.FormEvent) {
    e.preventDefault();
    if (!onSave) return;
    setSaveState({ saving: true });
    setSaveState(await onSave({ name: scenarioName, postcode, region, species_ids: picked, lifestyle: life, what_ifs: whatIfs, assumptions: assume }));
  }

  async function findVets(lat: number, lon: number) {
    setVets('loading');
    try {
      const res = await fetch(`/api/vets?lat=${lat}&lon=${lon}`);
      const body = await res.json();
      setVets(res.ok ? body : { error: body.error });
    } catch {
      setVets({ error: 'Vet search is unavailable right now. Try again in a minute.' });
    }
  }

  const resume = results.find((r) => r.sp.id === resumeFor);
  if (resume) return <Resume sp={resume.sp} sim={resume.sim} life={life} region={region} onClose={() => setResumeFor(null)} />;

  return (
    <div className="overflow-x-clip">
    <div className="mx-auto max-w-7xl py-6 pl-[max(16px,env(safe-area-inset-left,0px))] pr-[max(16px,env(safe-area-inset-right,0px))]">
      <header className="mb-10 flex flex-col gap-8 lg:mb-14">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 font-display text-lg font-black tracking-tight"><Icon name="paw-print" className="size-6 text-accent" />pawprint-ledger</p>
          {account && (
            <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              {account.email ? (
                <>
                  <span className="text-muted">{account.email}</span>
                  <a href="/scenarios" className="font-bold text-accent underline-offset-4 hover:underline">My scenarios</a>
                  {onSignOut && <form action={onSignOut}><button className="text-muted hover:text-fg">Sign out</button></form>}
                </>
              ) : (
                <a href="/login" className="font-bold text-accent underline-offset-4 hover:underline">Sign in to save scenarios</a>
              )}
            </nav>
          )}
        </div>
        <div className="grid items-end gap-10 lg:grid-cols-[1.5fr_1fr]">
          <div className="flex min-w-0 flex-col gap-6">
            <h1 className="font-display text-[clamp(2.75rem,8.5vw,7rem)] font-black leading-[0.92] tracking-tighter">
              Know what a pet <span className="text-accent">really costs</span> before you commit.
            </h1>
            <p className="max-w-[48ch] text-lg text-muted">
              UK prices adjusted for your region, extra costs added where your routine leaves gaps, and the full lifetime bill.
              {initial ? ` Showing your saved scenario "${initial.name}".` : ' Starts with an example: renting a flat in London, out 9 hours a day.'}
            </p>
          </div>
          <div aria-hidden className="grid grid-cols-3 gap-3 lg:gap-4">
            {SPECIES.slice(0, 3).map((s, i) => (
              <div key={s.id} className={`float aspect-[3/4] rounded-[1.75rem] p-2 ${['-rotate-6', 'mt-8 rotate-3', '-mt-2 -rotate-2'][i]}`}
                style={{ background: `color-mix(in srgb, ${SERIES[i]} 22%, var(--surface))`, animationDelay: `${i * -2}s` }}>
                <img src={SPECIES_ART[s.kind]} alt="" className="size-full object-contain" />
              </div>
            ))}
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[21rem_1fr]">
        {/* Inputs */}
        <aside className="flex flex-col gap-6 self-start rounded-[2rem] border border-line bg-surface p-5 sm:p-6 lg:sticky lg:top-4">
          {onSave && (
            <form onSubmit={onSaveClick} className="flex flex-col gap-2 border-b border-line pb-5">
              <label htmlFor="scenario-name" className="text-sm font-bold">Save this scenario</label>
              <div className="flex gap-2">
                <input id="scenario-name" value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} maxLength={80} required
                  placeholder="e.g. Flat in Camden" className="min-w-0 flex-1 field" />
                <button disabled={saveState.saving} className="btn">
                  {saveState.saving ? 'Saving…' : 'Save'}
                </button>
              </div>
              {saveState.error && <p className="text-sm text-bad" role="alert">{saveState.error}</p>}
              {saveState.message && <p className="text-sm text-good" role="status">{saveState.message} <a href="/scenarios" className="underline">View all</a></p>}
            </form>
          )}
          <form onSubmit={onLookup} className="flex flex-col gap-2">
            <label htmlFor="postcode" className="text-sm font-semibold">Postcode</label>
            <div className="flex gap-2">
              <input id="postcode" value={postcode} onChange={(e) => setPostcode(e.target.value)} autoComplete="postal-code"
                className="min-w-0 flex-1 field font-mono uppercase" />
              <button className="btn">Look up</button>
            </div>
            {place && <p className="text-sm text-good">{place}</p>}
            {lookupError && <p className="text-sm text-warn">{lookupError}</p>}
            <label htmlFor="region" className="sr-only">Region</label>
            <select id="region" value={region} onChange={(e) => { setRegion(e.target.value); setPlace(null); setVets(null); }}
              className="field">
              {UK_REGIONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </form>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">Your home</legend>
            <div className="grid grid-cols-2 gap-2">
              {(['flat', 'house'] as const).map((h) => (
                <label key={h} className="relative flex cursor-pointer items-center justify-center gap-2 rounded-xl border-[1.5px] border-line px-3 py-2 text-sm font-bold capitalize has-[:checked]:border-fg has-[:checked]:bg-fg has-[:checked]:text-bg has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent">
                  <input type="radio" id={`housing-${h}`} name="housing" checked={life.housing === h} onChange={() => set('housing', h)} className="sr-only" />
                  <Icon name="house" className="size-4" />{h}
                </label>
              ))}
            </div>
            <Check id="garden" label="Secure garden" checked={life.has_garden} disabled={life.housing === 'flat'} onChange={(v) => set('has_garden', v)} />
            <Check id="renting" label="Renting" checked={life.renting} onChange={(v) => set('renting', v)} />
            <Check id="alone" label="I live alone" checked={life.lives_alone} onChange={(v) => set('lives_alone', v)} />
            <Check id="allergies" label="Someone at home has pet allergies" checked={life.allergies} onChange={(v) => set('allergies', v)} />
          </fieldset>

          <Range id="hours" label="Hours out per day" value={life.hours_out_per_day} min={0} max={12} suffix="h" onChange={(v) => set('hours_out_per_day', v)} />
          <Range id="noise" label="Noise you can live with" value={life.noise_tolerance} min={1} max={5} suffix="/5"
            onChange={(v) => set('noise_tolerance', v as Lifestyle['noise_tolerance'])} />
          <Range id="holiday" label="Nights away per year" value={life.holiday_nights_per_year} min={0} max={30} suffix=""
            onChange={(v) => set('holiday_nights_per_year', v)} />

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">Compare (up to 3)</legend>
            {SPECIES.map((s) => {
              const on = picked.includes(s.id);
              const disabled = !on && picked.length >= 3;
              return (
                <label key={s.id} htmlFor={`pick-${s.id}`}
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border-[1.5px] border-line p-2 pr-3 text-sm font-bold has-[:checked]:border-fg has-[:checked]:bg-bg has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent motion-safe:transition motion-safe:hover:-translate-y-0.5 ${disabled ? 'opacity-50' : ''}`}>
                  <input type="checkbox" id={`pick-${s.id}`} className="sr-only" checked={on} disabled={disabled}
                    onChange={(e) => setPicked((p) => (e.target.checked ? [...p, s.id] : p.filter((x) => x !== s.id)))} />
                  <img src={SPECIES_ART[s.kind]} alt="" className="size-12 shrink-0 rounded-xl bg-line/50 p-1" />
                  <span className="flex-1">{s.name}</span>
                  <span aria-hidden className={`grid size-5 place-items-center rounded-full border-[1.5px] text-xs ${on ? 'border-accent bg-accent text-accent-fg' : 'border-muted'}`}>{on ? '✓' : ''}</span>
                </label>
              );
            })}
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">Stress test</legend>
            <Check id="emergency" label="Emergency vet bill" checked={!!whatIfs.emergency}
              onChange={(v) => setWhatIfs((w) => ({ ...w, emergency: v }))} />
            {whatIfs.emergency && (
              <Range id="emergency-year" label="Happens in year" value={whatIfs.emergency_year ?? 1} min={1} max={Math.max(1, maxYears)} suffix=""
                onChange={(v) => setWhatIfs((w) => ({ ...w, emergency_year: v }))} />
            )}
            <Check id="uninsured" label="No pet insurance" checked={!!whatIfs.uninsured}
              onChange={(v) => setWhatIfs((w) => ({ ...w, uninsured: v }))} />
            <Check id="boarding" label="Extra 2-week holiday every year" checked={!!whatIfs.extra_boarding_nights}
              onChange={(v) => setWhatIfs((w) => ({ ...w, extra_boarding_nights: v ? 14 : 0 }))} />
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">Assumptions</legend>
            <Range id="start-age" label="Pet's age when you get them" value={assume.startAge} min={0} max={10} suffix=" yrs"
              onChange={(v) => setAssume((a) => ({ ...a, startAge: v }))} />
            <div className="flex flex-col gap-1">
              <label htmlFor="horizon" className="text-sm font-semibold">Project over</label>
              <select id="horizon" value={assume.years ?? ''} onChange={(e) => setAssume((a) => ({ ...a, years: e.target.value ? Number(e.target.value) : undefined }))}
                className="field">
                <option value="">Each pet's remaining lifespan</option>
                <option value="10">10 years</option>
                <option value="15">15 years</option>
              </select>
            </div>
            <Range id="medical-inflation" label="Vet & insurance price rises" value={Math.round(assume.medicalInflation * 100)} min={0} max={12} suffix="%/yr"
              onChange={(v) => setAssume((a) => ({ ...a, medicalInflation: v / 100 }))} />
          </fieldset>
        </aside>

        {/* Results */}
        <main className="flex min-w-0 flex-col gap-4">
          {results.length === 0 ? (
            <p className="rounded-[2rem] border border-dashed border-line p-8 text-center text-muted">Pick at least one pet to compare.</p>
          ) : (
            <>
              <section className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(17rem,1fr))]">
                {results.map(({ sp, sim }, i) => (
                  <PetCard key={sp.id} name={sp.name} kind={sp.kind} sim={sim} color={SERIES[i]} emergencyOn={!!whatIfs.emergency}
                    onResume={() => { setResumeFor(sp.id); scrollTo(0, 0); }} />
                ))}
              </section>

              <div className="grid gap-4 lg:grid-cols-6">
              <section className={`${CELL} lg:col-span-6`}>
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 max-w-[65ch]">
                    <h2 className={H2}><Icon name="chart-line-up" className="size-6 text-accent" />Lifetime cost, year by year</h2>
                    <p className="text-sm text-muted">
                      {perYear ? 'What each year costs.' : 'Running total from the year you get them.'} Other prices rise {assume.generalInflation * 100}% a year,
                      vet and insurance {Math.round(assume.medicalInflation * 100)}%. Insurance and check-ups cost more once a pet is a senior.
                    </p>
                  </div>
                  <div role="group" aria-label="Chart view" className="flex rounded-full border-[1.5px] border-line p-0.5 text-sm">
                    {[['Running total', false], ['Per year', true]].map(([label, v]) => (
                      <button key={String(label)} type="button" aria-pressed={perYear === v} onClick={() => setPerYear(v as boolean)}
                        className={`rounded-full px-4 py-1.5 font-bold ${perYear === v ? 'bg-accent text-accent-fg' : 'text-muted hover:text-fg'}`}>{label}</button>
                    ))}
                  </div>
                </div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                      <CartesianGrid stroke="var(--line)" vertical={false} />
                      <XAxis dataKey="year" tick={{ fill: 'var(--muted)', fontSize: 12 }} stroke="var(--line)" label={{ value: 'Year', position: 'insideBottomRight', offset: -2, fill: 'var(--muted)', fontSize: 12 }} />
                      <YAxis tickFormatter={(v: number) => `£${(v / 100000).toLocaleString('en-GB', { maximumFractionDigits: 1 })}k`} tick={{ fill: 'var(--muted)', fontSize: 12 }} stroke="var(--line)" width={48} />
                      <Tooltip formatter={(v) => gbp(Number(v))} labelFormatter={(y) => `Year ${y}`}
                        contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--fg)', borderRadius: 12 }} />
                      {whatIfs.emergency && (
                        <ReferenceLine x={Math.min(whatIfs.emergency_year ?? 1, maxYears)} stroke="var(--bad)" strokeDasharray="4 3"
                          label={{ value: 'Emergency', position: 'insideTopLeft', fill: 'var(--bad)', fontSize: 12 }} />
                      )}
                      {results.map(({ sp }, i) => (
                        <Line key={sp.id} dataKey={sp.id} name={sp.name} stroke={SERIES[i]} strokeWidth={3} dot={false} connectNulls={false} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>

              {results.length > 1 && <Comparison results={results} className={vets ? 'lg:col-span-4' : 'lg:col-span-6'} />}
              {vets && <VetList vets={vets} postcode={postcode} className={results.length > 1 ? 'lg:col-span-2' : 'lg:col-span-6'} exotic={results.filter((r) => ['reptile', 'bird'].includes(r.sp.kind)).map((r) => r.sp.name)} />}

              <section className={`${CELL} flex flex-col gap-3 lg:col-span-6`}>
                <h2 className={H2}><Icon name="wallet" className="size-6 text-accent" />Cost breakdown</h2>
                {results.map(({ sp, sim }) => (
                  <details key={sp.id} className="rounded-2xl border border-line bg-bg">
                    <summary className="cursor-pointer px-5 py-3 font-bold">{sp.name}</summary>
                    <div className="overflow-x-auto px-5 pb-4">
                      <table className="w-full text-sm tabular-nums">
                        <tbody>
                          {sim.lines.map(({ item, amount, active }) => (
                            <tr key={item.id} className={`border-t border-line ${active ? '' : 'text-muted line-through'}`}>
                              <td className="py-2 pr-3">
                                {item.name}
                                {!item.is_essential && <span className="ml-2 text-xs text-muted">optional</span>}
                                {item.trigger && <span className={`ml-2 text-xs ${active ? 'text-warn' : 'text-muted'}`}>{active ? 'added for your routine' : 'not needed'}</span>}
                              </td>
                              <td className="py-2 pr-3 text-right font-mono">{gbp(amount)}</td>
                              <td className="py-2 pr-3 text-muted">{FREQ[item.frequency]}</td>
                              <td className="py-2 text-right text-xs text-muted">
                                {item.service && mult[item.service] !== 1 ? `×${mult[item.service]} ${region}` : ''}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {sp.legal_notes && <p className="mt-3 text-xs text-muted">{sp.legal_notes}</p>}
                    </div>
                  </details>
                ))}
              </section>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
    </div>
  );
}

function PetCard({ name, kind, sim, color, emergencyOn, onResume }: { name: string; kind: string; sim: Simulation; color: string; emergencyOn: boolean; onResume: () => void }) {
  const { score, issues } = sim.readiness;
  const band = score >= 80 ? ['Good fit', 'text-good'] : score >= 50 ? ['Workable with changes', 'text-warn'] : ['Poor fit', 'text-bad'];
  return (
    <article className="flex flex-col gap-4 rounded-[2rem] border border-line bg-surface p-5 motion-safe:transition motion-safe:duration-300 motion-safe:hover:-translate-y-1 hover:shadow-[0_20px_40px_-24px_var(--fg)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col items-start gap-3">
          <h3 className="flex items-center gap-2 font-display text-xl font-black leading-tight tracking-tight">
            <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ background: color }} />{name}
          </h3>
          <span className={`inline-flex items-center gap-2 rounded-full border-2 border-current py-0.5 pl-1 pr-3 text-sm font-bold ${band[1]}`}>
            <span className="grid h-8 min-w-8 place-items-center rounded-full bg-current px-1.5"><span className="text-base font-black tabular-nums text-surface">{score}</span></span>
            {band[0]}
          </span>
        </div>
        <img src={SPECIES_ART[kind]} alt="" className="-mr-1 -mt-1 size-24 shrink-0 rounded-3xl p-2" style={{ background: `color-mix(in srgb, ${color} 20%, var(--surface))` }} />
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
        <div className="col-span-2 flex flex-col">
          <dt className="text-xs font-bold uppercase tracking-widest text-muted">Per month</dt>
          <dd className="font-display text-5xl font-black tracking-tighter tabular-nums">{gbp(sim.monthly)}</dd>
        </div>
        <Figure label="Upfront" value={gbp(sim.upfront)} />
        <Figure label={`${sim.years.length} years`} value={gbp(sim.lifetime)} />
      </dl>
      <p className="text-sm">
        Budget <strong className="font-mono">{gbp(sim.monthlyAverage)}</strong>/month on average. Most expensive: year {sim.peak.year} at <strong className="font-mono">{gbp(sim.peak.cost)}</strong>.
      </p>
      <p className="text-xs text-muted">
        {sim.insured ? `Insured: an emergency costs you the ${gbp(sim.emergency)} excess.` : `Uninsured: an emergency costs you ${gbp(sim.emergency)} at today's prices.`}
        {!emergencyOn && ' Turn on the stress test to add it.'}
      </p>
      <ul className="flex flex-col gap-1 text-sm">
        {issues.map((i) => <li key={i.message} className={SEVERITY[i.severity]}>{i.message}</li>)}
      </ul>
      <button type="button" onClick={onResume} className="btn-ghost mt-auto self-start">
        Landlord resume &amp; checklist <Icon name="file-text" className="size-4" />
      </button>
    </article>
  );
}

type Row = [label: string, value: (sp: SpeciesWithCosts, sim: Simulation) => number, format: (n: number) => string, best: 'low' | 'high' | null];
const ROWS: Row[] = [
  ['Fit score', (_, s) => s.readiness.score, String, 'high'],
  ['Upfront', (_, s) => s.upfront, gbp, 'low'],
  ['Per month (today)', (_, s) => s.monthly, gbp, 'low'],
  ['Average per month', (_, s) => s.monthlyAverage, gbp, 'low'],
  ['Most expensive year', (_, s) => s.peak.cost, gbp, 'low'],
  ['Lifetime total', (_, s) => s.lifetime, gbp, 'low'],
  ['Emergency costs you', (_, s) => s.emergency, gbp, 'low'],
  ['Years projected', (_, s) => s.years.length, String, null],
  ['Can be left alone', (sp) => sp.max_hours_alone, (n) => `${n}h`, 'high'],
  ['Noise', (sp) => sp.noise_level, (n) => `${n}/5`, 'low'],
  ['Allergen level', (sp) => sp.allergen_level, (n) => `${n}/5`, 'low'],
];

function Comparison({ results, className }: { results: { sp: SpeciesWithCosts; sim: Simulation }[]; className: string }) {
  return (
    <section className={`${CELL} flex flex-col gap-3 ${className}`}>
      <h2 className={H2}><Icon name="heart" className="size-6 text-accent" />Side by side</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left">
              <th className="p-3 font-semibold text-muted">Best value highlighted</th>
              {results.map(({ sp }) => <th key={sp.id} scope="col" className="p-3 text-right font-semibold">{sp.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([label, value, format, best]) => {
              const vals = results.map((r) => value(r.sp, r.sim));
              const target = best === 'low' ? Math.min(...vals) : best === 'high' ? Math.max(...vals) : null;
              const tie = vals.every((v) => v === target);
              return (
                <tr key={label} className="border-t border-line hover:bg-bg">
                  <th scope="row" className="p-3 text-left font-normal text-muted">{label}</th>
                  {vals.map((v, i) => (
                    <td key={results[i].sp.id} className={`p-3 text-right font-mono ${v === target && !tie ? 'font-semibold text-good' : ''}`}>
                      {format(v)}{v === target && !tie && <span className="sr-only"> (best)</span>}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function VetList({ vets, postcode, exotic, className }: { vets: Vet[] | 'loading' | { error: string }; postcode: string; exotic: string[]; className: string }) {
  return (
    <section className={`${CELL} flex flex-col gap-3 ${className}`} aria-live="polite">
      <div>
        <h2 className={H2}><Icon name="map-pin" className="size-6 shrink-0 text-accent" />Vets near {postcode.toUpperCase()}</h2>
        {exotic.length > 0 && (
          <p className="text-sm text-warn">{exotic.join(' and ')} need{exotic.length === 1 ? 's' : ''} an exotics vet. Not every practice treats them, so call ahead.</p>
        )}
      </div>
      {vets === 'loading' ? (
        <p className="text-sm text-muted">Searching OpenStreetMap within 10 km…</p>
      ) : 'error' in vets ? (
        <p className="text-sm text-warn">{vets.error}</p>
      ) : vets.length === 0 ? (
        <p className="text-sm text-muted">No vets are mapped within 10 km. Try a nearby town's postcode.</p>
      ) : (
        <ul className="grid gap-3">
          {vets.map((v) => (
            <li key={v.id} className="flex min-w-0 flex-col gap-1 rounded-2xl border border-line bg-bg p-4">
              <div className="flex items-start justify-between gap-3">
                <a href={`https://www.openstreetmap.org/${v.id}`} target="_blank" rel="noreferrer" className="font-semibold underline-offset-2 hover:underline">{v.name}</a>
                <span className="whitespace-nowrap font-mono text-sm tabular-nums text-muted">{v.km.toFixed(1)} km</span>
              </div>
              {v.emergency && <span className="self-start rounded-full border border-good px-2 text-xs font-semibold text-good">24-hour / emergency</span>}
              {v.address && <p className="text-sm text-muted">{v.address}</p>}
              {v.phone && <p className="select-all font-mono text-sm">{v.phone}</p>}
              {v.website && <a href={v.website} target="_blank" rel="noreferrer" className="truncate text-sm text-accent underline-offset-2 hover:underline">{v.website.replace(/^https?:\/\//, '')}</a>}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">Practice data © OpenStreetMap contributors. Check opening hours with the practice.</p>
    </section>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs font-bold uppercase tracking-widest text-muted">{label}</dt>
      <dd className="font-display text-xl font-black tracking-tight tabular-nums">{value}</dd>
    </div>
  );
}

function Check({ id, label, checked, disabled, onChange }: { id: string; label: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className={`flex cursor-pointer items-center gap-2 text-sm ${disabled ? 'opacity-50' : ''}`}>
      <input type="checkbox" id={id} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  );
}

function Range({ id, label, value, min, max, suffix, onChange }: { id: string; label: string; value: number; min: number; max: number; suffix: string; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex justify-between text-sm font-semibold">
        {label} <span className="font-mono tabular-nums">{value}{suffix}</span>
      </label>
      <input type="range" id={id} min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
