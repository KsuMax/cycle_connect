-- ============================================================
-- Backfill levels for existing users based on current stats
-- ============================================================

-- century: update level based on km_total
update user_achievements ua
set level = case
  when p.km_total >= 5000 then 4
  when p.km_total >= 1000 then 3
  when p.km_total >= 500  then 2
  else 1
end,
level_updated_at = now()
from profiles p
where ua.user_id = p.id
  and ua.achievement_id = 'century'
  and (
    (p.km_total >= 5000 and ua.level < 4) or
    (p.km_total >= 1000 and ua.level < 3) or
    (p.km_total >= 500  and ua.level < 2)
  );

-- architect: update level based on routes_count
update user_achievements ua
set level = case
  when p.routes_count >= 50 then 4
  when p.routes_count >= 25 then 3
  when p.routes_count >= 10 then 2
  else 1
end,
level_updated_at = now()
from profiles p
where ua.user_id = p.id
  and ua.achievement_id = 'architect'
  and (
    (p.routes_count >= 50 and ua.level < 4) or
    (p.routes_count >= 25 and ua.level < 3) or
    (p.routes_count >= 10 and ua.level < 2)
  );

-- regular: update level based on event participations
update user_achievements ua
set level = case
  when ep_count >= 30 then 3
  when ep_count >= 15 then 2
  else 1
end,
level_updated_at = now()
from (
  select user_id, count(*) as ep_count
  from event_participants
  group by user_id
) ep
where ua.user_id = ep.user_id
  and ua.achievement_id = 'regular'
  and (
    (ep.ep_count >= 30 and ua.level < 3) or
    (ep.ep_count >= 15 and ua.level < 2)
  );

-- friendly: update level based on follows count
update user_achievements ua
set level = case
  when f_count >= 50 then 4
  when f_count >= 25 then 3
  when f_count >= 10 then 2
  else 1
end,
level_updated_at = now()
from (
  select follower_id, count(*) as f_count
  from user_follows
  group by follower_id
) f
where ua.user_id = f.follower_id
  and ua.achievement_id = 'friendly'
  and (
    (f.f_count >= 50 and ua.level < 4) or
    (f.f_count >= 25 and ua.level < 3) or
    (f.f_count >= 10 and ua.level < 2)
  );

-- explorer: backfill for users who rode in 3+ regions
insert into user_achievements (user_id, achievement_id)
select sub.user_id, 'explorer'
from (
  select rr.user_id, count(distinct r.region) as region_count
  from route_rides rr
  join routes r on r.id = rr.route_id
  where r.region is not null and r.region != ''
  group by rr.user_id
  having count(distinct r.region) >= 3
) sub
where not exists (
  select 1 from user_achievements ua
  where ua.user_id = sub.user_id and ua.achievement_id = 'explorer'
)
on conflict do nothing;

-- social_magnet: backfill for users with 10+ followers
insert into user_achievements (user_id, achievement_id)
select sub.following_id, 'social_magnet'
from (
  select following_id, count(*) as followers
  from user_follows
  group by following_id
  having count(*) >= 10
) sub
where not exists (
  select 1 from user_achievements ua
  where ua.user_id = sub.following_id and ua.achievement_id = 'social_magnet'
)
on conflict do nothing;
