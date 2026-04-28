-- Cache for MapMagic route geometry fetched via their public API.
-- Keyed by id_track (the slug from ?routes= URL param).
create table if not exists mapmagic_route_cache (
  id_track      text primary key,
  gpx_xml       text not null,
  name          text,
  description   text,
  distance_km   numeric,
  elevation_m   numeric,
  fetched_at    timestamptz not null default now()
);
