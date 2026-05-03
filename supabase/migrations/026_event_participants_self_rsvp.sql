-- Ensure regular authenticated users can RSVP themselves to an event.
-- Migration 024 added an organizer-only "FOR ALL" policy; if the original
-- self-RSVP policy is missing on a given environment, INSERT/DELETE by a
-- regular participant fails silently (RLS denial). This migration is
-- idempotent and only creates policies that don't exist yet.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'event_participants'
      and policyname = 'self_rsvp_insert'
  ) then
    create policy self_rsvp_insert on public.event_participants
      for insert to authenticated
      with check (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'event_participants'
      and policyname = 'self_rsvp_delete'
  ) then
    create policy self_rsvp_delete on public.event_participants
      for delete to authenticated
      using (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'event_participants'
      and policyname = 'participants_select_all'
  ) then
    create policy participants_select_all on public.event_participants
      for select to authenticated using (true);
  end if;
end
$$;
