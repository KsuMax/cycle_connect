-- ============================================================
-- Route interests: lightweight "I want to ride this" signals.
-- Replaces ride_intents/ride_intent_participants — no creator,
-- one row per (route × user), date optional.
-- ============================================================

drop table if exists ride_intent_participants;
drop table if exists ride_intents;

create table route_interests (
  route_id     uuid not null references routes(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  planned_date date,
  rough_when   text,
  note         text,
  created_at   timestamptz not null default now(),
  primary key (route_id, user_id)
);

create index route_interests_route_idx on route_interests(route_id, created_at desc);
create index route_interests_user_idx  on route_interests(user_id, created_at desc);

alter table route_interests enable row level security;

create policy "route_interests_select" on route_interests for select using (true);
create policy "route_interests_insert" on route_interests for insert with check (auth.uid() = user_id);
create policy "route_interests_update" on route_interests for update using (auth.uid() = user_id);
create policy "route_interests_delete" on route_interests for delete using (auth.uid() = user_id);

-- Historical notifications referencing dropped intent rows are now orphaned.
-- They render as best-effort in the UI; nothing depends on them server-side.
