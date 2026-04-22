-- Daily event reminders: notify each participant the day before their event.
--
-- Runs via pg_cron at 06:00 UTC (09:00 Moscow) every day.
-- Uses SECURITY DEFINER to bypass the notifications RLS (same pattern as
-- notify_club_members_on_event in migration 018).

create or replace function public.send_event_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tomorrow date;
begin
  -- "Tomorrow" in Moscow time (UTC+3)
  v_tomorrow := (now() at time zone 'Europe/Moscow')::date + 1;

  -- Insert one reminder per participant of each event starting tomorrow.
  -- Skip participants who already received a reminder for this event (idempotent).
  insert into public.notifications (user_id, type, actor_id, data)
  select
    ep.user_id,
    'event_reminder',
    e.organizer_id,
    jsonb_build_object(
      'event_id',    e.id,
      'event_title', e.title,
      'start_date',  e.start_date
    )
  from public.events e
  join public.event_participants ep on ep.event_id = e.id
  where e.start_date::date = v_tomorrow
    and ep.user_id != e.organizer_id  -- organiser doesn't need a reminder
    and not exists (
      -- idempotency guard: don't double-send for the same event
      select 1 from public.notifications n
      where n.user_id = ep.user_id
        and n.type    = 'event_reminder'
        and (n.data->>'event_id') = e.id::text
        and n.created_at > now() - interval '2 days'
    );
end;
$$;

-- Revoke public access; only the cron/service role should call this.
revoke all on function public.send_event_reminders() from public;
revoke all on function public.send_event_reminders() from anon;
revoke all on function public.send_event_reminders() from authenticated;
grant  execute on function public.send_event_reminders() to service_role;

-- ── pg_cron schedule ──────────────────────────────────────────────────────────
-- Extensions must already be present (they were enabled in migration 006).
-- The job name is unique; re-running the migration updates rather than duplicates.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'event-daily-reminders') then
    perform cron.unschedule('event-daily-reminders');
  end if;
end
$$;

select cron.schedule(
  'event-daily-reminders',
  '0 6 * * *',          -- 06:00 UTC = 09:00 Moscow every day
  $$select public.send_event_reminders();$$
);
