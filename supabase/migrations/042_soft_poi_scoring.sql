-- Soft POI scoring: replace hard WHERE exclusion with a relevance bonus.
--
-- Before: poi_tags filtered in WHERE → routes without the tag never appear.
-- After:  routes WITH matching poi_tags get a −0.10 score bonus (rank higher);
--         routes WITHOUT the tag still appear, ranked by semantic similarity.
--
-- Season scoring is also softened:
--   - routes matching the requested season: −0.06 bonus
--   - routes with no season (year-round): neutral (0)
--   - routes tagged for a different season: +0.06 penalty
--
-- Score formula (relevance mode, lower = better):
--   with distance target:  cosine×0.55 + dist_dev×0.35 − poi_bonus − season_bonus
--   without distance target: cosine×1.0 − poi_bonus − season_bonus

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
    -- ── Hard structural filters (always applied) ────────────────────────────
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
    -- ── Geo proximity ───────────────────────────────────────────────────────
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
    -- ── POI and season are now SOFT (scoring only, not hard exclusion) ──────
  order by
    case
      -- Popular mode: higher engagement = lower sort value
      when sort_by = 'popular'
        then -(r.rides_count * 2 + r.likes_count * 3 + r.riders_today * 10)::float

      -- Relevance with embedding + distance target: blended score
      when query_embedding is not null and r.embedding is not null
           and filter_distance_target is not null
        then
          (r.embedding <=> query_embedding) * 0.55
          + least(1.0, abs(r.distance_km - filter_distance_target)
                       / greatest(filter_distance_target * 0.40, 1.0)) * 0.35
          -- POI bonus: −0.10 when tags match, 0 otherwise
          + case
              when filter_poi_tags is not null and r.poi_tags && filter_poi_tags then -0.10
              else 0
            end
          -- Season bonus: −0.06 match, 0 year-round, +0.06 wrong season
          + case
              when filter_season_month is null         then 0
              when r.season_months is null             then 0
              when filter_season_month = any(r.season_months) then -0.06
              else 0.06
            end

      -- Relevance with embedding only
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

      -- No embedding: fall through to secondary sorts
      else 2
    end asc,
    -- Secondary: geo proximity
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
