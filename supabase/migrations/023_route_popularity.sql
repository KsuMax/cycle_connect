-- Route popularity: denormalized rides_count + popularity score in match_routes.
--
-- Formula: rides_count × 2 + likes_count × 3 + riders_today × 10
-- riders_today gets a strong boost because it signals real-time activity.

-- ─── 1. rides_count column ────────────────────────────────────────────────────

alter table public.routes
  add column if not exists rides_count int not null default 0;

-- Backfill from existing route_rides rows
update public.routes r
set rides_count = (
  select count(*)::int from public.route_rides rr where rr.route_id = r.id
);

-- ─── 2. Trigger: keep rides_count in sync ────────────────────────────────────

create or replace function public.trg_sync_rides_count()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    update public.routes set rides_count = rides_count + 1 where id = NEW.route_id;
  elsif TG_OP = 'DELETE' then
    update public.routes set rides_count = greatest(rides_count - 1, 0) where id = OLD.route_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_rides_count on public.route_rides;
create trigger trg_rides_count
  after insert or delete on public.route_rides
  for each row execute function public.trg_sync_rides_count();

-- ─── 3. Rebuild match_routes with sort_by support ────────────────────────────
--
-- sort_by values:
--   'relevance' (default) — cosine similarity to query embedding
--   'popular'             — weighted popularity score

drop function if exists public.match_routes(
  vector, text, double precision, double precision, int, int,
  text, text[], text[], text[], text, double precision, int
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
  sort_by              text              default 'relevance'  -- 'relevance' | 'popular'
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
  order by
    case
      when sort_by = 'popular'
        then -(r.rides_count * 2 + r.likes_count * 3 + r.riders_today * 10)::float
      when query_embedding is not null and r.embedding is not null
        then (r.embedding <=> query_embedding)
      else 2
    end asc,
    -- secondary: distance target closeness
    case
      when filter_distance_target is not null
        then abs(r.distance_km - filter_distance_target)
      else 0
    end asc,
    r.created_at desc
  limit match_count;
$$;

grant execute on function public.match_routes(
  vector, text, double precision, double precision, int, int,
  text, text[], text[], text[], text, double precision, int, text
) to anon, authenticated, service_role;
