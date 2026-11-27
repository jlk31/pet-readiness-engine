// Pure calculation engine: no I/O, no framework. All money in integer pence.
import type {
  CostItem, CostTrigger, Lifestyle, Pence, RegionalMultiplier, ServiceCategory, SpeciesWithCosts, WhatIfs,
} from './types';

export type Multipliers = Record<ServiceCategory, number>;

export interface Issue {
  severity: 'blocker' | 'warning' | 'info';
  message: string;
}

export interface Readiness {
  score: number; // 0–100
  issues: Issue[];
  triggers: CostTrigger[];
}

export interface Assumptions {
  startAge: number;         // pet's age when you get it
  years?: number;           // projection horizon; defaults to remaining lifespan
  generalInflation: number; // food, kit, sitters
  medicalInflation: number; // vet + insurance
}

export const DEFAULT_ASSUMPTIONS: Assumptions = { startAge: 1, generalInflation: 0.03, medicalInflation: 0.06 };

// ponytail: one typical UK lifetime-policy excess for every species; make it a cost_items column if policies differ
export const INSURANCE_EXCESS: Pence = 15000;

export interface CostLine {
  item: CostItem;
  amount: Pence;   // after regional multiplier, before inflation
  active: boolean; // false = conditional cost whose trigger didn't fire
}

export interface YearPoint {
  year: number;
  age: number;
  cost: Pence;
  cumulative: Pence;
}

export interface Simulation {
  readiness: Readiness;
  lines: CostLine[];
  upfront: Pence;
  monthly: Pence;  // true monthly: monthly + annual/12 + boarding/12, today's prices
  emergency: Pence; // what an emergency costs you today: the excess if insured, the full bill if not
  insured: boolean;
  years: YearPoint[];
  lifetime: Pence;
  peak: YearPoint;        // most expensive year
  monthlyAverage: Pence;  // lifetime / months, the amount to budget
}

/** Region is Postcodes.io `region` (England) or `country`. Unknown region/service => 1. */
export function multipliersFor(region: string | null, rows: RegionalMultiplier[]): Multipliers {
  const m: Multipliers = { vet: 1, insurance: 1, sitter: 1 };
  for (const r of rows) if (r.region === region) m[r.service] = Number(r.multiplier);
  return m;
}

const HOUSING_PENALTY = {
  flat_ok: { flat: 0, house: 0, garden: 0 },
  house_preferred: { flat: 10, house: 0, garden: 0 },
  house_with_garden: { flat: 30, house: 15, garden: 0 },
} as const;

export function assess(sp: SpeciesWithCosts, life: Lifestyle): Readiness {
  const issues: Issue[] = [];
  const triggers: CostTrigger[] = [];
  let penalty = 0;

  if (life.hours_out_per_day > sp.max_hours_alone) {
    if (life.lives_alone) {
      triggers.push('left_alone_too_long');
      penalty += 20;
      issues.push({ severity: 'warning', message: `Left alone ${life.hours_out_per_day}h a day; limit is ${sp.max_hours_alone}h. Daily cover cost added.` });
    } else {
      issues.push({ severity: 'info', message: `Needs company after ${sp.max_hours_alone}h. Make sure someone in your household covers it.` });
    }
  }

  const home = life.housing === 'flat' ? 'flat' : life.has_garden ? 'garden' : 'house';
  const hp = HOUSING_PENALTY[sp.housing][home];
  if (hp) {
    penalty += hp;
    issues.push({ severity: hp >= 30 ? 'blocker' : 'warning', message: sp.housing === 'house_with_garden' ? 'Needs a house with a secure garden.' : 'Better suited to a house than a flat.' });
  }

  if (life.allergies && sp.allergen_level >= 3) {
    penalty += sp.allergen_level >= 4 ? 40 : 20;
    issues.push({ severity: sp.allergen_level >= 4 ? 'blocker' : 'warning', message: 'High allergen risk. Spend time with one before committing.' });
  }

  if (sp.noise_level > life.noise_tolerance) {
    penalty += 10 * (sp.noise_level - life.noise_tolerance);
    issues.push({ severity: 'warning', message: `Noisier (${sp.noise_level}/5) than you're comfortable with (${life.noise_tolerance}/5).` });
  }

  if (life.renting) issues.push({ severity: 'info', message: 'Renting: get written landlord consent first.' });
  if (sp.microchip_required) issues.push({ severity: 'info', message: 'Microchipping is a legal requirement.' });

  return { score: Math.max(0, 100 - penalty), issues, triggers };
}

export function simulate(
  sp: SpeciesWithCosts,
  life: Lifestyle,
  mult: Multipliers,
  whatIfs: WhatIfs = {},
  a: Assumptions = DEFAULT_ASSUMPTIONS,
): Simulation {
  const readiness = assess(sp, life);
  const lines: CostLine[] = sp.cost_items.map((item) => ({
    item,
    amount: Math.round(item.amount_pence * (item.service ? mult[item.service] : 1)),
    active: (!item.trigger || readiness.triggers.includes(item.trigger)) && !(whatIfs.uninsured && item.service === 'insurance'),
  }));
  const active = lines.filter((l) => l.active);
  const nights = life.holiday_nights_per_year + (whatIfs.extra_boarding_nights ?? 0);
  const perYear = (l: CostLine) =>
    l.item.frequency === 'monthly' ? l.amount * 12
    : l.item.frequency === 'annual' ? l.amount
    : l.item.frequency === 'per_night' ? l.amount * nights
    : 0;
  const sum = (f: (l: CostLine) => number) => active.reduce((t, l) => t + f(l), 0);

  const upfront = sum((l) => (l.item.frequency === 'one_off' ? l.amount : 0));
  const insured = active.some((l) => l.item.service === 'insurance');
  const bill = sum((l) => (l.item.frequency === 'emergency' ? l.amount : 0));
  const emergency = insured ? Math.min(bill, INSURANCE_EXCESS) : bill;
  const monthly = Math.round(sum(perYear) / 12);

  const startAge = Math.min(a.startAge, sp.lifespan_years - 1);
  const horizon = Math.max(1, a.years ?? sp.lifespan_years - startAge);
  const emergencyYear = Math.min(Math.max(1, whatIfs.emergency_year ?? 1), horizon);
  const years: YearPoint[] = [];
  let cumulative = 0;
  for (let year = 1; year <= horizon; year++) {
    const age = startAge + year - 1;
    let cost = sum((l) => {
      const medical = l.item.service === 'vet' || l.item.service === 'insurance';
      const inflation = (1 + (medical ? a.medicalInflation : a.generalInflation)) ** (year - 1);
      const senior = age >= sp.senior_age_years ? Number(l.item.senior_multiplier) : 1;
      return perYear(l) * inflation * senior;
    });
    if (year === 1) cost += upfront;
    if (whatIfs.emergency && year === emergencyYear) {
      cost += insured ? emergency : emergency * (1 + a.medicalInflation) ** (year - 1); // excess doesn't inflate
    }
    cost = Math.round(cost);
    cumulative += cost;
    years.push({ year, age, cost, cumulative });
  }

  const peak = years.reduce((m, y) => (y.cost > m.cost ? y : m));
  return {
    readiness, lines, upfront, monthly, emergency, insured, years, lifetime: cumulative, peak,
    monthlyAverage: Math.round(cumulative / (horizon * 12)),
  };
}

export const gbp = (p: Pence) =>
  (p / 100).toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
