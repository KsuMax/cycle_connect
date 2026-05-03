-- Event chat & announcements system.
--
-- events.chat_url         — optional invite link to an existing TG group/channel,
--                           shown only to registered participants.
-- event_announcements     — organizer posts; bot DMs to all TG-linked participants.
-- announcement_deliveries — per-user delivery status (sent/failed/blocked/no_tg).
-- announcement_optouts    — participant opt-outs per event (via inline button in DM).

alter table public.events
  add column if not exists chat_url text;

-- ── Announcements ─────────────────────────────────────────────────────────────

create table public.event_announcements (
  id         uuid        primary key default gen_random_uuid(),
  event_id   uuid        not null references public.events(id) on delete cascade,
  author_id  uuid        not null references auth.users(id),
  body       text        not null,
  is_urgent  boolean     not null default false,
  created_at timestamptz not null default now()
);

create index event_announcements_event_id_idx
  on public.event_announcements (event_id, created_at desc);

-- ── Delivery tracking ─────────────────────────────────────────────────────────

create table public.announcement_deliveries (
  announcement_id uuid not null references public.event_announcements(id) on delete cascade,
  user_id         uuid not null references auth.users(id),
  status          text not null check (status in ('sent', 'failed', 'blocked', 'no_tg')),
  delivered_at    timestamptz,
  primary key (announcement_id, user_id)
);

-- ── Opt-outs ──────────────────────────────────────────────────────────────────

create table public.announcement_optouts (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id  uuid not null references auth.users(id),
  primary key (event_id, user_id)
);

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table public.event_announcements  enable row level security;
alter table public.announcement_deliveries enable row level security;
alter table public.announcement_optouts enable row level security;

-- Participants and organizer can read announcements
create policy "event insiders can read announcements"
  on public.event_announcements for select
  using (
    exists (
      select 1 from public.event_participants ep
      where ep.event_id = event_announcements.event_id
        and ep.user_id = auth.uid()
    )
    or
    exists (
      select 1 from public.events e
      where e.id = event_announcements.event_id
        and e.organizer_id = auth.uid()
    )
  );

-- Only the event organizer can post announcements
create policy "organizer can post announcements"
  on public.event_announcements for insert
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.events e
      where e.id = event_announcements.event_id
        and e.organizer_id = auth.uid()
    )
  );

-- Each user can read their own delivery records
create policy "users can read own delivery status"
  on public.announcement_deliveries for select
  using (user_id = auth.uid());

-- Users can manage their own opt-outs
create policy "users can manage own optouts"
  on public.announcement_optouts
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
