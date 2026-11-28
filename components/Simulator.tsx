'use client';

import { useMemo, useRef, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { MULTIPLIERS, SPECIES } from '@/lib/data';
import { DEFAULT_ASSUMPTIONS, gbp, multipliersFor, simulate, type Assumptions, type Issue, type Simulation } from '@/lib/engine';
import { lookupPoint, lookupPostcode, UK_REGIONS, type Vet } from '@/lib/location';
import { lookupOutcode } from '@/lib/outcodes';
import { districtAt } from '@/lib/uk-districts';
import type { Lifestyle, SpeciesWithCosts, WhatIfs } from '@/lib/types';
import type { ScenarioInput } from '@/lib/validate';
import Icon from './Icon';
import NearbyPlaces from './NearbyPlaces';
import PointMap from './PointMap';
import RegionMap from './RegionMap';
import Resume from './Resume';

const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)'];
// Each pet gets a dash pattern as well as a colour, so the chart does not rely on colour alone.
const DASH = [undefined, '10 7', '0.1 7'];
const short = (name: string) => name.split(' (')[0];
const wrap2 = (s: string): string[] => { const w = s.split(' '); const k = Math.ceil(w.length / 2); return w.length < 2 ? [s] : [w.slice(0, k).join(' '), w.slice(k).join(' ')]; };
const band = (score: number) => score >= 80
  ? { label: 'Good fit', brief: 'Good fit', text: 'text-good', bar: 'var(--good)' }
  : score >= 50 ? { label: 'Workable with changes', brief: 'Workable', text: 'text-warn', bar: 'var(--warn)' }
  : { label: 'Poor fit', brief: 'Poor fit', text: 'text-bad', bar: 'var(--bad)' };
