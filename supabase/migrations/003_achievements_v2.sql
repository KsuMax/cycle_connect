-- ============================================================
-- Achievements v2: levels, showcase, notifications, new achievements
-- ============================================================

-- 1. Achievement levels: add max_level and thresholds to catalog
alter table achievements add column if not exists max_level int not null default 1;
alter table achievements add column if not exists level_thresholds jsonb;

-- 2. User achievement levels
alter table user_achievements add column if not exists level int not null default 1;
alter table user_achievements add column if not exists level_updated_at timestamptz;

-- RLS: allow users to update their own achievements (for level-ups)
create policy "user_achievements_update" on user_achievements for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3. Profile showcase (up to 3 pinned achievements)
alter table profiles add column if not exists showcase_achievements text[] default '{}';

-- 4. Notifications table
create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  type       text not null,
  actor_id   uuid references profiles(id) on delete set null,
  data       jsonb,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on notifications(user_id, read, created_at desc);

alter table notifications enable row level security;

-- Users can read their own notifications
create policy "notifications_select" on notifications for select
  using (auth.uid() = user_id);

-- Users can insert notifications where they are the actor
create policy "notifications_insert" on notifications for insert
  with check (auth.uid() = actor_id);

-- Users can update (mark read) their own notifications
create policy "notifications_update" on notifications for update
  using (auth.uid() = user_id);

-- 5. Update progressive achievements with level thresholds
update achievements set max_level = 4, level_thresholds = '{"1": 100, "2": 500, "3": 1000, "4": 5000}'
  where id = 'century';

update achievements set max_level = 4, level_thresholds = '{"1": 5, "2": 10, "3": 25, "4": 50}'
  where id = 'architect';

update achievements set max_level = 3, level_thresholds = '{"1": 5, "2": 15, "3": 30}'
  where id = 'regular';

update achievements set max_level = 4, level_thresholds = '{"1": 1, "2": 10, "3": 25, "4": 50}'
  where id = 'friendly' ;

-- 6. New hidden achievements
insert into achievements (id, title, description, icon, is_hidden, sort_order, max_level) values
  ('explorer',      'Исследователь',  'Ты катал в 3 разных регионах — мир шире, чем кажется',       '🧭', true,  11, 1),
  ('double_strike', 'Двойной удар',   'Два маршрута за один день? Кто-то сегодня в ударе',           '⚡', true,  12, 1),
  ('social_magnet', 'Магнит',         'На тебя подписалось 10 человек. Ты интересен людям',          '🧲', true,  13, 1)
on conflict (id) do nothing;
