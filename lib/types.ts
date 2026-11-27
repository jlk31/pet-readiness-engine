// Mirrors supabase/migrations/20261127000000_init.sql.
// ponytail: hand-written; swap for `supabase gen types typescript` once a project is linked.

export type SpeciesKind = 'cat' | 'dog' | 'rabbit' | 'rodent' | 'bird' | 'reptile' | 'fish' | 'other';
export type HousingFit = 'flat_ok' | 'house_preferred' | 'house_with_garden';
export type CostFrequency = 'one_off' | 'monthly' | 'annual' | 'per_night' | 'emergency';
export type ServiceCategory = 'vet' | 'insurance' | 'sitter';
export type CostTrigger = 'left_alone_too_long';

/** Integer pence. Format only at the UI edge. */
export type Pence = number;

export interface Species {
  id: string;
  kind: SpeciesKind;
  name: string;
  lifespan_years: number;
  senior_age_years: number;
  housing: HousingFit;
  max_hours_alone: number;
  daily_exercise_mins: number;
  noise_level: 1 | 2 | 3 | 4 | 5;
  allergen_level: 1 | 2 | 3 | 4 | 5;
  microchip_required: boolean;
  legal_notes: string | null;
  traits: Record<string, unknown>;
}

export interface CostItem {
  id: number;
  species_id: string;
  name: string;
  frequency: CostFrequency;
  amount_pence: Pence;
  service: ServiceCategory | null;
  trigger: CostTrigger | null;
  senior_multiplier: number;
  is_essential: boolean;
}

export interface RegionalMultiplier {
  region: string; // Postcodes.io `region`, or `country` outside England
  service: ServiceCategory;
  multiplier: number;
}

/** User inputs to the readiness scorer (saved_scenarios.lifestyle). */
export interface Lifestyle {
  housing: 'flat' | 'house';
  has_garden: boolean;
  renting: boolean;
  hours_out_per_day: number;
  lives_alone: boolean;
  allergies: boolean;
  noise_tolerance: 1 | 2 | 3 | 4 | 5; // max species noise_level the user accepts
  holiday_nights_per_year: number;
}

/** Stress-test toggles (saved_scenarios.what_ifs). */
export interface WhatIfs {
  emergency?: boolean;          // include each species' emergency cost item once
  emergency_year?: number;      // 1-based year it happens (default 1)
  extra_boarding_nights?: number;
  uninsured?: boolean;          // drop insurance premiums; emergencies paid in full
}

export interface SavedScenario {
  id: string;
  user_id: string;
  name: string;
  postcode: string;
  species_ids: string[]; // 1–3
  lifestyle: Lifestyle;
  what_ifs: WhatIfs;
  created_at: string;
}

/** Species with its cost lines, as the engine consumes it. */
export type SpeciesWithCosts = Species & { cost_items: CostItem[] };
