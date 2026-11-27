-- Security hardening for saved scenarios, plus a login rate limiter.

-- 1. Scenario columns the app now saves. `postcode` holds AES-256-GCM ciphertext (see lib/crypto.ts).
alter table saved_scenarios
  add column region      text  not null default 'London',
  add column assumptions jsonb not null default '{}',
  add constraint name_len        check (char_length(name) between 1 and 80),
  add constraint postcode_len    check (char_length(postcode) <= 200),
  add constraint region_len      check (char_length(region) <= 40),
  add constraint lifestyle_obj   check (jsonb_typeof(lifestyle) = 'object' and pg_column_size(lifestyle) < 2048),
  add constraint what_ifs_obj    check (jsonb_typeof(what_ifs) = 'object' and pg_column_size(what_ifs) < 1024),
  add constraint assumptions_obj check (jsonb_typeof(assumptions) = 'object' and pg_column_size(assumptions) < 1024);

-- 2. Lock record access: one policy per operation, owner only, signed-in users only.
drop policy "owner all" on saved_scenarios;
create policy "owner select" on saved_scenarios for select to authenticated using (user_id = (select auth.uid()));
create policy "owner insert" on saved_scenarios for insert to authenticated with check (user_id = (select auth.uid()));
create policy "owner update" on saved_scenarios for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner delete" on saved_scenarios for delete to authenticated using (user_id = (select auth.uid()));

-- 3. Block field tampering: clients can never write id, user_id or created_at
--    (user_id comes from auth.uid() via its default).
revoke all on saved_scenarios from anon, authenticated;
grant select, delete on saved_scenarios to authenticated;
grant insert (name, postcode, region, species_ids, lifestyle, what_ifs, assumptions) on saved_scenarios to authenticated;
grant update (name, postcode, region, species_ids, lifestyle, what_ifs, assumptions) on saved_scenarios to authenticated;

-- Reference data is read-only for everyone (RLS already has no write policies; this removes the grants too).
revoke insert, update, delete, truncate on species, cost_items, regional_multipliers from anon, authenticated;

-- 4. Rate limiter. The table lives in a schema the API doesn't expose; only the function can touch it.
create schema if not exists private;
create table private.rate_limits (
  key          text primary key check (char_length(key) <= 100),
  window_start timestamptz not null,
  hits         int not null
);
alter table private.rate_limits enable row level security;

-- Returns true while `key` has had at most `p_max` hits in the current window.
-- ponytail: rows are never cleaned up; schedule `delete from private.rate_limits where window_start < now() - interval '1 day'` with pg_cron at scale.
create function public.hit_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  insert into private.rate_limits as r (key, window_start, hits) values (p_key, now(), 1)
  on conflict (key) do update set
    hits         = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into n;
  return n <= p_max;
end $$;
revoke all on function public.hit_rate_limit(text, int, int) from public;
grant execute on function public.hit_rate_limit(text, int, int) to anon, authenticated;
