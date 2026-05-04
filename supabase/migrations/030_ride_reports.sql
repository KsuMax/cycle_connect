-- Add surrogate id to route_rides for FK references
alter table public.route_rides
  add column if not exists id uuid not null default gen_random_uuid();

-- Ride reports: user story of a completed ride on a route
create table if not exists public.ride_reports (
  id          uuid primary key default gen_random_uuid(),
  route_id    uuid not null references public.routes(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  ride_id     uuid,                    -- optional link to route_rides.id
  ridden_at   date not null default current_date,
  vibe        text check (vibe in ('chill', 'push', 'epic', 'suffer', 'explore')),
  text        text,
  photos      text[] not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists ride_reports_route_idx on public.ride_reports (route_id, created_at desc);
create index if not exists ride_reports_user_idx  on public.ride_reports (user_id, created_at desc);

alter table public.ride_reports enable row level security;

create policy "ride_reports_select" on public.ride_reports
  for select using (true);

create policy "ride_reports_insert" on public.ride_reports
  for insert with check (auth.uid() = user_id);

create policy "ride_reports_update" on public.ride_reports
  for update using (auth.uid() = user_id);

create policy "ride_reports_delete" on public.ride_reports
  for delete using (auth.uid() = user_id);

-- Storage bucket for report photos (public read)
insert into storage.buckets (id, name, public)
  values ('report-photos', 'report-photos', true)
  on conflict do nothing;

drop policy if exists "report_photos_read"   on storage.objects;
drop policy if exists "report_photos_insert" on storage.objects;
drop policy if exists "report_photos_delete" on storage.objects;

create policy "report_photos_read" on storage.objects
  for select using (bucket_id = 'report-photos');

create policy "report_photos_insert" on storage.objects
  for insert with check (
    bucket_id = 'report-photos'
    and auth.role() = 'authenticated'
  );

create policy "report_photos_delete" on storage.objects
  for delete using (
    bucket_id = 'report-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
