-- Sprint 3: TG club integration + club polls (route voting)

-- ── 1. TG integration: Telegram channel/group for a club ─────────────────────
-- Stores @username or numeric chat_id that the bot will post announcements to.
-- Admin sets this in the club edit page after adding the bot as a group admin.
alter table public.clubs
  add column if not exists telegram_channel text;

-- ── 2. Club polls ─────────────────────────────────────────────────────────────
-- A poll has a question and a JSON array of options:
--   [{id: "uuid", label: "...", route_id: "uuid"|null}, ...]
-- Only one active (closed_at IS NULL) poll per club at a time is enforced at
-- the application level.

create table if not exists public.club_polls (
  id          uuid      primary key default gen_random_uuid(),
  club_id     uuid      not null references public.clubs(id) on delete cascade,
  question    text      not null default 'За какой маршрут едем дальше?',
  options     jsonb     not null default '[]'::jsonb,
  created_by  uuid      not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  closed_at   timestamptz
);

create index if not exists club_polls_club_id_idx on public.club_polls(club_id);

-- ── 3. Club poll votes ────────────────────────────────────────────────────────
-- One row per (poll, user) — changed by deleting and re-inserting is blocked;
-- the PK guarantees one vote per person per poll.

create table if not exists public.club_poll_votes (
  poll_id   uuid      not null references public.club_polls(id) on delete cascade,
  user_id   uuid      not null references public.profiles(id),
  option_id text      not null,
  voted_at  timestamptz not null default now(),
  primary key (poll_id, user_id)
);

-- ── 4. RLS ────────────────────────────────────────────────────────────────────
alter table public.club_polls       enable row level security;
alter table public.club_poll_votes  enable row level security;

-- Polls: anyone can read
create policy "club_polls_select"
  on public.club_polls for select using (true);

-- Polls: only club admins/owners can create or update (close)
create policy "club_polls_insert"
  on public.club_polls for insert
  with check (
    auth.uid() = created_by
    and exists (
      select 1 from public.club_members
      where club_id  = club_polls.club_id
        and user_id  = auth.uid()
        and role     in ('owner', 'admin')
        and status   = 'active'
    )
  );

create policy "club_polls_update"
  on public.club_polls for update
  using (
    exists (
      select 1 from public.club_members
      where club_id  = club_polls.club_id
        and user_id  = auth.uid()
        and role     in ('owner', 'admin')
        and status   = 'active'
    )
  );

-- Votes: members can read all votes (needed for counting)
create policy "club_poll_votes_select"
  on public.club_poll_votes for select using (true);

-- Votes: only the voter can insert their own vote; must be active club member
create policy "club_poll_votes_insert"
  on public.club_poll_votes for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.club_members cm
      join  public.club_polls cp on cp.id = club_poll_votes.poll_id
      where cm.club_id  = cp.club_id
        and cm.user_id  = auth.uid()
        and cm.status   = 'active'
    )
  );

-- Votes: voter can delete their own vote (change vote = delete + re-insert)
create policy "club_poll_votes_delete"
  on public.club_poll_votes for delete
  using (auth.uid() = user_id);
