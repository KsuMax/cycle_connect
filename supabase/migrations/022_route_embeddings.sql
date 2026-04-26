-- Semantic search prototype: pgvector embeddings on routes.
-- Embedding model: jina-embeddings-v3 (1024 dims, multilingual incl. Russian).

create extension if not exists vector;

alter table public.routes
  add column if not exists embedding vector(1024),
  add column if not exists embedding_updated_at timestamptz;

-- ivfflat is fine at our scale; bump `lists` once we cross ~10k rows.
create index if not exists routes_embedding_idx
  on public.routes
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Hybrid search: structured filters + cosine similarity ranking.
-- query_embedding NULL → falls back to recency ordering (lets the same RPC serve
-- both AI-search and unembedded queries).
create or replace function public.match_routes(
  query_embedding   vector(1024) default null,
  filter_difficulty text         default null,
  filter_distance_min  double precision default null,
  filter_distance_max  double precision default null,
  filter_elevation_min int        default null,
  filter_elevation_max int        default null,
  filter_region        text       default null,
  filter_surface       text[]     default null,
  filter_route_types   text[]     default null,
  filter_bike_types    text[]     default null,
  filter_search_text   text       default null,
  filter_distance_target double precision default null,
  match_count          int        default 6
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
    (filter_difficulty   is null or r.difficulty   = filter_difficulty)
    and (filter_distance_min  is null or r.distance_km >= filter_distance_min)
    and (filter_distance_max  is null or r.distance_km <= filter_distance_max)
    and (filter_elevation_min is null or r.elevation_m >= filter_elevation_min)
    and (filter_elevation_max is null or r.elevation_m <= filter_elevation_max)
    and (filter_region   is null or r.region ilike '%' || filter_region || '%')
    and (filter_surface     is null or r.surface     && filter_surface)
    and (filter_route_types is null or r.route_types && filter_route_types)
    and (filter_bike_types  is null or r.bike_types  && filter_bike_types)
    and (
      filter_search_text is null
      or r.title       ilike '%' || filter_search_text || '%'
      or r.description ilike '%' || filter_search_text || '%'
    )
  order by
    -- Primary: cosine distance to query (NULL pushed to the end via large sentinel).
    case
      when query_embedding is not null and r.embedding is not null
        then r.embedding <=> query_embedding
      else 2
    end asc,
    -- Secondary: closeness to target distance when caller asked for "~N km".
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
  text, text[], text[], text[], text, double precision, int
) to anon, authenticated, service_role;
