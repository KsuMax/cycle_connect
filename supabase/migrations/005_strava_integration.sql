-- ============================================================================
-- Strava Integration — Sprint 1
-- ============================================================================
-- Creates the schema, tables, RLS policies and helper function required to
-- store Strava OAuth tokens, cache activities locally, queue webhook events
-- and keep per-user aggregates in sync with incoming data.
--
-- Design rules:
--   * Secrets (access_token / refresh_token) live in a dedicated `private`
--     schema that the anon and authenticated roles cannot even see. Only
--     service_role can touch it, and only via server-side Route Handlers.
--   * Activities live in public with RLS: owners see everything, other users
--     only see non-private activities when the owner opted in.
--   * A pending-events table decouples the webhook handler (which must
--     respond in < 2 seconds) from the async work of fetching activity
--     details from Strava.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Private schema for OAuth tokens
-- ---------------------------------------------------------------------------

create schema if not exists private;

-- Lock the schema down. Nothing implicit, nothing for anon/authenticated.
revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to service_role;

create table if not exists private.strava_connections (
  user_id          uuid        primary key references auth.users(id) on delete cascade,
  athlete_id       bigint      not null unique,
  access_token     text        not null,
  refresh_token    text        not null,
  expires_at       timestamptz not null,
  scope            text        not null,
  connected_at    timestamptz not null default now(),
  disconnected_at  timestamptz,
  last_sync_at     timestamptz,
  backfill_status  text        not null default 'pending'
                               check (backfill_status in ('pending','running','done','error')),
  backfill_error   text
);

create index if not exists strava_connections_athlete_idx
  on private.strava_connections (athlete_id);

-- Explicitly deny table access to the non-admin roles (defence in depth — the
-- schema grant above already blocks them, but this protects against future
-- accidental grants at the schema level).
revoke all on table private.strava_connections from public;
revoke all on table private.strava_connections from anon;
revoke all on table private.strava_connections from authenticated;
grant all on table private.strava_connections to service_role;

-- ---------------------------------------------------------------------------
-- 2. Public: Strava activities (cached locally, RLS-protected)
-- ---------------------------------------------------------------------------

create table if not exists public.strava_activities (
  -- identity
  id                     bigint      primary key,          -- Strava activity id
  user_id                uuid        not null references auth.users(id) on delete cascade,
  athlete_id             bigint      not null,

  -- classification
  type                   text        not null,             -- Ride, GravelRide, ...
  sport_type             text,
  name                   text,

  -- metrics
  distance_m             numeric     not null,
  moving_time_s          integer     not null,
  elapsed_time_s         integer     not null,
  total_elevation_gain_m numeric,
  average_speed_ms       numeric,
  max_speed_ms           numeric,
  average_heartrate      numeric,
  max_heartrate          numeric,
  average_watts          numeric,
  kudos_count            integer     not null default 0,

  -- temporal + geometry
  start_date             timestamptz not null,
  timezone               text,
  start_latlng           double precision[],
  end_latlng             double precision[],
  summary_polyline       text,

  -- Strava flags
  is_manual              boolean     not null default false,
  is_private             boolean     not null default false,
  is_commute             boolean     not null default false,
  is_trainer             boolean     not null default false,

  -- local flags
  is_counted             boolean     not null default true, -- counted toward stats

  -- raw payload for future migrations / debugging
  raw                    jsonb,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists strava_activities_user_date_idx
  on public.strava_activities (user_id, start_date desc);

create index if not exists strava_activities_public_feed_idx
  on public.strava_activities (start_date desc)
  where is_private = false and is_counted = true;

alter table public.strava_activities enable row level security;

-- Read policy: own activities always; others' only when they're not private
-- AND the owner has opted in to showing activities publicly.
drop policy if exists "strava_activities_select" on public.strava_activities;
create policy "strava_activities_select"
  on public.strava_activities
  for select
  using (
    user_id = auth.uid()
    or (
      is_private = false
      and exists (
        select 1
        from public.profiles p
        where p.id = strava_activities.user_id
          and coalesce(p.strava_show_activities, false) = true
      )
    )
  );

-- No insert/update/delete policies — writes happen only through service_role
-- from server-side Route Handlers. RLS default-denies everything else.

-- ---------------------------------------------------------------------------
-- 3. Public: pending webhook events queue
-- ---------------------------------------------------------------------------

create table if not exists public.strava_events_pending (
  id           bigserial   primary key,
  event_type   text        not null,                        -- activity | athlete
  aspect_type  text        not null,                        -- create | update | delete | backfill
  object_id    bigint      not null,
  owner_id     bigint      not null,                        -- Strava athlete_id
  updates      jsonb,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  error        text,
  retry_count  integer     not null default 0
);

create index if not exists strava_events_pending_unprocessed_idx
  on public.strava_events_pending (received_at)
  where processed_at is null;

alter table public.strava_events_pending enable row level security;
-- no policies → default deny for anon/authenticated; only service_role writes

-- ---------------------------------------------------------------------------
-- 4. profiles: Strava-related columns
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists strava_connected        boolean     not null default false,
  add column if not exists strava_athlete_id       bigint,
  add column if not exists strava_synced_km        numeric     not null default 0,
  add column if not exists strava_synced_rides     integer     not null default 0,
  add column if not exists strava_last_activity_at timestamptz,
  add column if not exists strava_show_activities  boolean     not null default true,
  add column if not exists strava_sport_types      text[]      not null default array['Ride','GravelRide']::text[];

-- Note: the legacy `strava_url` text column is kept for backwards
-- compatibility with pre-existing rows. New UI won't write to it.

-- ---------------------------------------------------------------------------
-- 5. Helper: recompute per-user Strava aggregates
-- ---------------------------------------------------------------------------
-- Called from the Route Handler after every upsert/delete of an activity.
-- Runs as SECURITY DEFINER so that the caller doesn't need write access to
-- public.profiles beyond the update the function performs.

create or replace function public.recompute_strava_stats(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sport_types text[];
begin
  select strava_sport_types
    into v_sport_types
    from public.profiles
   where id = p_user_id;

  if v_sport_types is null then
    v_sport_types := array['Ride','GravelRide']::text[];
  end if;

  update public.profiles p
     set strava_synced_km = coalesce((
           select sum(distance_m) / 1000.0
             from public.strava_activities a
            where a.user_id    = p_user_id
              and a.is_counted = true
              and a.type = any(v_sport_types)
         ), 0),
         strava_synced_rides = coalesce((
           select count(*)
             from public.strava_activities a
            where a.user_id    = p_user_id
              and a.is_counted = true
              and a.type = any(v_sport_types)
         ), 0),
         strava_last_activity_at = (
           select max(start_date)
             from public.strava_activities a
            where a.user_id = p_user_id
         )
   where p.id = p_user_id;
end;
$$;

revoke all on function public.recompute_strava_stats(uuid) from public;
revoke all on function public.recompute_strava_stats(uuid) from anon;
revoke all on function public.recompute_strava_stats(uuid) from authenticated;
grant execute on function public.recompute_strava_stats(uuid) to service_role;