const SEVERITY_WORD: Record<Issue['severity'], string> = { blocker: 'Blocker', warning: 'Warning', info: 'Note' };
const hhmm = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const FREQ = { one_off: 'one-off', monthly: '/month', annual: '/year', per_night: '/night', emergency: 'if needed' } as const;
const CELL = 'rounded-card border border-line bg-surface p-4 sm:p-6';
const H2 = 'font-display text-2xl font-bold tracking-tight';
const GROUP = 'font-display text-lg font-bold tracking-tight'; // heading of a form group
const PAGE_X = 'pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))]';
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
  const [point, setPoint] = useState<{ lat: number; lon: number } | null>(null); // exact spot; stays in the browser
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null); // set when the postcode fell back to its area centre
  const [approx, setApprox] = useState(false);
  const pickSeq = useRef(0);
  const [picked, setPicked] = useState<string[]>(initial?.species_ids ?? SPECIES.map((s) => s.id).slice(0, 3));
  const [whatIfs, setWhatIfs] = useState<WhatIfs>(initial?.what_ifs ?? { emergency_year: 1 });
  const [assume, setAssume] = useState<Assumptions>(initial?.assumptions ?? DEFAULT_ASSUMPTIONS);
  const [scenarioName, setScenarioName] = useState(initial?.name ?? '');
  const [saveState, setSaveState] = useState<{ error?: string; message?: string; saving?: boolean }>({});
  const [perYear, setPerYear] = useState(false);
  const [resumeFor, setResumeFor] = useState<string | null>(null);
  const [vets, setVets] = useState<Vet[] | 'loading' | { error: string } | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

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
  // Direct labels at the line ends: a label that would sit on top of an earlier one is nudged down.
  // ponytail: one pass in series order, three series at most; sort by height if more pets are ever allowed.
  const labelY: number[] = [];
  const endLabel = (i: number, name: string, last: number) => ({ x, y, index }: { x?: number | string; y?: number | string; index?: number }) => {
    if (index !== last) return null;
    let yy = Number(y);
    for (let j = 0; j < i; j++) if (Math.abs(yy - labelY[j]) < 32) yy = labelY[j] + 32;
    labelY[i] = yy;
    const lines = wrap2(name);
    return (
      <text x={Number(x) + 10} y={yy - (lines.length - 1) * 7} fill="var(--fg)" fontSize={13} fontWeight={700} dominantBaseline="central">
        {lines.map((l, k) => <tspan key={l} x={Number(x) + 10} dy={k ? 15 : 0}>{l}</tspan>)}
      </text>
    );
  };
  const chartText = `Line chart of ${perYear ? 'what each year costs' : 'the running total cost'} over ${maxYears} years. ${
    results.map((r) => { const y = r.sim.years[r.sim.years.length - 1]; return `${short(r.sp.name)} ends at ${gbp(perYear ? y.cost : y.cumulative)}`; }).join('. ')
  }.${results.length > 1 ? ' The Side by side table has the same figures.' : ''}`;

  // Postcodes.io gives the exact postcode point. In the preview (no network) or when it fails, the bundled postcode-district centre is used.
  async function onLookup(e: React.FormEvent) {
    e.preventDefault();
    setLookupError(null);
    setNote(null);
    let r: { region: string; district: string; lat: number; lon: number } | null = null;
    let outcode: string | null = null;
    if (process.env.NEXT_PUBLIC_PREVIEW !== '1') {
      try { r = await lookupPostcode(postcode); } catch { /* fall back below */ }
    }
    if (!r) {
      const o = lookupOutcode(postcode);
      if (o) { r = o; outcode = o.outcode; }
    }
    if (!r) {
      setPlace(null);
      setVets(null);
      setLookupError('That postcode was not found. Check it, or pick your region on the map.');
      return;
    }
    setRegion(r.region);
    setPlace(`${r.district}, ${r.region}`);
    setPoint({ lat: r.lat, lon: r.lon });
    setApprox(!!outcode);
    setNote(outcode && `Using the area centre for ${outcode}`);
    if (process.env.NEXT_PUBLIC_PREVIEW === '1') setVets(null);
    else findVets(r.lat, r.lon);
  }

  // Google map: the pin only counts if Postcodes.io knows the spot.
  async function onPickPoint(lat: number, lon: number) {
    setLookupError(null);
    try {
      const r = await lookupPoint(lat, lon);
      setPoint({ lat, lon });
      setApprox(false);
      setNote(null);
      setPostcode(r.postcode);
      setRegion(r.region);
      setPlace(`${r.district}, ${r.region}`);
      findVets(lat, lon);
      return true;
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Lookup failed.');
      return false;
    }
  }

  // Built-in map (no Google key, or the artifact preview, where fetches are blocked): the offline district gives the region and place at once;
  // in the real app Postcodes.io then adds the nearest postcode and the vets, and a failure there keeps the offline answer.
  async function onPickRegion(name: string, lat: number, lon: number) {
    const d = districtAt(lat, lon), seq = ++pickSeq.current;
    setLookupError(null);
    setNote(null);
    setApprox(false);
    setRegion(name);
    setPoint({ lat, lon });
    setPlace(d ? `${d.name}, ${d.region}` : name);
    if (process.env.NEXT_PUBLIC_PREVIEW === '1') { setVets(null); return; }
    findVets(lat, lon);
    try {
      const r = await lookupPoint(lat, lon);
      if (seq !== pickSeq.current) return;
      setPostcode(r.postcode);
      setRegion(r.region);
      setPlace(`${r.district}, ${r.region}`);
    } catch { /* keep the offline district and region */ }
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
      setCheckedAt(hhmm());
    } catch {
      setVets({ error: 'Vet search is unavailable right now. Try again in a minute.' });
      setCheckedAt(hhmm());
    }
  }

  const resume = results.find((r) => r.sp.id === resumeFor);
  if (resume) return <Resume sp={resume.sp} sim={resume.sim} life={life} region={region} onClose={() => setResumeFor(null)} />;
  const stressOn = [whatIfs.emergency, whatIfs.uninsured, whatIfs.extra_boarding_nights].filter(Boolean).length;

  return (
    <div className="overflow-x-clip">
    <div className={`mx-auto max-w-7xl py-8 ${PAGE_X} ${results.length ? 'pb-[calc(7.5rem+env(safe-area-inset-bottom,0px))] lg:pb-8' : ''}`}>
      <header className="mb-12 flex flex-col gap-8">
        <div className="flex flex-wrap items-center justify-between gap-x-4">
          <p className="font-display text-lg font-bold tracking-tight">pawprint-ledger</p>
          {account && (
            <nav className="flex flex-wrap items-center gap-x-4">
              {account.email ? (
                <>
                  <span className="text-muted">{account.email}</span>
                  <a href="/scenarios" className="link">My scenarios</a>
                  {onSignOut && <form action={onSignOut}><button className="link text-muted!">Sign out</button></form>}
                </>
              ) : (
                <a href="/login" className="link">Sign in to save scenarios</a>
              )}
            </nav>
          )}
        </div>
        <div className="grid items-end gap-12 lg:grid-cols-[1.5fr_1fr]">
          <div className="flex min-w-0 flex-col gap-6">
            <h1 className="font-display text-[clamp(2.25rem,6vw,4.5rem)] font-bold leading-[1.05] tracking-tight">
              Compare what different pets cost to keep.
            </h1>
            <p className="max-w-[48ch] text-lg text-muted">
              Prices are UK averages, adjusted for your region and for the hours you are out.
              {initial ? ` Showing your saved scenario "${initial.name}".` : ' Starts with an example: renting a flat in London, out 9 hours a day.'}
            </p>
          </div>
          <div aria-hidden className="grid grid-cols-3 gap-4">
            {SPECIES.slice(0, 3).map((s, i) => (
              <div key={s.id} className="grid aspect-square place-items-center rounded-card p-4"
                style={{ background: `color-mix(in srgb, ${SERIES[i]} 16%, var(--surface))`, color: SERIES[i] }}>
                <Icon name={s.kind} className="size-full" />
              </div>
            ))}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[23rem_minmax(0,1fr)]">
        {/* Inputs: one column of clearly headed groups */}
        <aside aria-label="Your details" className="flex flex-col gap-6 self-start rounded-card border border-line bg-surface p-4 sm:p-6">
          {onSave && (
            <form onSubmit={onSaveClick} className="flex flex-col gap-2 border-b border-line pb-6">
              <label htmlFor="scenario-name" className="font-bold">Scenario name</label>
              <div className="flex flex-wrap gap-2">
                <input id="scenario-name" value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} maxLength={80} required
                  placeholder="e.g. Flat in Camden" className="min-w-[10rem] flex-1 field" />
                <button disabled={saveState.saving} className="btn-ghost">
                  {saveState.saving ? 'Saving…' : 'Save this scenario'}
                </button>
              </div>
              {saveState.error && <p className="text-bad" role="alert">{saveState.error}</p>}
              {saveState.message && <p className="text-good" role="status">{saveState.message} <a href="/scenarios" className="underline">View all</a></p>}
            </form>
          )}
          <section className="flex flex-col gap-3" aria-labelledby="h-where">
            <h2 id="h-where" className={GROUP}>Where you live</h2>
            <form onSubmit={onLookup} className="flex flex-col gap-3">
              <label htmlFor="postcode" className="font-bold">Postcode</label>
              <div className="flex flex-wrap gap-2">
                <input id="postcode" value={postcode} onChange={(e) => setPostcode(e.target.value)} autoComplete="postal-code"
                  className="min-w-[8rem] flex-1 field font-mono uppercase" />
                <button className="btn">Find my area</button>
              </div>
              {place && <p className="text-good">{place}</p>}
              {note && <p className="text-sm text-muted" role="status">{note}</p>}
              {lookupError && <p className="text-warn">{lookupError}</p>}
            </form>
            <label htmlFor="region" className="sr-only">Region</label>
            <select id="region" value={region} onChange={(e) => { setRegion(e.target.value); setPlace(null); setVets(null); setPoint(null); }}
              className="field">
              {UK_REGIONS.map((r) => <option key={r}>{r}</option>)}
            </select>
            {process.env.NEXT_PUBLIC_PREVIEW === '1' || !process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
              ? <RegionMap region={region} point={point} approx={approx} onPick={onPickRegion} />
              : <PointMap point={point} onPick={onPickPoint} />}
          </section>

          <div className="flex flex-col gap-4 border-t border-line pt-6">
            <fieldset className="flex flex-col gap-2">
              <legend className={`${GROUP} mb-2`}>Your home</legend>
              <div className="mb-1 grid grid-cols-2 divide-x divide-edge overflow-hidden rounded-control border border-edge">
                {(['flat', 'house'] as const).map((h) => (
                  <label key={h} className="relative flex min-h-11 cursor-pointer items-center justify-center gap-2 px-3 py-2 font-bold capitalize has-[:checked]:bg-fg has-[:checked]:text-bg has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-(--ring)">
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

            <fieldset className="flex flex-col gap-1">
              <legend className={`${GROUP} mb-2`}>Your routine</legend>
              <Range id="hours" label="Hours out per day" value={life.hours_out_per_day} min={0} max={12} suffix="h" onChange={(v) => set('hours_out_per_day', v)} />
              <Range id="noise" label="Noise you can live with" value={life.noise_tolerance} min={1} max={5} suffix="/5"
                onChange={(v) => set('noise_tolerance', v as Lifestyle['noise_tolerance'])} />
              <Range id="holiday" label="Nights away per year" value={life.holiday_nights_per_year} min={0} max={30} suffix=""
                onChange={(v) => set('holiday_nights_per_year', v)} />
            </fieldset>
          </div>

          <div className="border-t border-line pt-6"><fieldset className="flex flex-col">
            <legend className={`${GROUP} mb-2`}>Compare (up to 3)</legend>
            {SPECIES.map((s) => {
              const on = picked.includes(s.id);
              const disabled = !on && picked.length >= 3;
              return (
                <label key={s.id} htmlFor={`pick-${s.id}`}
                  className={`flex min-h-14 cursor-pointer items-center gap-3 border-t border-line py-2 has-[:checked]:font-bold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-(--ring) ${disabled ? 'opacity-60' : ''}`}>
                  <Icon name={s.kind} className={`size-9 ${on ? 'text-fg' : 'text-muted'}`} />
                  <span className="flex-1">{s.name}</span>
                  <input type="checkbox" id={`pick-${s.id}`} checked={on} disabled={disabled}
                    onChange={(e) => setPicked((p) => (e.target.checked ? [...p, s.id] : p.filter((x) => x !== s.id)))} />
                </label>
              );
            })}
          </fieldset></div>

          <div className="flex flex-col">
            <details className="disclosure border-t border-line">
              <summary><span>Stress tests</span><span className="text-sm font-normal text-muted">{stressOn ? `${stressOn} on` : 'none on'}</span></summary>
              <fieldset className="flex flex-col gap-2 pb-4">
                <legend className="sr-only">Stress tests</legend>
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
            </details>

            <details className="disclosure border-y border-line">
              <summary><span>Assumptions</span><span className="text-sm font-normal text-muted">age {assume.startAge}, {assume.years ? `${assume.years} years` : 'full lifespan'}</span></summary>
              <fieldset className="flex flex-col gap-3 pb-4">
                <legend className="sr-only">Assumptions</legend>
                <Range id="start-age" label="Pet's age when you get them" value={assume.startAge} min={0} max={10} suffix=" yrs"
                  onChange={(v) => setAssume((a) => ({ ...a, startAge: v }))} />
                <div className="flex flex-col gap-1">
                  <label htmlFor="horizon" className="font-semibold">Project over</label>
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
            </details>
          </div>
        </aside>

        {/* Results */}
        <main className="flex min-w-0 flex-col gap-6">
          {results.length === 0 ? (
            <p className="rounded-card border border-dashed border-edge p-8 text-center text-muted">Pick at least one pet to compare.</p>
          ) : (
            <>
              {/* Live summary: fixed to the bottom on phones, sticky at the top of this column on desktop. */}
              <section aria-label="Summary of your pets" className="dock fixed inset-x-0 bottom-0 z-30 border-x-0 border-b-0 pb-[max(.5rem,env(safe-area-inset-bottom,0px))] pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pt-2 lg:sticky lg:inset-x-auto lg:bottom-auto lg:top-4 lg:rounded-card lg:border lg:p-3 print:hidden">
                <ul className="mx-auto grid max-w-7xl gap-x-3" style={{ gridTemplateColumns: `repeat(${results.length}, minmax(0, 1fr))` }}>
                  {results.map(({ sp, sim }, i) => {
                    const b = band(sim.readiness.score);
                    return (
                      <li key={sp.id} className="flex min-w-0 flex-col">
                        <span className="flex items-start gap-2 text-sm font-bold leading-tight"><span className="mt-1.5"><Swatch i={i} /></span><span className="line-clamp-2">{short(sp.name)}</span></span>
                        <span className="fig whitespace-nowrap font-display text-xl font-bold leading-tight tracking-tight">{gbp(sim.monthly)}<span className="text-sm font-normal text-muted"> a month</span></span>
                        <span className={`truncate text-sm font-bold ${b.text}`}>{b.brief}{b.brief !== b.label && <span className="sr-only"> with changes</span>}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[repeat(auto-fit,minmax(17rem,1fr))]">
                {results.map(({ sp, sim }, i) => (
                  <PetCard key={sp.id} name={sp.name} kind={sp.kind} sim={sim} i={i} emergencyOn={!!whatIfs.emergency}
                    onResume={() => { setResumeFor(sp.id); scrollTo(0, 0); }} />
                ))}
              </section>

              <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-6">
              <section className={`${CELL} lg:col-span-6`}>
                <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 max-w-[70ch]">
                    <h2 className={H2}>Lifetime cost, year by year</h2>
                    <p className="text-muted">
                      {perYear ? 'What each year costs.' : 'Running total from the year you get them.'} Other prices rise {assume.generalInflation * 100}% a year,
                      vet and insurance {Math.round(assume.medicalInflation * 100)}%. Insurance and check-ups cost more once a pet is a senior.
                    </p>
                  </div>
                  <div role="group" aria-label="Chart view" className="flex divide-x divide-edge overflow-hidden rounded-control border border-edge">
                    {[['Running total', false], ['Per year', true]].map(([label, v]) => (
                      <button key={String(label)} type="button" aria-pressed={perYear === v} onClick={() => setPerYear(v as boolean)}
                        className={`min-h-11 px-4 py-2 font-bold ${perYear === v ? 'bg-fg text-bg' : 'text-muted hover:text-fg'}`}>{label}</button>
                    ))}
                  </div>
                </div>
                <div role="img" aria-label={chartText} className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chart} accessibilityLayer={false} margin={{ top: 12, right: 92, bottom: 0, left: 4 }}>
                      <CartesianGrid stroke="var(--line)" vertical={false} />
                      <XAxis dataKey="year" height={44} tick={{ fill: 'var(--muted)', fontSize: 13 }} stroke="var(--edge)" label={{ value: 'Year', position: 'insideBottom', offset: 0, fill: 'var(--muted)', fontSize: 13 }} />
                      <YAxis tickFormatter={(v: number) => `£${(v / 100000).toLocaleString('en-GB', { maximumFractionDigits: 1 })}k`} tick={{ fill: 'var(--muted)', fontSize: 13 }} stroke="var(--edge)" width={52} />
                      <Tooltip formatter={(v) => gbp(Number(v))} labelFormatter={(y) => `Year ${y}`}
                        contentStyle={{ background: 'var(--surface)', border: '1px solid var(--edge)', color: 'var(--fg)', borderRadius: 8 }} />
                      {whatIfs.emergency && (
                        <ReferenceLine x={Math.min(whatIfs.emergency_year ?? 1, maxYears)} stroke="var(--bad)" strokeDasharray="4 3"
                          label={{ value: 'Emergency', position: 'insideTopLeft', fill: 'var(--bad)', fontSize: 13 }} />
                      )}
                      {results.map(({ sp, sim }, i) => (
                        <Line key={sp.id} dataKey={sp.id} name={sp.name} stroke={SERIES[i]} strokeWidth={3} strokeDasharray={DASH[i]} strokeLinecap="round"
                          dot={false} connectNulls={false} isAnimationActive={false} label={endLabel(i, short(sp.name), sim.years.length - 1)} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>

              {results.length > 1 && <Comparison results={results} className={vets ? 'lg:col-span-4' : 'lg:col-span-6'} />}
              {vets && <VetList vets={vets} at={checkedAt} postcode={postcode} className={results.length > 1 ? 'lg:col-span-2' : 'lg:col-span-6'} exotic={results.filter((r) => ['reptile', 'bird'].includes(r.sp.kind)).map((r) => r.sp.name)} />}
              <NearbyPlaces point={point} region={region} className={`${CELL} lg:col-span-6`} />

              <section className={`${CELL} flex flex-col lg:col-span-6`}>
                <h2 className={`${H2} mb-2`}>Cost breakdown</h2>
                {results.map(({ sp, sim }) => (
                  <details key={sp.id} className="disclosure border-t border-line">
                    <summary>
                      <span className="min-w-0 flex-1">{sp.name}<span className="sr-only">, </span></span>
                      <span className="whitespace-nowrap tabular-nums">{gbp(sim.monthly)} a month</span>
                    </summary>
                    <div role="region" aria-label={`${sp.name} cost lines`} tabIndex={0} className="overflow-x-auto pb-4">
                      <table className="w-full min-w-[26rem] text-sm tabular-nums">
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
                      {sp.legal_notes && <p className="mt-3 max-w-[70ch] text-sm text-muted">{sp.legal_notes}</p>}
                    </div>
                  </details>
                ))}
              </section>
              </div>
            </>
          )}
        </main>
      </div>
      <footer className="mt-12 max-w-[90ch] border-t border-line pt-6 text-sm text-muted">
        Pet silhouettes from <a href="https://game-icons.net" className="underline" target="_blank" rel="noreferrer">game-icons.net</a> by Lorc, Delapouite and contributors,
        licensed <a href="https://creativecommons.org/licenses/by/3.0/" className="underline" target="_blank" rel="noreferrer">CC BY 3.0</a>.
        Region map: Contains National Statistics and OS data &copy; Crown copyright and database right 2026,
        under the <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" className="underline" target="_blank" rel="noreferrer">Open Government Licence v3.0</a>.
        Council areas and postcode district centres: the same licence, from the Office for National Statistics.
        Rescue centres and pet shops: &copy; <a href="https://www.openstreetmap.org/copyright" className="underline" target="_blank" rel="noreferrer">OpenStreetMap contributors</a> (ODbL).
      </footer>
    </div>
    </div>
  );
}

/** The pet's line style from the chart: colour plus dash pattern. */
function Swatch({ i }: { i: number }) {
  return (
    <svg aria-hidden width="28" height="8" viewBox="0 0 28 8" className="shrink-0">
      <line x1="2" x2="26" y1="4" y2="4" stroke={SERIES[i]} strokeWidth="3" strokeLinecap="round" strokeDasharray={DASH[i]} />
    </svg>
  );
}

function PetCard({ name, kind, sim, i, emergencyOn, onResume }: { name: string; kind: string; sim: Simulation; i: number; emergencyOn: boolean; onResume: () => void }) {
  const { score, issues } = sim.readiness;
  const b = band(score);
  return (
    <article className={`${CELL} flex flex-col gap-4`}>
      <div className="flex items-start justify-between gap-4">
        <h3 className="flex min-w-0 flex-col items-start gap-2 font-display text-xl font-bold leading-tight tracking-tight">
          <Swatch i={i} />{name}
        </h3>
        <span style={{ color: SERIES[i] }}><Icon name={kind} className="size-14" /></span>
      </div>
      <dl className="grid grid-cols-2 gap-4">
        <div className="col-span-2 flex flex-col">
          <dt className="text-sm font-bold text-muted">Per month</dt>
          <dd className="font-display text-5xl font-bold tracking-tight tabular-nums">{gbp(sim.monthly)}</dd>
        </div>
        <Figure label="Upfront" value={gbp(sim.upfront)} />
        <Figure label={`${sim.years.length} years`} value={gbp(sim.lifetime)} />
      </dl>

      {/* One score, then what moves it. */}
      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <p className={`font-bold ${b.text}`}>Fit score {score}: {b.label}</p>
        <div role="meter" aria-label={`Fit score for ${name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={score} aria-valuetext={`${score} out of 100, ${b.label}`}
          className="h-3 overflow-hidden rounded-full border border-edge bg-bg">
          <div className="meter-fill" style={{ width: `${score}%`, background: b.bar }} />
        </div>
        {issues.length > 0 && (
          <ul className="mt-1 flex flex-col gap-1">
            {issues.map((x) => <li key={x.message} className={SEVERITY[x.severity]}><span className="font-bold">{SEVERITY_WORD[x.severity]}.</span> {x.message}</li>)}
          </ul>
        )}
      </div>

      <p className="border-t border-line pt-4">
        Budget <strong className="tabular-nums">{gbp(sim.monthlyAverage)}</strong>/month on average. Most expensive: year {sim.peak.year} at <strong className="tabular-nums">{gbp(sim.peak.cost)}</strong>.
      </p>
      <p className="text-sm text-muted">
        {sim.insured ? `Insured: an emergency costs you the ${gbp(sim.emergency)} excess.` : `Uninsured: an emergency costs you ${gbp(sim.emergency)} at today's prices.`}
        {!emergencyOn && ' Turn on the stress test to add it.'}
      </p>
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
    <section className={`${CELL} flex flex-col gap-4 ${className}`}>
      <h2 className={H2}>Side by side</h2>
      <div role="region" aria-label="Side by side comparison, scrolls sideways on narrow screens" tabIndex={0} className="overflow-x-auto">
        <table className="w-full min-w-[28rem] text-sm tabular-nums">
          <thead>
            <tr className="text-left">
              <th className="sticky left-0 bg-surface p-3 font-semibold text-muted">Best value marked</th>
              {results.map(({ sp }) => <th key={sp.id} scope="col" className="p-3 text-right font-semibold">{sp.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([label, value, format, best]) => {
              const vals = results.map((r) => value(r.sp, r.sim));
              const target = best === 'low' ? Math.min(...vals) : best === 'high' ? Math.max(...vals) : null;
              const tie = vals.every((v) => v === target);
              return (
                <tr key={label} className="border-t border-line">
                  <th scope="row" className="sticky left-0 bg-surface p-3 text-left font-normal text-muted">{label}</th>
                  {vals.map((v, i) => (
                    <td key={results[i].sp.id} className={`p-3 text-right font-mono ${v === target && !tie ? 'font-bold text-good' : ''}`}>
                      {v === target && !tie && <span className="mr-2 text-xs font-bold uppercase tracking-wide">best</span>}{format(v)}
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

function VetList({ vets, at, postcode, exotic, className }: { vets: Vet[] | 'loading' | { error: string }; at: string | null; postcode: string; exotic: string[]; className: string }) {
  return (
    <section className={`${CELL} flex flex-col gap-4 ${className}`} aria-live="polite">
      <div>
        <h2 className={H2}>Vets near {postcode.toUpperCase()}</h2>
        {at && vets !== 'loading' && <p className="text-sm text-muted">Checked at {at}</p>}
        {exotic.length > 0 && (
          <p className="mt-1 text-warn">{exotic.join(' and ')} need{exotic.length === 1 ? 's' : ''} an exotics vet. Not every practice treats them, so call ahead.</p>
        )}
      </div>
      {vets === 'loading' ? (
        <>
          <p className="sr-only">Searching OpenStreetMap within 10 km…</p>
          <ul aria-hidden className="flex flex-col">
            {[0, 1, 2].map((n) => (
              <li key={n} className="flex flex-col gap-2 border-t border-line py-4 motion-safe:animate-pulse">
                <div className="flex justify-between gap-6"><span className="skeleton h-5 w-2/3" /><span className="skeleton h-5 w-12" /></div>
                <span className="skeleton h-4 w-full" />
                <span className="skeleton h-4 w-1/3" />
              </li>
            ))}
          </ul>
        </>
      ) : 'error' in vets ? (
        <p className="text-warn">{vets.error}</p>
      ) : vets.length === 0 ? (
        <p className="text-muted">No vets are mapped within 10 km. Try a nearby town's postcode.</p>
      ) : (
        <ul className="flex flex-col">
          {vets.map((v) => (
            <li key={v.id} className="flex min-w-0 flex-col gap-1 border-t border-line py-3">
              <div className="flex items-start justify-between gap-3">
                <a href={`https://www.openstreetmap.org/${v.id}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center font-bold underline-offset-2 hover:underline">{v.name}</a>
                <span className="inline-flex min-h-11 items-center whitespace-nowrap font-mono tabular-nums text-muted">{v.km.toFixed(1)} km</span>
              </div>
              {v.emergency && <span className="self-start rounded-control border border-good px-2 text-sm font-bold text-good">24-hour / emergency</span>}
              {v.address && <p className="text-muted">{v.address}</p>}
              {v.phone && <p className="select-all font-mono">{v.phone}</p>}
              {v.website && <a href={v.website} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center truncate text-accent underline underline-offset-2">{v.website.replace(/^https?:\/\//, '')}</a>}
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-muted">Practice data &copy; OpenStreetMap contributors. Check opening hours with the practice.</p>
    </section>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-sm font-bold text-muted">{label}</dt>
      <dd className="font-display text-2xl font-bold tracking-tight tabular-nums">{value}</dd>
    </div>
  );
}

function Check({ id, label, checked, disabled, onChange }: { id: string; label: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className={`flex min-h-11 cursor-pointer items-center gap-3 ${disabled ? 'opacity-60' : ''}`}>
      <input type="checkbox" id={id} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  );
}

function Range({ id, label, value, min, max, suffix, onChange }: { id: string; label: string; value: number; min: number; max: number; suffix: string; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col">
      <label htmlFor={id} className="flex justify-between gap-3 font-semibold">
        {label} <span className="fig text-right font-bold">{value}{suffix}</span>
      </label>
      <input type="range" id={id} min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
