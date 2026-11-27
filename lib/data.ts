// ponytail: reads seed.json directly until a Supabase project is linked; then swap for a DB query.
import seed from '../supabase/seed.json' with { type: 'json' };
import type { RegionalMultiplier, SpeciesWithCosts } from './types';

let id = 0;
export const SPECIES = seed.species.map((s) => ({
  ...s,
  cost_items: s.cost_items.map((c) => ({
    service: null, trigger: null, senior_multiplier: 1, is_essential: true, ...c, id: ++id, species_id: s.id,
  })),
})) as SpeciesWithCosts[];

export const MULTIPLIERS = seed.regional_multipliers as RegionalMultiplier[];
