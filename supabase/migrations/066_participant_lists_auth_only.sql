-- Migration: 066_participant_lists_auth_only
-- Created: 2026-07-08
-- Description:
--   July 2026 audit — stop leaking the social graph to anonymous clients.
--
--   event_participants and club_members both had a `TO public USING (true)`
--   SELECT policy, so any anonymous request could enumerate every user_id +
--   role + membership across all events and clubs. We restrict SELECT to
--   authenticated users (logged-in members can still see full lists; writes
--   and owner/organizer/admin management policies are untouched; service-role
--   paths bypass RLS).
--
--   UX note: participant COUNT on event pages is computed client-side from the
--   embed length, so logged-out visitors will see 0 participants until they
--   sign in. Club member counts are denormalized (clubs.members_count) and are
--   unaffected. If anon-visible counts are wanted later, add a denormalized
--   events.participants_count column instead of reopening the row list.

-- ============================================================
-- UP
-- ============================================================

-- event_participants: drop the anon-inclusive SELECT policy.
-- The authenticated-only "participants_select_all" (USING true) already exists
-- and continues to serve logged-in users.
drop policy if exists "event_participants: read all" on public.event_participants;

-- club_members: replace the public SELECT policy with an authenticated one.
drop policy if exists "club_members_select_all" on public.club_members;
create policy "club_members_select_auth"
  on public.club_members
  for select
  to authenticated
  using (true);

-- ============================================================
-- ROLLBACK (run manually if needed)
-- ============================================================
-- create policy "event_participants: read all" on public.event_participants
--   for select to public using (true);
-- drop policy if exists "club_members_select_auth" on public.club_members;
-- create policy "club_members_select_all" on public.club_members
--   for select to public using (true);
