-- Add hard duration_days filters to match_routes.
--
-- Why hard, not soft like POI/season: when a user asks "поход на 4 дня",
-- mixing single-day rides into the results is actively wrong, not "less
-- relevant" — they are a different kind of trip. Treat single-day vs
-- multi-day as a structural choice, like region or difficulty.
--
-- Three new optional filters:
--   filter_multi_day_only:
--     true  → only routes where duration_days IS NOT NULL (multi-day templates)
--     false → only routes where duration_days IS NULL (single-day rides)
--     null  → no constraint
--   filter_duration_days_min, filter_duration_days_max:
--     when set, route.duration_days must fall in [min, max]. Implies multi-day.

drop function if exists public.match_routes(
  vector, text, double precision, double precision, int, int,
  text, text[], text[], text, double precision, int, text,
  double precision, double precision, double precision,
  text[], int
);

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
  filter_season_month  int               default null,
  filter_multi_day_only boolean          default null,
  filter_duration_days_min int           default null,
  filter_duration_days_max int           default null
)
returns table (
  id            uuid,
  title         text,
  distance_km   double precision,
  elevation_m   int,
  duration_min  int,
  duration_days int,
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
    r.duration_days::int,
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
      or (r.start_point is not null and ST_DWithin(
            r.start_point,
            ST_MakePoint(filter_near_lng, filter_near_lat)::geography,
            filter_near_km * 1000))
      or (r.route_line is not null and ST_DWithin(
            r.route_line,
            ST_MakePoint(filter_near_lng, filter_near_lat)::geography,
            filter_near_km * 1000))
    )
    -- ── Duration kind (single-day vs multi-day) ─────────────────────────────
    and (
      filter_multi_day_only is null
      or (filter_multi_day_only = true  and r.duration_days is not null)
      or (filter_multi_day_only = false and r.duration_days is null)
    )
    -- ── Duration days range (implies multi-day) ─────────────────────────────
    and (filter_duration_days_min is null or r.duration_days >= filter_duration_days_min)
    and (filter_duration_days_max is null or r.duration_days <= filter_duration_days_max)
  order by
    case
      when sort_by = 'popular'
        then -(r.rides_count * 2 + r.likes_count * 3 + r.riders_today * 10)::float

      when query_embedding is not null and r.embedding is not null
           and filter_distance_target is not null
        then
          (r.embedding <=> query_embedding) * 0.55
          + least(1.0, abs(r.distance_km - filter_distance_target)
                       / greatest(filter_distance_target * 0.40, 1.0)) * 0.35
          + case
              when filter_poi_tags is not null and r.poi_tags && filter_poi_tags then -0.10
              else 0
            end
          + case
              when filter_season_month is null         then 0
              when r.season_months is null             then 0
              when filter_season_month = any(r.season_months) then -0.06
              else 0.06
            end

      when query_embedding is not null and r.embedding is not null
        then
          (r.embedding <=> query_embedding)
          + case
              when filter_poi_tags is not null and r.poi_tags && filter_poi_tags then -0.10
              else 0
            end
          + case
              when filter_season_month is null         then 0
              when r.season_months is null             then 0
              when filter_season_month = any(r.season_months) then -0.06
              else 0.06
            end

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
  text[], int, boolean, int, int
) to anon, authenticated, service_role;
