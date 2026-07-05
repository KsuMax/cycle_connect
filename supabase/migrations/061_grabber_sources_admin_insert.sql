-- ============================================================================
-- Route grabber — allow admins to add sources from /admin/grabber
-- ============================================================================
-- Migration 060 only granted admins SELECT on grabber_sources (the worker
-- writes via the service role, bypassing RLS). The new "Добавить источник"
-- form in /admin/grabber inserts under the caller's own session, so it
-- needs an explicit INSERT policy.
-- ============================================================================

create policy "Admins can insert grabber_sources"
  on public.grabber_sources
  for insert
  to authenticated
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));
