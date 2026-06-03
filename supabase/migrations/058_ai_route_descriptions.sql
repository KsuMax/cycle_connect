-- AI route descriptions cache tables.
--
-- The pipeline collects two layers of intermediate data that are expensive to
-- recompute but cheap to look up by geometry hash:
--
--   1. `osm_context_cache` — Overpass features in a 200 m corridor around the
--      route. Same geometry → same features (OSM updates are slow). Cached
--      keyed on a hash of the simplified LINESTRING.
--
--   2. `route_descriptions_cache` — final LLM-generated description, keyed on
--      (route_id, language). Stores the model used for A/B telemetry and the
--      provenance of the underlying context (OSM cache, elevation source).
--
-- Both tables are write-from-server-only. The browser reads through Supabase
-- RLS; we keep both readable so authors can see their own drafts in the form.

-- ── 1. OSM context cache ────────────────────────────────────────────────────
create table if not exists public.osm_context_cache (
  geometry_hash   text primary key,
  buffer_meters   int  not null,
  features        jsonb not null,
  feature_count   int  not null,
  endpoint_used   text,
  fetched_at      timestamptz not null default now()
);

comment on table public.osm_context_cache is
  'Overpass results keyed by sha1 of simplified route LINESTRING. Refresh manually after major OSM edits in the region.';

create index if not exists osm_context_cache_fetched_at_idx
  on public.osm_context_cache (fetched_at);

-- Service-role-only access — no RLS policies for anon/authenticated.
alter table public.osm_context_cache enable row level security;

-- ── 2. Route descriptions cache ─────────────────────────────────────────────
create table if not exists public.route_descriptions_cache (
  route_id        uuid not null references public.routes(id) on delete cascade,
  language        text not null,
  description     text not null,
  geometry_hash   text not null,
  model_used      text not null,
  provider_used   text not null,
  context_sources jsonb not null default '{}'::jsonb,
  guardrail_ok    boolean not null default true,
  guardrail_warnings jsonb,
  generated_at    timestamptz not null default now(),
  primary key (route_id, language)
);

comment on table public.route_descriptions_cache is
  'AI-generated draft descriptions per (route, language). Stores model and provider for accept-rate analytics.';

create index if not exists route_descriptions_cache_route_idx
  on public.route_descriptions_cache (route_id);

create index if not exists route_descriptions_cache_model_idx
  on public.route_descriptions_cache (model_used);

alter table public.route_descriptions_cache enable row level security;

-- The route author can read their own cached descriptions (to display in the
-- editor as a "saved draft" badge or for regeneration).
drop policy if exists route_descriptions_cache_author_read
  on public.route_descriptions_cache;
create policy route_descriptions_cache_author_read
  on public.route_descriptions_cache
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.routes r
      where r.id = route_descriptions_cache.route_id
        and r.author_id = auth.uid()
    )
  );

-- Writes are server-side only (service role). No insert/update policies for
-- anon/authenticated — they'd be no-ops by default.
