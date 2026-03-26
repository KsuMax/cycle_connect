-- ============================================================
-- CycleConnect — SQL Migration
-- Запусти этот скрипт в Supabase: SQL Editor → New query → Run
-- ============================================================

-- ── 1. PROFILES ─────────────────────────────────────────────
create table if not exists public.profiles (
  id            uuid references auth.users(id) on delete cascade primary key,
  name          text not null,
  bio           text,
  km_total      integer default 0,
  routes_count  integer default 0,
  events_count  integer default 0,
  created_at    timestamptz default now()
);

-- ── 2. ROUTES ───────────────────────────────────────────────
create table if not exists public.routes (
  id            uuid default gen_random_uuid() primary key,
  author_id     uuid references public.profiles(id) on delete cascade not null,
  title         text not null,
  description   text default '',
  region        text default '',
  distance_km   numeric default 0,
  elevation_m   integer default 0,
  duration_min  integer default 0,
  difficulty    text check (difficulty in ('easy', 'medium', 'hard')) default 'medium',
  surface       text[] default '{}',
  bike_types    text[] default '{}',
  route_types   text[] default '{}',
  tags          text[] default '{}',
  mapmagic_url  text,
  mapmagic_embed text,
  likes_count   integer default 0,
  riders_today  integer default 0,
  created_at    timestamptz default now()
);

-- ── 3. ROUTE IMAGES ─────────────────────────────────────────
create table if not exists public.route_images (
  id            uuid default gen_random_uuid() primary key,
  route_id      uuid references public.routes(id) on delete cascade not null,
  url           text not null,
  storage_path  text,
  created_at    timestamptz default now()
);

-- ── 4. ROUTE LIKES ──────────────────────────────────────────
create table if not exists public.route_likes (
  route_id   uuid references public.routes(id) on delete cascade,
  user_id    uuid references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (route_id, user_id)
);

-- ── 5. ROUTE FAVORITES ──────────────────────────────────────
create table if not exists public.route_favorites (
  route_id   uuid references public.routes(id) on delete cascade,
  user_id    uuid references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (route_id, user_id)
);

-- ── 6. ROUTE COMMENTS ───────────────────────────────────────
create table if not exists public.route_comments (
  id         uuid default gen_random_uuid() primary key,
  route_id   uuid references public.routes(id) on delete cascade not null,
  author_id  uuid references public.profiles(id) on delete cascade not null,
  text       text not null,
  created_at timestamptz default now()
);

-- ── 7. EVENTS ───────────────────────────────────────────────
create table if not exists public.events (
  id               uuid default gen_random_uuid() primary key,
  organizer_id     uuid references public.profiles(id) on delete cascade not null,
  route_id         uuid references public.routes(id) on delete set null,
  title            text not null,
  description      text default '',
  start_date       text,
  end_date         text,
  max_participants integer,
  likes_count      integer default 0,
  created_at       timestamptz default now()
);

-- ── 8. EVENT DAYS ───────────────────────────────────────────
create table if not exists public.event_days (
  id           uuid default gen_random_uuid() primary key,
  event_id     uuid references public.events(id) on delete cascade not null,
  day_number   integer not null,
  date         text,
  title        text,
  distance_km  numeric,
  start_point  text,
  end_point    text,
  description  text,
  surface_note text
);

-- ── 9. EVENT PARTICIPANTS ───────────────────────────────────
create table if not exists public.event_participants (
  event_id   uuid references public.events(id) on delete cascade,
  user_id    uuid references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (event_id, user_id)
);

-- ── 10. EVENT LIKES ─────────────────────────────────────────
create table if not exists public.event_likes (
  event_id   uuid references public.events(id) on delete cascade,
  user_id    uuid references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (event_id, user_id)
);


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles          enable row level security;
alter table public.routes            enable row level security;
alter table public.route_images      enable row level security;
alter table public.route_likes       enable row level security;
alter table public.route_favorites   enable row level security;
alter table public.route_comments    enable row level security;
alter table public.events            enable row level security;
alter table public.event_days        enable row level security;
alter table public.event_participants enable row level security;
alter table public.event_likes       enable row level security;


-- ── PROFILES policies ───────────────────────────────────────
create policy "profiles: read all"
  on public.profiles for select using (true);

create policy "profiles: insert own"
  on public.profiles for insert with check (auth.uid() = id);

create policy "profiles: update own"
  on public.profiles for update using (auth.uid() = id);


-- ── ROUTES policies ─────────────────────────────────────────
create policy "routes: read all"
  on public.routes for select using (true);

create policy "routes: insert authenticated"
  on public.routes for insert with check (auth.uid() = author_id);

create policy "routes: update own"
  on public.routes for update using (auth.uid() = author_id);

create policy "routes: delete own"
  on public.routes for delete using (auth.uid() = author_id);


-- ── ROUTE IMAGES policies ───────────────────────────────────
create policy "route_images: read all"
  on public.route_images for select using (true);

create policy "route_images: insert authenticated"
  on public.route_images for insert with check (
    auth.uid() in (select author_id from public.routes where id = route_id)
  );

create policy "route_images: delete own"
  on public.route_images for delete using (
    auth.uid() in (select author_id from public.routes where id = route_id)
  );


-- ── ROUTE LIKES policies ────────────────────────────────────
create policy "route_likes: read all"
  on public.route_likes for select using (true);

create policy "route_likes: insert authenticated"
  on public.route_likes for insert with check (auth.uid() = user_id);

create policy "route_likes: delete own"
  on public.route_likes for delete using (auth.uid() = user_id);


-- ── ROUTE FAVORITES policies ────────────────────────────────
create policy "route_favorites: manage own"
  on public.route_favorites for all using (auth.uid() = user_id);


-- ── ROUTE COMMENTS policies ─────────────────────────────────
create policy "route_comments: read all"
  on public.route_comments for select using (true);

create policy "route_comments: insert authenticated"
  on public.route_comments for insert with check (auth.uid() = author_id);

create policy "route_comments: delete own"
  on public.route_comments for delete using (auth.uid() = author_id);


-- ── EVENTS policies ─────────────────────────────────────────
create policy "events: read all"
  on public.events for select using (true);

create policy "events: insert authenticated"
  on public.events for insert with check (auth.uid() = organizer_id);

create policy "events: update own"
  on public.events for update using (auth.uid() = organizer_id);

create policy "events: delete own"
  on public.events for delete using (auth.uid() = organizer_id);


-- ── EVENT DAYS policies ─────────────────────────────────────
create policy "event_days: read all"
  on public.event_days for select using (true);

create policy "event_days: manage by organizer"
  on public.event_days for all using (
    auth.uid() in (select organizer_id from public.events where id = event_id)
  );


-- ── EVENT PARTICIPANTS policies ──────────────────────────────
create policy "event_participants: read all"
  on public.event_participants for select using (true);

create policy "event_participants: manage own"
  on public.event_participants for all using (auth.uid() = user_id);


-- ── EVENT LIKES policies ────────────────────────────────────
create policy "event_likes: read all"
  on public.event_likes for select using (true);

create policy "event_likes: manage own"
  on public.event_likes for all using (auth.uid() = user_id);


-- ============================================================
-- STORAGE BUCKET для фотографий маршрутов
-- Создай вручную в Supabase: Storage → New bucket
--   Name: route-images
--   Public: YES (включить)
-- ============================================================
