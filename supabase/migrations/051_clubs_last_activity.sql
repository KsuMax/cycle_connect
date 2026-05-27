-- Denormalized "last activity" timestamp on clubs, bumped whenever a club's
-- route or event is created (or moved into the club). Used to surface lively
-- clubs above dormant ones in the listing.

alter table public.clubs
  add column if not exists last_activity_at timestamptz;

-- Initial backfill: greatest of clubs.created_at and the newest related row.
update public.clubs c
   set last_activity_at = greatest(
         c.created_at,
         coalesce((select max(created_at) from public.routes r where r.club_id = c.id), 'epoch'::timestamptz),
         coalesce((select max(created_at) from public.events e where e.club_id = c.id), 'epoch'::timestamptz)
       );

create index if not exists clubs_last_activity_idx
  on public.clubs (last_activity_at desc nulls last);

-- ── Trigger: bump last_activity_at on routes/events insert or club_id change ─

create or replace function public.bump_club_last_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_club uuid;
  bump_ts     timestamptz;
begin
  if tg_op = 'INSERT' then
    target_club := new.club_id;
    bump_ts     := coalesce(new.created_at, now());
  elsif tg_op = 'UPDATE' then
    if new.club_id is distinct from old.club_id then
      target_club := new.club_id;
      bump_ts     := now();
    else
      return null;
    end if;
  end if;

  if target_club is not null then
    update public.clubs
       set last_activity_at = greatest(coalesce(last_activity_at, 'epoch'::timestamptz), bump_ts)
     where id = target_club;
  end if;

  return null;
end;
$$;

drop trigger if exists on_route_bump_club_activity on public.routes;
create trigger on_route_bump_club_activity
  after insert or update of club_id on public.routes
  for each row execute function public.bump_club_last_activity();

drop trigger if exists on_event_bump_club_activity on public.events;
create trigger on_event_bump_club_activity
  after insert or update of club_id on public.events
  for each row execute function public.bump_club_last_activity();
