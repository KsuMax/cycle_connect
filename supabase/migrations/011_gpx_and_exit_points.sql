-- ============================================================
-- Sprint 1: GPX export + exit points (sход с маршрута)
-- ============================================================

-- 1. GPX fields on routes --------------------------------------------------
alter table routes
  add column if not exists gpx_path       text,
  add column if not exists gpx_updated_at timestamptz;

-- Keep gpx_updated_at in sync when gpx_path changes.
create or replace function routes_touch_gpx_updated_at()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'INSERT' and new.gpx_path is not null)
     or (tg_op = 'UPDATE' and new.gpx_path is distinct from old.gpx_path) then
    new.gpx_updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_routes_touch_gpx on routes;
create trigger trg_routes_touch_gpx
  before insert or update on routes
  for each row execute function routes_touch_gpx_updated_at();

-- 2. Exit points status on route ------------------------------------------
-- 'has'     — at least one point attached
-- 'none'    — author explicitly said there is no exit
-- 'unknown' — not specified yet (default)
alter table routes
  add column if not exists exit_points_status text not null default 'unknown'
    check (exit_points_status in ('has', 'none', 'unknown'));

-- 3. route_exit_points -----------------------------------------------------
create table if not exists route_exit_points (
  id                       uuid primary key default gen_random_uuid(),
  route_id                 uuid not null references routes(id) on delete cascade,
  order_idx                int  not null default 0,
  title                    text not null,
  kind                     text not null default 'other'
    check (kind in ('train','bus','taxi','road','other')),
  lat                      double precision,
  lng                      double precision,
  distance_km_from_start   numeric(6,2),
  note                     text,
  created_at               timestamptz not null default now()
);

create index if not exists route_exit_points_route_idx
  on route_exit_points(route_id, order_idx);

alter table route_exit_points enable row level security;

-- Read: anyone
create policy "route_exit_points_select"
  on route_exit_points for select using (true);

-- Write: only the author of the parent route (matches route_images pattern)
create policy "route_exit_points_insert"
  on route_exit_points for insert
  with check (
    exists (select 1 from routes r
            where r.id = route_exit_points.route_id
              and r.author_id = auth.uid())
  );

create policy "route_exit_points_update"
  on route_exit_points for update
  using (
    exists (select 1 from routes r
            where r.id = route_exit_points.route_id
              and r.author_id = auth.uid())
  );

create policy "route_exit_points_delete"
  on route_exit_points for delete
  using (
    exists (select 1 from routes r
            where r.id = route_exit_points.route_id
              and r.author_id = auth.uid())
  );

-- 4. Storage bucket for GPX files ------------------------------------------
insert into storage.buckets (id, name, public)
values ('route-gpx', 'route-gpx', true)
on conflict (id) do nothing;

-- Storage policies: public read, author-only write. Files live under <route_id>/...
-- so we extract the route id from the path and check ownership.
drop policy if exists "route_gpx_read"   on storage.objects;
drop policy if exists "route_gpx_insert" on storage.objects;
drop policy if exists "route_gpx_update" on storage.objects;
drop policy if exists "route_gpx_delete" on storage.objects;

create policy "route_gpx_read"
  on storage.objects for select
  using (bucket_id = 'route-gpx');

create policy "route_gpx_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'route-gpx'
    and exists (
      select 1 from routes r
      where r.id::text = split_part(name, '/', 1)
        and r.author_id = auth.uid()
    )
  );

create policy "route_gpx_update"
  on storage.objects for update
  using (
    bucket_id = 'route-gpx'
    and exists (
      select 1 from routes r
      where r.id::text = split_part(name, '/', 1)
        and r.author_id = auth.uid()
    )
  );

create policy "route_gpx_delete"
  on storage.objects for delete
  using (
    bucket_id = 'route-gpx'
    and exists (
      select 1 from routes r
      where r.id::text = split_part(name, '/', 1)
        and r.author_id = auth.uid()
    )
  );
