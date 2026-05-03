-- Wind-aware routing, part 2: hourly wind forecast cache per route centroid.
--
-- Open-Meteo gives 7-day hourly forecasts free of charge but we don't want
-- to hammer it on every page view. This table caches one row per (route,
-- forecast_hour). The API route refreshes it lazily when the freshest entry
-- is older than 2 hours.

create table if not exists public.wind_forecast_cache (
  route_id      uuid not null references public.routes(id) on delete cascade,
  forecast_hour timestamptz not null,         -- truncated to the hour, UTC
  wind_dir_deg  smallint not null,            -- meteorological "from" direction, 0..359
  wind_speed_ms numeric(4,1) not null,        -- 10 m wind speed
  fetched_at    timestamptz not null default now(),
  primary key (route_id, forecast_hour)
);

create index if not exists idx_wind_forecast_route_fetched
  on public.wind_forecast_cache (route_id, fetched_at desc);

alter table public.wind_forecast_cache enable row level security;

drop policy if exists wind_forecast_read on public.wind_forecast_cache;
create policy wind_forecast_read on public.wind_forecast_cache
  for select using (true);

-- No insert/update/delete policy ⇒ writes only via service_role (the API
-- route calls the admin client to refresh the cache).

-- ─── RPC: bearing profile + centroid lat/lng for the API route ──────────────
-- Centroid is stored as a geography point; the API needs plain lat/lng to
-- forward to Open-Meteo. One RPC keeps this a single round trip.
create or replace function public.route_bearing_with_centroid(rid uuid)
returns table (buckets int[], total_m int, lat float8, lng float8)
language sql
stable
as $$
  select
    rbp.buckets,
    rbp.total_m,
    st_y(rbp.centroid::geometry) as lat,
    st_x(rbp.centroid::geometry) as lng
  from public.route_bearing_profile rbp
  where rbp.route_id = rid;
$$;

grant execute on function public.route_bearing_with_centroid(uuid) to anon, authenticated, service_role;
