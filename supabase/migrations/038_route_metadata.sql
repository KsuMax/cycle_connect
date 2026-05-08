-- Sprint 2: POI tags and season metadata on routes.
--
-- poi_tags   — normalised taxonomy of points of interest the route passes by.
--              Enables queries: "к озеру", "через лес", "с видами", "кафе на пути".
--              Values: lake | river | sea | forest | viewpoint | waterfall |
--                      cafe | water_source | monastery | station | park |
--                      beach | mountain | bridge | field | castle
--
-- season_months — months (1–12) when the route rides best.
--              NULL = year-round / unknown.
--              Enables queries: "куда осенью", "зимой не грязно", "весенний маршрут".
--
-- Both fields are populated by /api/routes/metadata (LLM extraction from title +
-- description) and are kept in sync automatically via the DB trigger below.

-- ─── 1. New columns ───────────────────────────────────────────────────────────

alter table public.routes
  add column if not exists poi_tags      text[] not null default '{}',
  add column if not exists season_months int[]  default null;  -- null = year-round

-- ─── 2. GIN indexes for fast array-overlap queries ────────────────────────────

create index if not exists routes_poi_tags_idx
  on public.routes using gin(poi_tags);

create index if not exists routes_season_months_idx
  on public.routes using gin(season_months)
  where season_months is not null;

-- ─── 3. Partial index: find routes that still need metadata extraction ─────────
--  Used by the backfill endpoint's WHERE clause.

create index if not exists routes_needs_metadata_idx
  on public.routes (id)
  where array_length(poi_tags, 1) is null;   -- poi_tags = '{}' when unprocessed
