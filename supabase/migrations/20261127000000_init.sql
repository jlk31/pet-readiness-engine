-- pawprint-ledger: initial schema
-- Money is stored as integer pence (no float rounding in the cost engine).

create type species_kind as enum ('cat', 'dog', 'rabbit', 'rodent', 'bird', 'reptile', 'fish', 'other');
create type housing_fit  as enum ('flat_ok', 'house_preferred', 'house_with_garden');
create type cost_frequency as enum ('one_off', 'monthly', 'annual', 'per_night', 'emergency');
-- Which regional multiplier applies to a cost line (null = national price, e.g. pet food).
create type service_category as enum ('vet', 'insurance', 'sitter');
-- When a conditional cost kicks in (null = always). Extend with ALTER TYPE ... ADD VALUE.
create type cost_trigger as enum ('left_alone_too_long');

-- One row per species/breed profile. Shared attributes are columns;
-- species-specific extras (e.g. vivarium temps, grooming coat type) go in `traits`.
create table species (
  id                   text primary key,              -- slug, e.g. 'indoor-adult-cat'
  kind                 species_kind not null,
  name                 text not null,
  lifespan_years       int  not null check (lifespan_years between 1 and 100),
  senior_age_years     int  not null check (senior_age_years <= lifespan_years),
  housing              housing_fit not null,
  max_hours_alone      int  not null check (max_hours_alone >= 0),
  daily_exercise_mins  int  not null default 0,
  noise_level          int  not null check (noise_level between 1 and 5),   -- 1 silent, 5 loud
  allergen_level       int  not null check (allergen_level between 1 and 5),-- 1 minimal, 5 high
  microchip_required   boolean not null default false,
  legal_notes          text,
  traits               jsonb not null default '{}'
);

create table cost_items (
  id                 bigint generated always as identity primary key,
  species_id         text not null references species(id) on delete cascade,
  name               text not null,
  frequency          cost_frequency not null,
  amount_pence       int  not null check (amount_pence >= 0),
  service            service_category,
  trigger            cost_trigger,
  senior_multiplier  numeric(4,2) not null default 1.00, -- applied from species.senior_age_years
  is_essential       boolean not null default true,     -- false = shows on checklist as optional
  unique (species_id, name)
);
create index on cost_items (species_id);

-- Keyed on Postcodes.io `region` (England) or `country` (Scotland/Wales/NI).
-- Missing region/service pair => engine uses 1.00.
create table regional_multipliers (
  region      text not null,
  service     service_category not null,
  multiplier  numeric(4,2) not null check (multiplier > 0),
  primary key (region, service)
);

create table saved_scenarios (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  postcode    text not null,
  species_ids text[] not null check (cardinality(species_ids) between 1 and 3),
  lifestyle   jsonb not null,               -- shape: Lifestyle in lib/types.ts
  what_ifs    jsonb not null default '{}',  -- shape: WhatIfs in lib/types.ts
  created_at  timestamptz not null default now()
);
create index on saved_scenarios (user_id);

-- RLS: reference data is public read-only; scenarios are owner-only.
alter table species              enable row level security;
alter table cost_items           enable row level security;
alter table regional_multipliers enable row level security;
alter table saved_scenarios      enable row level security;

create policy "public read" on species              for select using (true);
create policy "public read" on cost_items           for select using (true);
create policy "public read" on regional_multipliers for select using (true);
create policy "owner all"   on saved_scenarios for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
