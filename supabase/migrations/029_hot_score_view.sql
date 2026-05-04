-- Hot-score view for the Feed's "Popular routes" section.
--
-- Formula: (likes_count + 2×riders_today + rides_count) / (age_hours + 24)^1.5
--
-- Signals:
--   likes_count   — accumulated interest
--   riders_today  — real-time activity (weighted ×2)
--   rides_count   — total times the route was ridden (trigger-maintained)
--   age_hours     — denominator decays older routes so new routes can surface
--   +24           — prevents division near zero for brand-new routes
--
-- The view selects all columns from routes so PostgREST inherits every
-- foreign-key relationship (author, route_images, clubs, etc.) transparently.

create or replace view public.routes_ranked
with (security_invoker = true)
as
select
  *,
  (likes_count + 2.0 * riders_today + rides_count)
    / power(
        extract(epoch from (now() - created_at)) / 3600.0 + 24,
        1.5
      ) as hot_score
from public.routes;

grant select on public.routes_ranked to anon, authenticated, service_role;
