-- ============================================================
-- Achievements system: catalog + user achievements
-- ============================================================

-- 1. Achievements catalog
create table if not exists achievements (
  id          text primary key,
  title       text not null,
  description text not null,
  icon        text not null,
  is_hidden   boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

-- 2. User achievements (many-to-many)
create table if not exists user_achievements (
  user_id        uuid not null references profiles(id) on delete cascade,
  achievement_id text not null references achievements(id) on delete cascade,
  earned_at      timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create index if not exists user_achievements_user_idx on user_achievements(user_id);

-- 3. RLS policies
alter table achievements enable row level security;
alter table user_achievements enable row level security;

-- Everyone can read the catalog
create policy "achievements_select" on achievements for select using (true);

-- Everyone can read anyone's achievements
create policy "user_achievements_select" on user_achievements for select using (true);

-- Users can only insert their own achievements
create policy "user_achievements_insert" on user_achievements for insert
  with check (auth.uid() = user_id);

-- 4. Seed: 10 MVP achievements
insert into achievements (id, title, description, icon, is_hidden, sort_order) values
  ('first_ride',   'Первый оборот педалей', 'Каждый великий путь начинается с первого километра',         '🚲', false, 1),
  ('century',      'Сотка',                'Проедь 100 км суммарно — это уже не случайность',            '💯', false, 2),
  ('cartographer', 'Картограф',            'Ты не просто катаешь — ты рисуешь карту для других',         '🗺️', false, 3),
  ('architect',    'Архитектор маршрутов',  '5 маршрутов. Твои тропы уже стали чужими любимыми',          '🏗️', false, 4),
  ('first_event',  'Первая покатушка',      'Кататься вместе — совсем другое дело',                      '🎉', false, 5),
  ('regular',      'Свой в доску',          '5 мероприятий — тебя уже узнают в пелотоне',                 '🤝', false, 6),
  ('organizer',    'Организатор',           'Ты собрал людей вместе. Это дорогого стоит',                 '📋', false, 7),
  ('friendly',     'Дружелюбный',           'Первая подписка — начало большой истории',                   '👋', false, 8),
  ('omnivore',     'Всеядный',              'Ты катал по асфальту, гравию и грунту. Тебе всё нипочём',    '🌍', false, 9),
  ('own_route',    'Свой маршрут',          'Ты проехал маршрут, который сам же и создал. Мета!',         '🏠', true,  10)
on conflict (id) do nothing;
