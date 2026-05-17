-- Multi-day route templates.
--
-- Before: routes only had duration_min (single-day rides, hours/minutes).
-- After:  routes can also be multi-day trip *templates* (not dated events —
--         dated trips live in cycle_events). A route with duration_days IS NOT NULL
--         represents a "4-day gravel tour" idea that users can browse and filter by.
--
-- Semantics:
--   duration_days IS NULL → single-day route, duration_min is the ride time.
--   duration_days IS NOT NULL → multi-day template; duration_min may be null
--   or hold aggregate moving time (optional, UI does not require it).

alter table public.routes
  add column if not exists duration_days int
    check (duration_days is null or (duration_days >= 1 and duration_days <= 60));

create index if not exists idx_routes_duration_days
  on public.routes (duration_days)
  where duration_days is not null;
