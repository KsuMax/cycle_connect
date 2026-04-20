-- Clubs and club membership tables.
-- visibility: 'open' = anyone can join instantly,
--             'request' = join requires admin approval,
--             'closed' = invite-only (not yet implemented in UI).

create table public.clubs (
  id           uuid        primary key default gen_random_uuid(),
  slug         text        unique not null,
  name         text        not null,
  description  text,
  city         text,
  avatar_url   text,
  cover_url    text,
  visibility   text        not null default 'open'
                           check (visibility in ('open', 'request', 'closed')),
  owner_id     uuid        not null references auth.users(id) on delete cascade,
  members_count integer    not null default 0,
  created_at   timestamptz not null default now()
);

create table public.club_members (
  club_id   uuid  not null references public.clubs(id) on delete cascade,
  user_id   uuid  not null references auth.users(id)  on delete cascade,
  role      text  not null default 'member'
                  check (role   in ('owner', 'admin', 'captain', 'member')),
  status    text  not null default 'active'
                  check (status in ('active', 'pending')),
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

create index clubs_owner_id_idx        on public.clubs(owner_id);
create index club_members_user_id_idx  on public.club_members(user_id);
create index club_members_club_id_idx  on public.club_members(club_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table public.clubs       enable row level security;
alter table public.club_members enable row level security;

-- Everyone can read clubs (discovery).
create policy "clubs_select_all" on public.clubs
  for select using (true);

-- Authenticated users can create clubs.
create policy "clubs_insert_owner" on public.clubs
  for insert with check (auth.uid() = owner_id);

-- Owner or admin can edit club details.
create policy "clubs_update_admin" on public.clubs
  for update using (
    exists (
      select 1 from public.club_members
      where club_id = clubs.id
        and user_id = auth.uid()
        and role    in ('owner', 'admin')
        and status  = 'active'
    )
  );

-- Only owner can delete the club.
create policy "clubs_delete_owner" on public.clubs
  for delete using (owner_id = auth.uid());

-- Everyone can read club_members (public roster).
create policy "club_members_select_all" on public.club_members
  for select using (true);

-- Users can request to join or join a club (sets own user_id only).
create policy "club_members_insert_self" on public.club_members
  for insert with check (auth.uid() = user_id);

-- Users can leave a club, or admins can remove/approve members.
create policy "club_members_delete" on public.club_members
  for delete using (
    auth.uid() = user_id
    or exists (
      select 1 from public.club_members cm
      where cm.club_id = club_members.club_id
        and cm.user_id = auth.uid()
        and cm.role    in ('owner', 'admin')
        and cm.status  = 'active'
    )
  );

-- Admins can change role/status of other members.
create policy "club_members_update_admin" on public.club_members
  for update using (
    exists (
      select 1 from public.club_members cm
      where cm.club_id = club_members.club_id
        and cm.user_id = auth.uid()
        and cm.role    in ('owner', 'admin')
        and cm.status  = 'active'
    )
  );

-- ── club_id on existing tables ───────────────────────────────────────────────

alter table public.routes add column if not exists club_id uuid references public.clubs(id) on delete set null;
alter table public.events add column if not exists club_id uuid references public.clubs(id) on delete set null;

create index if not exists routes_club_id_idx on public.routes(club_id) where club_id is not null;
create index if not exists events_club_id_idx on public.events(club_id) where club_id is not null;

-- ── Trigger: auto-add creator as owner member ─────────────────────────────────

create or replace function public.handle_new_club()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.club_members (club_id, user_id, role, status)
  values (new.id, new.owner_id, 'owner', 'active');
  return new;
end;
$$;

create trigger on_club_created
  after insert on public.clubs
  for each row execute function public.handle_new_club();

-- ── Trigger: keep members_count in sync ──────────────────────────────────────

create or replace function public.sync_club_members_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.status = 'active' then
    update public.clubs set members_count = members_count + 1 where id = new.club_id;

  elsif tg_op = 'DELETE' and old.status = 'active' then
    update public.clubs set members_count = members_count - 1 where id = old.club_id;

  elsif tg_op = 'UPDATE' then
    if old.status <> 'active' and new.status = 'active' then
      update public.clubs set members_count = members_count + 1 where id = new.club_id;
    elsif old.status = 'active' and new.status <> 'active' then
      update public.clubs set members_count = members_count - 1 where id = old.club_id;
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger on_club_member_change
  after insert or update or delete on public.club_members
  for each row execute function public.sync_club_members_count();
