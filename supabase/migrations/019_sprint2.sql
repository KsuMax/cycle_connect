-- Sprint 2 schema additions
-- 1. Ride report on events (written by organizer after the event)
-- 2. Club-featured flag on routes (pinned by club admin)

-- ── Ride report ───────────────────────────────────────────────────────────────
alter table public.events
  add column if not exists report_text        text,
  add column if not exists report_published_at timestamptz;

-- ── Club-featured routes ──────────────────────────────────────────────────────
alter table public.routes
  add column if not exists is_club_featured boolean not null default false;

-- Allow club admins / owners to toggle is_club_featured for their own club's routes.
-- Uses a DO block so the migration is idempotent (re-running won't error).
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'routes'
      and policyname = 'club_admin_feature_routes'
  ) then
    create policy "club_admin_feature_routes" on public.routes
      for update
      using (
        club_id is not null
        and exists (
          select 1 from public.club_members
          where club_id  = routes.club_id
            and user_id  = auth.uid()
            and role     in ('owner', 'admin')
            and status   = 'active'
        )
      )
      with check (true);
  end if;
end $$;
