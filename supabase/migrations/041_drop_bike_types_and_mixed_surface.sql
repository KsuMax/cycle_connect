-- Drop the redundant `bike_types` column on routes and clean up `surface = 'mixed'`.
--
-- Why:
--   * `bike_types` duplicated `route_types` semantically (gravel/road/mtb appear
--     in both with slightly different values). UI exposed it as a second
--     selector, which confused authors. Filtering UI never used it; AI search
--     intent ("горный вел") is mapped onto route_types now.
--   * `surface = 'mixed'` is mutually exclusive with the multi-select nature of
--     the field — a route tagged ["mixed"] never matched a filter for
--     ["asphalt"] even when asphalt was clearly present. Backfilling to
--     ["asphalt","gravel"] makes it discoverable.

-- ── 1. Backfill surface: replace 'mixed' with both 'asphalt' and 'gravel' ───
update public.routes
set surface = (
  select array_agg(distinct s)
  from unnest(
    array_remove(surface, 'mixed') || array['asphalt', 'gravel']
  ) as s
)
where 'mixed' = any(surface);

-- ── 2. Drop match_routes overload that takes filter_bike_types ─────────────
drop function if exists public.match_routes(
  vector, text, double precision, double precision, int, int,
  text, text[], text[], text[], text, double precision, int, text,
  double precision, double precision, double precision,
  text[], int
);

-- ── 3. Drop the column ─────────────────────────────────────────────────────
alter table public.routes drop column if exists bike_types;

-- ── 4. Recreate match_routes WITHOUT filter_bike_types ─────────────────────
create or replace function public.match_routes(
  query_embedding      vector(1024)      default null,
  filter_difficulty    text              default null,
  filter_distance_min  double precision  default null,
  filter_distance_max  double precision  default null,
  filter_elevation_min int               default null,
  filter_elevation_max int               default null,
  filter_region        text              default null,
  filter_surface       text[]            default null,
  filter_route_types   text[]            default null,
  filter_search_text   text              default null,
  filter_distance_target double precision default null,
  match_count          int               default 6,
  sort_by              text              default 'relevance',
  filter_near_lat      double precision  default null,
  filter_near_lng      double precision  default null,
  filter_near_km       double precision  default 15,
  filter_poi_tags      text[]            default null,
  filter_season_month  int               default null
)
returns table (
  id            uuid,
  title         text,
  distance_km   double precision,
  elevation_m   int,
  duration_min  int,
  difficulty    text,
  region        text,
  cover_url     text,
  tags          text[],
  similarity    double precision
)
language sql stable
as $$
  select
    r.id,
    r.title,
    r.distance_km::double precision,
    r.elevation_m::int,
    r.duration_min::int,
    r.difficulty,
    r.region,
    r.cover_url,
    r.tags,
    case
      when query_embedding is null or r.embedding is null then 0
      else 1 - (r.embedding <=> query_embedding)
    end::double precision as similarity
  from public.routes r
  where
    (filter_difficulty    is null or r.difficulty    = filter_difficulty)
    and (filter_distance_min  is null or r.distance_km  >= filter_distance_min)
    and (filter_distance_max  is null or r.distance_km  <= filter_distance_max)
    and (filter_elevation_min is null or r.elevation_m  >= filter_elevation_min)
    and (filter_elevation_max is null or r.elevation_m  <= filter_elevation_max)
    and (filter_region    is null or r.region    ilike '%' || filter_region    || '%')
    and (filter_surface      is null or r.surface      && filter_surface)
    and (filter_route_types  is null or r.route_types  && filter_route_types)
    and (
      filter_search_text is null
      or r.title       ilike '%' || filter_search_text || '%'
      or r.description ilike '%' || filter_search_text || '%'
    )
    and (
      filter_near_lat is null
      or (
        r.start_point is not null
        and ST_DWithin(
          r.start_point,
          ST_MakePoint(filter_near_lng, filter_near_lat)::geography,
          filter_near_km * 1000
        )
      )
      or (
        r.route_line is not null
        and ST_DWithin(
          r.route_line,
          ST_MakePoint(filter_near_lng, filter_near_lat)::geography,
          filter_near_km * 1000
        )
      )
    )
    and (
      filter_poi_tags is null
      or r.poi_tags && filter_poi_tags
    )
    and (
      filter_season_month is null
      or r.season_months is null
      or filter_season_month = any(r.season_months)
    )
  order by
    case
      when sort_by = 'popular'
        then -(r.rides_count * 2 + r.likes_count * 3 + r.riders_today * 10)::float

      when query_embedding is not null and r.embedding is not null
           and filter_distance_target is not null
        then (r.embedding <=> query_embedding) * 0.60
             + least(1.0, abs(r.distance_km - filter_distance_target)
                          / greatest(filter_distance_target * 0.40, 1.0)) * 0.40

      when query_embedding is not null and r.embedding is not null
        then (r.embedding <=> query_embedding)

      else 2
    end asc,
    case
      when filter_near_lat is not null and r.start_point is not null
        then ST_Distance(r.start_point, ST_MakePoint(filter_near_lng, filter_near_lat)::geography)
      else 0
    end asc,
    r.created_at desc
  limit match_count;
$$;

grant execute on function public.match_routes(
  vector, text, double precision, double precision, int, int,
  text, text[], text[], text, double precision, int, text,
  double precision, double precision, double precision,
  text[], int
) to anon, authenticated, service_role;
