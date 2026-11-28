-- New Supabase projects don't auto-grant table access to the API roles.
-- Reference data is public and read-only; RLS read policies already allow it, this adds the grant.
grant usage on schema public to anon, authenticated;
grant select on species, cost_items, regional_multipliers to anon, authenticated;
