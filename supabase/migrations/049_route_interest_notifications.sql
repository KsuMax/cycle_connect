-- ============================================================
-- Notifications for the route interest pool.
--
--  • In-app pings (this file) are written by SECURITY DEFINER
--    triggers that bypass RLS — same pattern as 018/020.
--  • TG pushes are sent separately by the tg-notify edge function
--    after the same DB triggers run (client invokes it).
--
-- Two flows:
--   1. Someone marks "I want to ride" on a route ⇒ everyone else
--      already in the pool gets pinged. Debounced to one ping per
--      (route × recipient) per hour to survive popular routes.
--   2. A non-private event is created for a route ⇒ everyone in
--      the pool gets pinged once. Idempotent via events.pool_notified_at
--      so edits don't re-ping.
-- ============================================================

-- Rename the user preference column — name now matches the model.
alter table profiles rename column tg_notify_intents to tg_notify_interests;

-- Idempotency anchor for event-for-pool pings
alter table events
  add column if not exists pool_notified_at timestamptz;


-- ── 1. New interest in the pool ────────────────────────────────
create or replace function public.notify_pool_on_new_interest()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  route_title text;
begin
  select title into route_title from routes where id = new.route_id;

  insert into public.notifications (user_id, type, actor_id, data)
  select
    ri.user_id,
    'route_interest_new',
    new.user_id,
    jsonb_build_object(
      'route_id',    new.route_id,
      'route_title', route_title
    )
  from public.route_interests ri
  where ri.route_id = new.route_id
    and ri.user_id != new.user_id
    -- Hourly debounce: skip recipients who already got a ping
    -- about this route in the last hour. Keeps popular routes
    -- from spamming everyone in the pool.
    and not exists (
      select 1
      from public.notifications n
      where n.user_id = ri.user_id
        and n.type = 'route_interest_new'
        and (n.data->>'route_id') = new.route_id::text
        and n.created_at > now() - interval '1 hour'
    );

  return new;
end;
$$;

create trigger on_route_interest_created
  after insert on public.route_interests
  for each row
  execute function public.notify_pool_on_new_interest();


-- ── 2. New event on a route with a pool ────────────────────────
create or replace function public.notify_pool_on_route_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only public events tied to a route, fire once
  if new.route_id is null
     or new.is_private = true
     or new.pool_notified_at is not null then
    return new;
  end if;

  insert into public.notifications (user_id, type, actor_id, data)
  select
    ri.user_id,
    'event_for_interested_route',
    new.organizer_id,
    jsonb_build_object(
      'event_id',    new.id,
      'event_title', new.title,
      'route_id',    new.route_id,
      'start_date',  new.start_date
    )
  from public.route_interests ri
  where ri.route_id = new.route_id
    and ri.user_id != new.organizer_id;

  -- Mark the event so this never fires again on edit/update.
  update public.events
    set pool_notified_at = now()
    where id = new.id;

  return new;
end;
$$;

create trigger on_route_event_created
  after insert on public.events
  for each row
  execute function public.notify_pool_on_route_event();
