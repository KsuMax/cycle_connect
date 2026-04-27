-- Event completion automation:
--   1. Adds `source` and `event_id` to route_rides so we can trace which rides
--      came from a completed event and revert them on participant removal.
--   2. Trigger keeps profiles.km_total in sync with route_rides (insert += distance,
--      delete -= distance). This makes the existing comment in RidesContext.addRide
--      truthful and is the same mechanism that powers event-completion mileage.
--   3. Daily pg_cron job marks every participant of a finished event as having
--      ridden the event's route (one route_rides row per participant, idempotent).
--   4. Trigger on event_participants DELETE removes the corresponding event-sourced
--      route_rides row, which in turn rolls back km_total via the sync trigger.
--   5. RLS: organizer of an event can manage its participants (add/remove anyone).

-- ─── 1. Schema additions on route_rides ─────────────────────────────────────
alter table public.route_rides
  add column if not exists source text not null default 'manual',
  add column if not exists event_id uuid references public.events(id) on delete set null;

alter table public.route_rides
  drop constraint if exists route_rides_source_check;
alter table public.route_rides
  add constraint route_rides_source_check
  check (source in ('manual', 'event', 'strava'));

-- One auto-generated ride per (event, user). Manual/strava entries are not
-- constrained so a user can still log multiple rides on the same route.
create unique index if not exists route_rides_event_user_uq
  on public.route_rides (event_id, user_id)
  where source = 'event';

create index if not exists route_rides_event_id_idx
  on public.route_rides (event_id)
  where event_id is not null;

-- ─── 2. km_total sync trigger ───────────────────────────────────────────────
create or replace function public.trg_sync_km_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_distance numeric;
begin
  if TG_OP = 'INSERT' then
    select distance_km into v_distance from public.routes where id = NEW.route_id;
    if v_distance is not null and v_distance > 0 then
      update public.profiles
        set km_total = coalesce(km_total, 0) + v_distance::int
        where id = NEW.user_id;
    end if;
    return NEW;
  elsif TG_OP = 'DELETE' then
    select distance_km into v_distance from public.routes where id = OLD.route_id;
    if v_distance is not null and v_distance > 0 then
      update public.profiles
        set km_total = greatest(coalesce(km_total, 0) - v_distance::int, 0)
        where id = OLD.user_id;
    end if;
    return OLD;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_sync_km_total on public.route_rides;
create trigger trg_sync_km_total
  after insert or delete on public.route_rides
  for each row execute function public.trg_sync_km_total();

-- ─── 3. Backfill km_total from existing rides ───────────────────────────────
-- One-shot reconciliation so the column matches reality after this migration.
update public.profiles p
set km_total = coalesce((
  select sum(coalesce(r.distance_km, 0))::int
  from public.route_rides rr
  join public.routes r on r.id = rr.route_id
  where rr.user_id = p.id
), 0);

-- ─── 4. complete_finished_events(): mark past events as ridden ──────────────
create or replace function public.complete_finished_events()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Insert one event-sourced ride per participant for every event whose end_date
  -- has passed (or start_date if end_date is null) and that has a linked route.
  -- Idempotent via the partial unique index on (event_id, user_id).
  insert into public.route_rides (user_id, route_id, event_id, source)
  select
    ep.user_id,
    e.route_id,
    e.id,
    'event'
  from public.events e
  join public.event_participants ep on ep.event_id = e.id
  where e.route_id is not null
    and coalesce(e.end_date, e.start_date) is not null
    and coalesce(e.end_date, e.start_date)::date < (now() at time zone 'Europe/Moscow')::date
    and not exists (
      select 1 from public.route_rides rr
      where rr.event_id = e.id
        and rr.user_id  = ep.user_id
        and rr.source   = 'event'
    );
end;
$$;

revoke all on function public.complete_finished_events() from public, anon, authenticated;
grant execute on function public.complete_finished_events() to service_role;

-- ─── 5. Revert ride when a participant leaves / is removed ──────────────────
create or replace function public.trg_revert_event_ride()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.route_rides
   where event_id = OLD.event_id
     and user_id  = OLD.user_id
     and source   = 'event';
  return OLD;
end;
$$;

drop trigger if exists trg_revert_event_ride on public.event_participants;
create trigger trg_revert_event_ride
  after delete on public.event_participants
  for each row execute function public.trg_revert_event_ride();

-- ─── 6. RLS: organizer can manage participants of their own event ───────────
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'event_participants'
      and policyname = 'organizer_manage_participants'
  ) then
    drop policy organizer_manage_participants on public.event_participants;
  end if;
end
$$;

create policy organizer_manage_participants on public.event_participants
  for all
  using (
    exists (
      select 1 from public.events e
      where e.id = event_participants.event_id
        and e.organizer_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.events e
      where e.id = event_participants.event_id
        and e.organizer_id = auth.uid()
    )
  );

-- ─── 7. pg_cron schedule (optional): run daily at 06:30 UTC (09:30 Moscow) ──
-- Skip silently if pg_cron isn't installed on this instance — the function
-- still exists and can be invoked by an external scheduler.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'event-completion') then
      perform cron.unschedule('event-completion');
    end if;
    perform cron.schedule(
      'event-completion',
      '30 6 * * *',
      $cron$select public.complete_finished_events();$cron$
    );
  end if;
end
$$;

-- ─── 8. Backfill: complete events that already ended ────────────────────────
select public.complete_finished_events();
