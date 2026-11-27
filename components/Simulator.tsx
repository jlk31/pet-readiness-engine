'use client';

import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { MULTIPLIERS, SPECIES } from '@/lib/data';
import { DEFAULT_ASSUMPTIONS, gbp, multipliersFor, simulate, type Assumptions, type Issue, type Simulation } from '@/lib/engine';
import { lookupPostcode, UK_REGIONS, type Vet } from '@/lib/location';
import type { Lifestyle, WhatIfs } from '@/lib/types';

const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)'];
const FREQ = { one_off: 'one-off', monthly: '/month', annual: '/year', per_night: '/night', emergency: 'if needed' } as const;
const SEVERITY: Record<Issue['severity'], string> = { blocker: 'text-bad', warning: 'text-warn', info: 'text-muted' };

// Example starting point, labelled as such in the UI.
const EXAMPLE: Lifestyle = {
  housing: 'flat', has_garden: false, renting: true, hours_out_per_day: 9, lives_alone: true,
  allergies: false, noise_tolerance: 3, holiday_nights_per_year: 7,
};

export default function Simulator() {
  const [life, setLife] = useState<Lifestyle>(EXAMPLE);
  const [postcode, setPostcode] = useState('SE1 7PB');
  const [region, setRegion] = useState('London');
  const [place, setPlace] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>(SPECIES.map((s) => s.id).slice(0, 3));
  const [whatIfs, setWhatIfs] = useState<WhatIfs>({ emergency_year: 1 });
  const [assume, setAssume] = useState<Assumptions>(DEFAULT_ASSUMPTIONS);
  const [perYear, setPerYear] = useState(false);
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

  return (
    <div className="mx-auto max-w-7xl py-8 pl-[max(16px,env(safe-area-inset-left,0px))] pr-[max(16px,env(safe-area-inset-right,0px))]">
      <header className="mb-8 flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-widest text-accent">pawprint-ledger</p>
        <h1 className="font-display text-3xl font-extrabold sm:text-4xl">What will this pet really cost you?</h1>
        <p className="max-w-[65ch] text-muted">
          UK prices adjusted for your region, extra costs added where your routine leaves gaps, and the full lifetime bill.
          Starts with an example: renting a flat in London, out 9 hours a day.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[20rem_1fr]">
        {/* Inputs */}
        <aside className="flex flex-col gap-6 self-start rounded-xl border border-line bg-surface p-5 lg:sticky lg:top-4">
          <form onSubmit={onLookup} className="flex flex-col gap-2">
            <label htmlFor="postcode" className="text-sm font-semibold">Postcode</label>
            <div className="flex gap-2">
              <input id="postcode" value={postcode} onChange={(e) => setPostcode(e.target.value)} autoComplete="postal-code"
                className="min-w-0 flex-1 rounded-md border border-line bg-bg px-3 py-2 font-mono uppercase" />
              <button className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-fg">Look up</button>
            </div>
            {place && <p className="text-sm text-good">{place}</p>}
            {lookupError && <p className="text-sm text-warn">{lookupError}</p>}
            <label htmlFor="region" className="sr-only">Region</label>
            <select id="region" value={region} onChange={(e) => { setRegion(e.target.value); setPlace(null); setVets(null); }}
              className="rounded-md border border-line bg-bg px-3 py-2 text-sm">
              {UK_REGIONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </form>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold">Your home</legend>
            <div className="flex gap-4">
              {(['flat', 'house'] as const).map((h) => (
                <label key={h} className="flex items-center gap-2 text-sm capitalize">
                  <input type="radio" id={`housing-${h}`} name="housing" checked={life.housing === h} onChange={() => set('housing', h)} /> {h}
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
            <legend className="mb-2 text-sm font-semibold">Compare (up to 3)</legend>
            {SPECIES.map((s) => (
              <Check key={s.id} id={`pick-${s.id}`} label={s.name} checked={picked.includes(s.id)}
                disabled={!picked.includes(s.id) && picked.length >= 3}
                onChange={(v) => setPicked((p) => (v ? [...p, s.id] : p.filter((x) => x !== s.id)))} />
            ))}
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold">Stress test</legend>
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
            <legend className="mb-2 text-sm font-semibold">Assumptions</legend>
            <Range id="start-age" label="Pet's age when you get them" value={assume.startAge} min={0} max={10} suffix=" yrs"
              onChange={(v) => setAssume((a) => ({ ...a, startAge: v }))} />
            <div className="flex flex-col gap-1">
              <label htmlFor="horizon" className="text-sm font-semibold">Project over</label>
              <select id="horizon" value={assume.years ?? ''} onChange={(e) => setAssume((a) => ({ ...a, years: e.target.value ? Number(e.target.value) : undefined }))}
                className="rounded-md border border-line bg-bg px-3 py-2 text-sm">
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
        <main className="flex min-w-0 flex-col gap-8">
          {results.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">Pick at least one pet to compare.</p>
          ) : (
            <>
              <section className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(16rem,1fr))]">
                {results.map(({ sp, sim }, i) => <PetCard key={sp.id} name={sp.name} sim={sim} color={SERIES[i]} emergencyOn={!!whatIfs.emergency} />)}
              </section>

              <section className="rounded-xl border border-line bg-surface p-5">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 max-w-[65ch]">
                    <h2 className="font-display text-xl font-semibold">Lifetime cost, year by year</h2>
                    <p className="text-sm text-muted">
                      {perYear ? 'What each year costs.' : 'Running total from the year you get them.'} Other prices rise {assume.generalInflation * 100}% a year,
                      vet and insurance {Math.round(assume.medicalInflation * 100)}%. Insurance and check-ups cost more once a pet is a senior.
                    </p>
                  </div>
                  <div role="group" aria-label="Chart view" className="flex rounded-md border border-line p-0.5 text-sm">
                    {[['Running total', false], ['Per year', true]].map(([label, v]) => (
                      <button key={String(label)} type="button" aria-pressed={perYear === v} onClick={() => setPerYear(v as boolean)}
                        className={`rounded px-3 py-1 ${perYear === v ? 'bg-accent font-semibold text-accent-fg' : 'text-muted'}`}>{label}</button>
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
                        contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--fg)', borderRadius: 8 }} />
                      {whatIfs.emergency && (
                        <ReferenceLine x={Math.min(whatIfs.emergency_year ?? 1, maxYears)} stroke="var(--bad)" strokeDasharray="4 3"
                          label={{ value: 'Emergency', position: 'insideTopLeft', fill: 'var(--bad)', fontSize: 12 }} />
                      )}
                      {results.map(({ sp }, i) => (
                        <Line key={sp.id} dataKey={sp.id} name={sp.name} stroke={SERIES[i]} strokeWidth={2.5} dot={false} connectNulls={false} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>

              {vets && <VetList vets={vets} postcode={postcode} exotic={results.filter((r) => ['reptile', 'bird'].includes(r.sp.kind)).map((r) => r.sp.name)} />}

              <section className="flex flex-col gap-3">
                <h2 className="font-display text-xl font-semibold">Cost breakdown</h2>
                {results.map(({ sp, sim }) => (
                  <details key={sp.id} className="rounded-xl border border-line bg-surface">
                    <summary className="cursor-pointer px-5 py-3 font-semibold">{sp.name}</summary>
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
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function PetCard({ name, sim, color, emergencyOn }: { name: string; sim: Simulation; color: string; emergencyOn: boolean }) {
  const { score, issues } = sim.readiness;
  const band = score >= 80 ? ['Good fit', 'text-good'] : score >= 50 ? ['Workable with changes', 'text-warn'] : ['Poor fit', 'text-bad'];
  return (
    <article className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5" style={{ borderTop: `4px solid ${color}` }}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-lg font-semibold">{name}</h3>
        <div className="text-right">
          <div className="font-display text-3xl font-extrabold tabular-nums">{score}</div>
          <div className={`whitespace-nowrap text-xs font-semibold ${band[1]}`}>{band[0]}</div>
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <Figure label="Upfront" value={gbp(sim.upfront)} />
        <Figure label="Per month" value={gbp(sim.monthly)} />
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
    </article>
  );
}

function VetList({ vets, postcode, exotic }: { vets: Vet[] | 'loading' | { error: string }; postcode: string; exotic: string[] }) {
  return (
    <section className="flex flex-col gap-3" aria-live="polite">
      <div>
        <h2 className="font-display text-xl font-semibold">Vets near {postcode.toUpperCase()}</h2>
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
        <ul className="grid gap-3 sm:grid-cols-2">
          {vets.map((v) => (
            <li key={v.id} className="flex min-w-0 flex-col gap-1 rounded-xl border border-line bg-surface p-4">
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
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="font-mono font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function Check({ id, label, checked, disabled, onChange }: { id: string; label: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className={`flex items-center gap-2 text-sm ${disabled ? 'opacity-50' : ''}`}>
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
