-- Performance indexes for frequent query patterns.
-- route_rides is queried by (user_id) on load and filtered by route_id in RidesContext.
-- notifications is queried by user_id on every session start and via realtime.

create index if not exists route_rides_user_route_idx
  on route_rides(user_id, route_id);

create index if not exists notifications_user_id_idx
  on notifications(user_id);
