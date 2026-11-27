-- Attacks the RLS/grant setup as the API roles would. Everything rolls back.
-- Run against a local Supabase: psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/security.sql
begin;
insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');

-- User A
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
insert into saved_scenarios (name, postcode, species_ids, lifestyle) values ('A plan', 'ciphertext', '{medium-dog}', '{}');

do $$ begin
  begin
    insert into saved_scenarios (user_id, name, postcode, species_ids, lifestyle)
      values ('22222222-2222-2222-2222-222222222222', 'forged', 'x', '{medium-dog}', '{}');
    raise exception 'FAIL: client could set user_id';
  exception when insufficient_privilege then null; end;
  begin
    update saved_scenarios set user_id = '22222222-2222-2222-2222-222222222222';
    raise exception 'FAIL: client could change user_id';
  exception when insufficient_privilege then null; end;
  begin
    update saved_scenarios set created_at = now() - interval '9 years';
    raise exception 'FAIL: client could change created_at';
  exception when insufficient_privilege then null; end;
  begin
    insert into saved_scenarios (name, postcode, species_ids, lifestyle) values ('', 'x', '{medium-dog}', '{}');
    raise exception 'FAIL: empty name accepted';
  exception when check_violation then null; end;
  begin
    insert into saved_scenarios (name, postcode, species_ids, lifestyle) values ('x', 'x', '{medium-dog}', '[]');
    raise exception 'FAIL: non-object lifestyle accepted';
  exception when check_violation then null; end;
  begin
    insert into species (id, kind, name, lifespan_years, senior_age_years, housing, max_hours_alone, noise_level, allergen_level)
      values ('x', 'cat', 'x', 1, 1, 'flat_ok', 1, 1, 1);
    raise exception 'FAIL: client could write reference data';
  exception when insufficient_privilege then null; end;
  if (select count(*) from saved_scenarios) <> 1 then raise exception 'FAIL: A cannot see own row'; end if;
end $$;

-- User B cannot see, change or delete A's row
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
do $$
declare n int;
begin
  if (select count(*) from saved_scenarios) <> 0 then raise exception 'FAIL: B can read A''s scenario'; end if;
  update saved_scenarios set name = 'hijacked'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B can update A''s scenario'; end if;
  delete from saved_scenarios; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B can delete A''s scenario'; end if;
end $$;

-- Anonymous visitors: reference data yes, scenarios and rate-limit table no
reset role;
set local role anon;
do $$ begin
  if (select count(*) from species) = 0 then raise exception 'FAIL: anon cannot read species'; end if;
  begin
    perform 1 from saved_scenarios;
    raise exception 'FAIL: anon can query scenarios';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from private.rate_limits;
    raise exception 'FAIL: anon can read rate limits';
  exception when insufficient_privilege then null; end;
  if not public.hit_rate_limit('test:key', 2, 60) then raise exception 'FAIL: hit 1 limited'; end if;
  if not public.hit_rate_limit('test:key', 2, 60) then raise exception 'FAIL: hit 2 limited'; end if;
  if public.hit_rate_limit('test:key', 2, 60) then raise exception 'FAIL: hit 3 not limited'; end if;
end $$;

select 'PASS: security checks' as result;
rollback;
