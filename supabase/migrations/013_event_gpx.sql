-- ============================================================
-- Event-level GPX: let organizers attach a GPX track directly to
-- an event, independent of the linked route (if any). On the detail
-- page the event's own GPX takes precedence; otherwise we fall back
-- to the linked route's GPX.
-- ============================================================

-- 1. GPX fields on events -------------------------------------------------
alter table events
  add column if not exists gpx_path       text,
  add column if not exists gpx_updated_at timestamptz;

-- Keep gpx_updated_at in sync when gpx_path changes (mirrors routes behaviour).
create or replace function events_touch_gpx_updated_at()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'INSERT' and new.gpx_path is not null)
     or (tg_op = 'UPDATE' and new.gpx_path is distinct from old.gpx_path) then
    new.gpx_updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_events_touch_gpx on events;
create trigger trg_events_touch_gpx
  before insert or update on events
  for each row execute function events_touch_gpx_updated_at();

-- 2. Storage bucket for event GPX files -----------------------------------
insert into storage.buckets (id, name, public)
values ('event-gpx', 'event-gpx', true)
on conflict (id) do nothing;

-- Public read, organizer-only write. Files live under <event_id>/...
drop policy if exists "event_gpx_read"   on storage.objects;
drop policy if exists "event_gpx_insert" on storage.objects;
drop policy if exists "event_gpx_update" on storage.objects;
drop policy if exists "event_gpx_delete" on storage.objects;

create policy "event_gpx_read"
  on storage.objects for select
  using (bucket_id = 'event-gpx');

create policy "event_gpx_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'event-gpx'
    and exists (
      select 1 from events e
      where e.id::text = split_part(name, '/', 1)
        and e.organizer_id = auth.uid()
    )
  );

create policy "event_gpx_update"
  on storage.objects for update
  using (
    bucket_id = 'event-gpx'
    and exists (
      select 1 from events e
      where e.id::text = split_part(name, '/', 1)
        and e.organizer_id = auth.uid()
    )
  );

create policy "event_gpx_delete"
  on storage.objects for delete
  using (
    bucket_id = 'event-gpx'
    and exists (
      select 1 from events e
      where e.id::text = split_part(name, '/', 1)
        and e.organizer_id = auth.uid()
    )
  );
