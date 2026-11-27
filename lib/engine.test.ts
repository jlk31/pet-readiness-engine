import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPECIES, MULTIPLIERS } from './data.ts';
import { multipliersFor, simulate, DEFAULT_ASSUMPTIONS, INSURANCE_EXCESS } from './engine.ts';
import type { Lifestyle } from './types.ts';

const [cat, dog, gecko] = ['indoor-adult-cat', 'medium-dog', 'leopard-gecko'].map((id) => SPECIES.find((s) => s.id === id)!);
const flatWorker: Lifestyle = {
  housing: 'flat', has_garden: false, renting: true, hours_out_per_day: 9, lives_alone: true,
  allergies: false, noise_tolerance: 3, holiday_nights_per_year: 0,
};
const national = multipliersFor('Wales', MULTIPLIERS);

test('national prices: cat monthly = sum of monthly + annual/12', () => {
  const s = simulate(cat, flatWorker, national);
  assert.equal(s.monthly, Math.round((3500 + 1200 + 1200 + 1800) * 12 / 12 + 6500 / 12));
  assert.equal(s.upfront, 9500 + 2500 + 4500 + 3000 + 4000 + 6000);
  assert.equal(s.readiness.score, 100);
});

test('dog left alone in a flat: walker added, blocked on housing', () => {
  const s = simulate(dog, flatWorker, national);
  assert.ok(s.readiness.triggers.includes('left_alone_too_long'));
  assert.ok(s.lines.find((l) => l.item.trigger)!.active);
  assert.ok(s.readiness.issues.some((i) => i.severity === 'blocker'));
  assert.equal(s.readiness.score, 100 - 20 - 30 - 10);
  const notAlone = simulate(dog, { ...flatWorker, lives_alone: false }, national);
  assert.equal(s.monthly - notAlone.monthly, 30000);
});

test('London multiplies only tagged services', () => {
  const ldn = simulate(cat, flatWorker, multipliersFor('London', MULTIPLIERS));
  const food = ldn.lines.find((l) => l.item.name.startsWith('Food'))!;
  const ins = ldn.lines.find((l) => l.item.service === 'insurance')!;
  assert.equal(food.amount, 3500);
  assert.equal(ins.amount, Math.round(1800 * 1.35));
});

test('lifetime: horizon, cumulative, senior uplift, what-ifs', () => {
  const s = simulate(gecko, flatWorker, national);
  assert.equal(s.years.length, gecko.lifespan_years - DEFAULT_ASSUMPTIONS.startAge);
  assert.equal(s.lifetime, s.years.reduce((t, y) => t + y.cost, 0));
  const flat = simulate(cat, flatWorker, national, {}, { ...DEFAULT_ASSUMPTIONS, medicalInflation: 0, generalInflation: 0 });
  const pre = flat.years.find((y) => y.age === cat.senior_age_years - 1)!;
  const senior = flat.years.find((y) => y.age === cat.senior_age_years)!;
  assert.equal(senior.cost - pre.cost, Math.round(1800 * 12 * 1.2 + 6500 * 0.5));
  const base = simulate(cat, flatWorker, national);
  const stress = simulate(cat, flatWorker, national, { emergency: true, extra_boarding_nights: 14 });
  assert.equal(stress.years[0].cost - base.years[0].cost, INSURANCE_EXCESS + 14 * 1600);
  assert.equal(base.peak.cost, Math.max(...base.years.map((y) => y.cost)));
  assert.equal(base.monthlyAverage, Math.round(base.lifetime / (base.years.length * 12)));
});

test('insurance what-if: uninsured drops premiums, emergency paid in full and inflated in its year', () => {
  const r = 0.06;
  const a = { ...DEFAULT_ASSUMPTIONS, generalInflation: 0, medicalInflation: r };
  const insured = simulate(cat, flatWorker, national, { emergency: true, emergency_year: 5 }, a);
  const bare = simulate(cat, flatWorker, national, { emergency: true, emergency_year: 5, uninsured: true }, a);
  assert.equal(insured.insured, true);
  assert.equal(bare.insured, false);
  assert.equal(insured.emergency, INSURANCE_EXCESS);
  assert.equal(bare.emergency, 150000);
  assert.equal(bare.monthly, insured.monthly - 1800);
  const noEm = simulate(cat, flatWorker, national, { uninsured: true }, a);
  // each year's total is rounded on its own, so allow 1p
  assert.ok(Math.abs(bare.years[4].cost - noEm.years[4].cost - 150000 * (1 + r) ** 4) <= 1);
  assert.equal(bare.years[3].cost, noEm.years[3].cost);
  // year clamps to the horizon; horizon option and start age respected
  assert.equal(simulate(cat, flatWorker, national, {}, { ...a, years: 10 }).years.length, 10);
  assert.equal(simulate(cat, flatWorker, national, {}, { ...a, startAge: 5 }).years[0].age, 5);
});
