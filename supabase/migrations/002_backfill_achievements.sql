-- ============================================================
-- Backfill: award achievements to existing users retroactively
-- Run AFTER 001_achievements.sql has been applied
-- ============================================================

-- 1. first_ride — anyone with at least 1 ride
insert into user_achievements (user_id, achievement_id)
select distinct rr.user_id, 'first_ride'
from route_rides rr
where not exists (
  select 1 from user_achievements ua
  where ua.user_id = rr.user_id and ua.achievement_id = 'first_ride'
)
on conflict do nothing;

-- 2. century — anyone with km_total >= 100
insert into user_achievements (user_id, achievement_id)
select p.id, 'century'
from profiles p
where p.km_total >= 100
  and not exists (
    select 1 from user_achievements ua
    where ua.user_id = p.id and ua.achievement_id = 'century'
  )
on conflict do nothing;

-- 3. cartographer — anyone who created at least 1 route
insert into user_achievements (user_id, achievement_id)
select distinct r.author_id, 'cartographer'
from routes r
where not exists (
  select 1 from user_achievements ua
  where ua.user_id = r.author_id and ua.achievement_id = 'cartographer'
)
on conflict do nothing;

-- 4. architect — anyone who created 5+ routes
insert into user_achievements (user_id, achievement_id)
select r.author_id, 'architect'
from routes r
group by r.author_id
having count(*) >= 5
  and not exists (
    select 1 from user_achievements ua
    where ua.user_id = r.author_id and ua.achievement_id = 'architect'
  )
on conflict do nothing;

-- 5. first_event — anyone who joined at least 1 event
insert into user_achievements (user_id, achievement_id)
select distinct ep.user_id, 'first_event'
from event_participants ep
where not exists (
  select 1 from user_achievements ua
  where ua.user_id = ep.user_id and ua.achievement_id = 'first_event'
)
on conflict do nothing;

-- 6. regular — anyone who joined 5+ events
insert into user_achievements (user_id, achievement_id)
select ep.user_id, 'regular'
from event_participants ep
group by ep.user_id
having count(*) >= 5
  and not exists (
    select 1 from user_achievements ua
    where ua.user_id = ep.user_id and ua.achievement_id = 'regular'
  )
on conflict do nothing;

-- 7. organizer — anyone who created at least 1 event
insert into user_achievements (user_id, achievement_id)
select distinct e.organizer_id, 'organizer'
from events e
where not exists (
  select 1 from user_achievements ua
  where ua.user_id = e.organizer_id and ua.achievement_id = 'organizer'
)
on conflict do nothing;

-- 8. friendly — anyone who follows at least 1 user
insert into user_achievements (user_id, achievement_id)
select distinct uf.follower_id, 'friendly'
from user_follows uf
where not exists (
  select 1 from user_achievements ua
  where ua.user_id = uf.follower_id and ua.achievement_id = 'friendly'
)
on conflict do nothing;

-- 9. omnivore — anyone who rode routes with 3+ distinct surface types
insert into user_achievements (user_id, achievement_id)
select sub.user_id, 'omnivore'
from (
  select rr.user_id, count(distinct s.surface_type) as surface_count
  from route_rides rr
  join routes r on r.id = rr.route_id
  cross join lateral unnest(r.surface) as s(surface_type)
  group by rr.user_id
  having count(distinct s.surface_type) >= 3
) sub
where not exists (
  select 1 from user_achievements ua
  where ua.user_id = sub.user_id and ua.achievement_id = 'omnivore'
)
on conflict do nothing;

-- 10. own_route (hidden) — anyone who rode a route they authored
insert into user_achievements (user_id, achievement_id)
select distinct rr.user_id, 'own_route'
from route_rides rr
join routes r on r.id = rr.route_id and r.author_id = rr.user_id
where not exists (
  select 1 from user_achievements ua
  where ua.user_id = rr.user_id and ua.achievement_id = 'own_route'
)
on conflict do nothing;
