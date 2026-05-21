-- Refresh routes_ranked view to pick up columns added after migration 041.
--
-- The view is `select *` from routes, but Postgres pins the column set at
-- creation time. Migration 043 added `routes.duration_days`, which never
-- propagated into the view, so PostgREST queries selecting `duration_days`
-- from `routes_ranked` errored out and broke the homepage "Популярные
-- маршруты" block.

drop view if exists public.routes_ranked;

create view public.routes_ranked
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
