-- Sprint 1: add user-location proximity filter to match_routes.
--
-- New params (all optional, default null / 15):
--   filter_near_lat  — user's latitude
--   filter_near_lng  — user's longitude
--   filter_near_km   — search radius in km (default 15)
--
-- When filter_near_lat/lng are provided, only routes whose start_point
-- OR route_line passes within filter_near_km km of the user are returned.
-- Routes without geometry are excluded only when a geo filter is active.

drop function if exists public.match_routes(
  vector, text, double precision, double precision, int, int,
  text, text[], text[], text[], text, double precision, int, text
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
  filter_bike_types    text[]            default null,
  filter_search_text   text              default null,
  filter_distance_target double precision default null,
  match_count          int               default 6,
  sort_by              text              default 'relevance',  -- 'relevance' | 'popular'
  filter_near_lat      double precision  default null,
  filter_near_lng      double precision  default null,
  filter_near_km       double precision  default 15
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
    and (filter_bike_types   is null or r.bike_types   && filter_bike_types)
    and (
      filter_search_text is null
      or r.title       ilike '%' || filter_search_text || '%'
      or r.description ilike '%' || filter_search_text || '%'
    )
    -- Geo filter: start_point within radius OR route_line passes through radius.
    -- When no coords given → no geo filter applied (all routes pass).
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
  order by
    case
      when sort_by = 'popular'
        then -(r.rides_count * 2 + r.likes_count * 3 + r.riders_today * 10)::float
      when query_embedding is not null and r.embedding is not null
        then (r.embedding <=> query_embedding)
      else 2
    end asc,
    -- Secondary: closeness to target distance when caller asked for "~N km".
    case
      when filter_distance_target is not null
        then abs(r.distance_km - filter_distance_target)
      else 0
    end asc,
    -- Tertiary (geo mode): sort by distance from user so nearest comes first.
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
  text, text[], text[], text[], text, double precision, int, text,
  double precision, double precision, double precision
) to anon, authenticated, service_role;
