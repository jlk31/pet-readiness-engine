// Server-side validation for everything a client sends. Rebuilds objects from known fields only,
// so extra keys (user_id, id, created_at...) are dropped, never passed to the DB.
import { SPECIES } from './data.ts';
import { UK_REGIONS } from './location.ts';
import type { Assumptions } from './engine.ts';
import type { Lifestyle, WhatIfs } from './types.ts';

export interface ScenarioInput {
  name: string;
  postcode: string;
  region: string;
  species_ids: string[];
  lifestyle: Lifestyle;
  what_ifs: WhatIfs;
  assumptions: Assumptions;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

class Invalid extends Error {}
const fail = (msg: string): never => { throw new Invalid(msg); };
const obj = (v: unknown, f: string) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : fail(`${f} is invalid.`));
const bool = (v: unknown, f: string) => (typeof v === 'boolean' ? v : fail(`${f} must be true or false.`));
const int = (v: unknown, f: string, min: number, max: number) =>
  (Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? (v as number) : fail(`${f} must be a whole number from ${min} to ${max}.`));
const num = (v: unknown, f: string, min: number, max: number) =>
  (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fail(`${f} must be between ${min} and ${max}.`));
const opt = <T>(v: unknown, parse: (v: unknown) => T) => (v === undefined ? undefined : parse(v));

const POSTCODE = /^[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SPECIES_IDS = new Set(SPECIES.map((s) => s.id));

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

export function normalisePostcode(v: unknown): string {
  const p = typeof v === 'string' ? v.toUpperCase().replace(/\s+/g, '') : '';
  if (!POSTCODE.test(p)) fail('Enter a valid UK postcode.');
  return `${p.slice(0, -3)} ${p.slice(-3)}`;
}

export function parseScenario(input: unknown): Result<ScenarioInput> {
  try {
    const i = obj(input, 'Scenario');
    const name = typeof i.name === 'string' ? i.name.trim() : '';
    if (name.length < 1 || name.length > 80) fail('Give the scenario a name of up to 80 characters.');
    const region = typeof i.region === 'string' && UK_REGIONS.includes(i.region) ? i.region : fail('Pick a UK region.');
    const ids = Array.isArray(i.species_ids) ? i.species_ids : fail('Pick at least one pet.');
    if (ids.length < 1 || ids.length > 3 || new Set(ids).size !== ids.length || !ids.every((s) => typeof s === 'string' && SPECIES_IDS.has(s))) {
      fail('Pick one to three different pets.');
    }
    const l = obj(i.lifestyle, 'Lifestyle');
    const w = obj(i.what_ifs ?? {}, 'Stress test');
    const a = obj(i.assumptions ?? {}, 'Assumptions');
    return {
      ok: true,
      value: {
        name,
        postcode: normalisePostcode(i.postcode),
        region,
        species_ids: ids as string[],
        lifestyle: {
          housing: l.housing === 'flat' || l.housing === 'house' ? l.housing : fail('Housing must be flat or house.'),
          has_garden: bool(l.has_garden, 'Garden'),
          renting: bool(l.renting, 'Renting'),
          lives_alone: bool(l.lives_alone, 'Lives alone'),
          allergies: bool(l.allergies, 'Allergies'),
          hours_out_per_day: int(l.hours_out_per_day, 'Hours out', 0, 24),
          noise_tolerance: int(l.noise_tolerance, 'Noise tolerance', 1, 5) as Lifestyle['noise_tolerance'],
          holiday_nights_per_year: int(l.holiday_nights_per_year, 'Nights away', 0, 365),
        },
        what_ifs: {
          emergency: opt(w.emergency, (v) => bool(v, 'Emergency')),
          emergency_year: opt(w.emergency_year, (v) => int(v, 'Emergency year', 1, 30)),
          extra_boarding_nights: opt(w.extra_boarding_nights, (v) => int(v, 'Extra boarding nights', 0, 365)),
          uninsured: opt(w.uninsured, (v) => bool(v, 'No insurance')),
        },
        assumptions: {
          startAge: int(a.startAge, 'Starting age', 0, 30),
          years: opt(a.years, (v) => int(v, 'Years', 1, 30)),
          generalInflation: num(a.generalInflation, 'General inflation', 0, 0.2),
          medicalInflation: num(a.medicalInflation, 'Vet inflation', 0, 0.2),
        },
      },
    };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, error: e.message };
    throw e;
  }
}

export function parseCredentials(form: FormData): Result<{ email: string; password: string }> {
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const password = String(form.get('password') ?? '');
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Enter a valid email address.' };
  // 72 bytes is bcrypt's input limit; Supabase hashes with bcrypt.
  if (password.length < 10 || Buffer.byteLength(password) > 72) return { ok: false, error: 'Use a password of 10 to 72 characters.' };
  return { ok: true, value: { email, password } };
}
