-- Region auto-detection from GPX coordinates.
-- Adds a rough rectangular bbox per region and an RPC that returns the
-- smallest-area region whose bbox contains a given (lat, lng) point.

alter table regions
  add column if not exists bbox geometry(Polygon, 4326);

create index if not exists idx_regions_bbox on regions using gist(bbox);

-- Rough bounding boxes (ST_MakeEnvelope: lng_min, lat_min, lng_max, lat_max, 4326).
-- Overlaps (Москва⊂Подмосковье, СПб⊂Ленобласть) are resolved by picking the
-- smallest-area bbox in find_region_for_point.
update regions set bbox = st_makeenvelope(29.5,  60.5,  37.5,  66.7,  4326) where name = 'Карелия';
update regions set bbox = st_makeenvelope(29.4,  59.6,  30.8,  60.25, 4326) where name = 'Санкт-Петербург';
update regions set bbox = st_makeenvelope(27.5,  58.5,  35.7,  61.4,  4326) where name = 'Ленинградская область';
update regions set bbox = st_makeenvelope(37.3,  55.4,  37.96, 56.05, 4326) where name = 'Москва';
update regions set bbox = st_makeenvelope(35.1,  54.2,  40.2,  56.95, 4326) where name = 'Подмосковье';
update regions set bbox = st_makeenvelope(36.6,  43.4,  41.8,  46.75, 4326) where name = 'Краснодарский край';
update regions set bbox = st_makeenvelope(32.4,  44.3,  36.65, 46.25, 4326) where name = 'Крым';
update regions set bbox = st_makeenvelope(81.0,  49.0,  89.5,  54.0,  4326) where name = 'Алтай';
update regions set bbox = st_makeenvelope(103.5, 51.4,  110.2, 55.85, 4326) where name = 'Байкал';
update regions set bbox = st_makeenvelope(56.0,  50.0,  66.0,  67.0,  4326) where name = 'Урал';

create or replace function find_region_for_point(lat float8, lng float8)
returns text
language sql
stable
as $$
  select name
  from regions
  where bbox is not null
    and st_contains(bbox, st_setsrid(st_makepoint(lng, lat), 4326))
  order by st_area(bbox) asc
  limit 1;
$$;

grant execute on function find_region_for_point(float8, float8) to anon, authenticated;
