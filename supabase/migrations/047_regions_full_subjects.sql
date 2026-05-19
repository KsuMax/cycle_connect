-- Expand `regions` to cover all RF federal subjects + a few "macro" travel areas
-- (Подмосковье, Байкал, Урал) and switch auto-detection to real polygons.
--
-- Display name (`name`) stays short and colloquial — what users actually type
-- ("Карелия", не "Республика Карелия"). `full_name` keeps the formal subject
-- name for tooltips/search. `aliases` lets us match legacy values during
-- backfill and accept user typos later.

alter table regions
  add column if not exists full_name text,
  add column if not exists type      text not null default 'subject',
  add column if not exists aliases   text[] not null default '{}',
  add column if not exists geom      geometry(MultiPolygon, 4326);

alter table regions
  drop constraint if exists regions_type_check;
alter table regions
  add constraint regions_type_check check (type in ('subject', 'macro'));

create index if not exists idx_regions_geom on regions using gist(geom);
create index if not exists idx_regions_type on regions(type);

-- Autodetect: prefer a macro travel-region if the point falls inside one
-- (Подмосковье, Байкал, Урал are more useful labels than the underlying
-- subject for a tourist). Otherwise pick the smallest matching subject,
-- which resolves the Москва ⊂ Московская область overlap.
create or replace function find_region_for_point(lat float8, lng float8)
returns text
language sql
stable
as $$
  with point as (
    select st_setsrid(st_makepoint(lng, lat), 4326) as g
  ),
  matches as (
    select r.name, r.type, st_area(r.geom) as area
    from regions r, point p
    where r.geom is not null
      and st_contains(r.geom, p.g)
  )
  select name from matches
  order by
    case when type = 'macro' then 0 else 1 end,
    area asc
  limit 1;
$$;

grant execute on function find_region_for_point(float8, float8) to anon, authenticated;

-- ── Seed helpers (called from scripts/seed-regions.ts via service role) ─────
-- Setting a geometry column from a GeoJSON string isn't expressible via the
-- PostgREST table API, so expose narrow SQL helpers. Service-role only.

create or replace function set_region_geom(p_name text, p_geojson text)
returns void
language sql
as $$
  update regions
  set geom = st_multi(st_setsrid(st_geomfromgeojson(p_geojson), 4326))
  where name = p_name;
$$;

create or replace function set_macro_region_geom(
  p_name text,
  p_source_full_names text[]
)
returns void
language sql
as $$
  update regions
  set geom = (
    select st_multi(st_union(geom))
    from regions
    where full_name = any(p_source_full_names)
      and geom is not null
  )
  where name = p_name;
$$;

revoke execute on function set_region_geom(text, text)            from anon, authenticated;
revoke execute on function set_macro_region_geom(text, text[])    from anon, authenticated;
