-- Notify active club members when a new event is published for the club.
--
-- Uses SECURITY DEFINER so the trigger can bypass the RLS policy on
-- notifications (which requires auth.uid() = actor_id — not usable for
-- bulk server-side inserts).

create or replace function public.notify_club_members_on_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only act when the event is linked to a club
  if new.club_id is null then
    return new;
  end if;

  -- Insert one notification per active club member, skipping the organiser
  insert into public.notifications (user_id, type, actor_id, data)
  select
    cm.user_id,
    'club_event',
    new.organizer_id,
    jsonb_build_object(
      'event_id',    new.id,
      'event_title', new.title,
      'club_id',     new.club_id
    )
  from public.club_members cm
  where cm.club_id  = new.club_id
    and cm.status   = 'active'
    and cm.user_id != new.organizer_id;

  return new;
end;
$$;

create trigger on_club_event_created
  after insert on public.events
  for each row
  execute function public.notify_club_members_on_event();
