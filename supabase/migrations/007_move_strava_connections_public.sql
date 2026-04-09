-- ============================================================================
-- Move private.strava_connections → public.strava_connections
-- ============================================================================
-- PostgREST (the REST layer that supabase-js v2 uses) only exposes schemas
-- listed in the project's db-schemas setting. The `private` schema is NOT
-- exposed, so .schema("private").from("strava_connections") always returns a
-- 404 / PGRST106 error from the service_role client.
--
-- Fix: move the table to the `public` schema, enable RLS, and add NO policies.
-- With RLS enabled and zero policies, every request from the anon and
-- authenticated roles is rejected by default. The service_role key bypasses
-- RLS entirely, so the admin client retains full access.
-- ============================================================================

-- 1. Create replacement table in public schema
create table if not exists public.strava_connections (
  user_id          uuid        primary key references auth.users(id) on delete cascade,
  athlete_id       bigint      not null unique,
  access_token     text        not null,
  refresh_token    text        not null,
  expires_at       timestamptz not null,
  scope            text        not null,
  connected_at     timestamptz not null default now(),
  disconnected_at  timestamptz,
  last_sync_at     timestamptz,
  backfill_status  text        not null default 'pending'
                               check (backfill_status in ('pending','running','done','error')),
  backfill_error   text
);

create index if not exists strava_connections_athlete_idx
  on public.strava_connections (athlete_id);

-- 2. Enable RLS — with no policies added below, anon/authenticated are
--    completely blocked. service_role bypasses RLS and retains full access.
alter table public.strava_connections enable row level security;

-- 3. Migrate any existing rows from private schema (safe no-op if empty)
insert into public.strava_connections
  select * from private.strava_connections
  on conflict (user_id) do nothing;

-- 4. Drop old private table (data already copied above)
drop table if exists private.strava_connections;
