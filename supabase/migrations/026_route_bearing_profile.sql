-- Wind-aware routing, part 1: bearing fingerprint per route.
--
-- For every route with a `route_line` geometry we precompute a histogram of
-- segment directions (36 buckets × 10°). Combined with a wind forecast for
-- the route's centroid this lets us score every existing route against any
-- start time, in either direction, without re-running geometry math at query
-- time.
--
-- Distance per bucket is the cumulative length of segments whose travel
-- bearing falls into that bucket; bucket index 0 = [0°, 10°) clockwise from
-- north (i.e. heading just east of north), index 9 = [90°, 100°) (heading
-- east), etc.

-- ─── 1. Profile table ───────────────────────────────────────────────────────
create table if not exists public.route_bearing_profile (
  route_id     uuid primary key references public.routes(id) on delete cascade,
  buckets      int[] not null,                      -- length 36, meters per bucket
  total_m      int  not null,
  centroid     geography(POINT, 4326) not null,
  computed_at  timestamptz not null default now()
);

create index if not exists idx_route_bearing_centroid
  on public.route_bearing_profile using gist(centroid);

alter table public.route_bearing_profile enable row level security;

drop policy if exists route_bearing_profile_read on public.route_bearing_profile;
create policy route_bearing_profile_read on public.route_bearing_profile
  for select using (true);

-- ─── 2. compute_bearing_profile(line) → (buckets, total_m) ──────────────────
-- Densifies the line to ~500 m segments, then walks consecutive points,
-- computing bearing + length for each segment and accumulating into 10° buckets.
create or replace function public.compute_bearing_profile(line geography)
returns table (buckets int[], total_m int)
language plpgsql
stable
as $$
declare
  result_buckets int[] := array_fill(0, array[36]);
  result_total   int   := 0;
begin
  if line is null then
    return query select result_buckets, result_total;
    return;
  end if;

  with
  dense as (
    select st_segmentize(line, 500) as g
  ),
  pts as (
    select
      (dp).path[1] as idx,
      (dp).geom::geography as p
    from dense, lateral st_dumppoints(dense.g::geometry) as dp
  ),
  segs as (
    select
      idx,
      p as a,
      lead(p) over (order by idx) as b
    from pts
  ),
  stats as (
    select
      st_distance(a, b) as dist_m,
      mod((degrees(st_azimuth(a, b)) + 360.0)::numeric, 360.0) as az
    from segs
    where b is not null
  ),
  bucketed as (
    select floor(az / 10)::int as bucket, sum(dist_m) as bucket_m
    from stats
    where dist_m > 0
    group by 1
  ),
  filled as (
    select b.idx as bucket, coalesce(round(bk.bucket_m)::int, 0) as bucket_m
    from generate_series(0, 35) as b(idx)
    left join bucketed bk on bk.bucket = b.idx
    order by b.idx
  )
  select
    array_agg(bucket_m order by bucket),
    coalesce(sum(bucket_m), 0)::int
  into result_buckets, result_total
  from filled;

  return query select result_buckets, result_total;
end;
$$;

-- ─── 3. Trigger keeps profile in sync with routes.route_line ────────────────
create or replace function public.trg_refresh_bearing_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prof record;
  cent geometry;
begin
  if NEW.route_line is null then
    delete from public.route_bearing_profile where route_id = NEW.id;
    return NEW;
  end if;

  select * into prof from public.compute_bearing_profile(NEW.route_line);

  if prof.total_m is null or prof.total_m = 0 then
    delete from public.route_bearing_profile where route_id = NEW.id;
    return NEW;
  end if;

  cent := st_centroid(NEW.route_line::geometry);

  insert into public.route_bearing_profile (route_id, buckets, total_m, centroid, computed_at)
  values (NEW.id, prof.buckets, prof.total_m, cent::geography, now())
  on conflict (route_id) do update set
    buckets     = excluded.buckets,
    total_m     = excluded.total_m,
    centroid    = excluded.centroid,
    computed_at = now();

  return NEW;
end;
$$;

drop trigger if exists trg_refresh_bearing_profile on public.routes;
create trigger trg_refresh_bearing_profile
  after insert or update of route_line on public.routes
  for each row
  execute function public.trg_refresh_bearing_profile();

-- ─── 4. Backfill existing routes ────────────────────────────────────────────
insert into public.route_bearing_profile (route_id, buckets, total_m, centroid, computed_at)
select
  r.id,
  prof.buckets,
  prof.total_m,
  st_centroid(r.route_line::geometry)::geography,
  now()
from public.routes r,
     lateral public.compute_bearing_profile(r.route_line) as prof
where r.route_line is not null
  and prof.total_m > 0
on conflict (route_id) do update set
  buckets     = excluded.buckets,
  total_m     = excluded.total_m,
  centroid    = excluded.centroid,
  computed_at = now();
