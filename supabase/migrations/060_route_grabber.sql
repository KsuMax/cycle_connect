-- ============================================================================
-- Route grabber — MVP
-- ============================================================================
-- Scans a fixed list of external sources (public Telegram channel previews,
-- an IPS cycling forum) for posts that might reference a real bike route,
-- and surfaces them to an admin for manual review at /admin/grabber. It
-- never creates or edits routes itself — the admin still creates the route
-- through the normal flow, prefilled from the candidate.
--
-- Scheduling mirrors migration 006 (strava_cron) / 053 (email_cron):
-- pg_cron fires a SECURITY DEFINER wrapper that POSTs to a thin Next.js
-- route handler, authenticated with the shared `cron_secret` Vault secret.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table if not exists public.grabber_sources (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('telegram-preview', 'ips-forum')),
  identifier text not null,        -- '@channel_name' or a full subforum URL
  label text,
  enabled boolean not null default true,
  cursor jsonb not null default '{}'::jsonb,  -- {lastMessageId} | {lastPostTs}
  last_run_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (type, identifier)
);

create table if not exists public.grabber_candidates (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.grabber_sources(id) on delete cascade,
  permalink text not null,
  title text,
  region text,
  summary text,
  links jsonb not null default '[]'::jsonb,   -- [{url, type, resolvedUrl?}]
  confidence real not null default 0,
  raw_snippet text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'imported')),
  route_id uuid references public.routes(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (source_id, permalink)
);

create index if not exists grabber_candidates_status_idx
  on public.grabber_candidates (status, created_at desc);

comment on table public.grabber_sources is 'Content sources the route grabber polls (Telegram channel previews, IPS forum subforums). No credentials needed — all read paths are public.';
comment on table public.grabber_candidates is 'Lead-generation only: posts that plausibly reference a bike route. Human reviews and imports manually at /admin/grabber; the grabber never writes to routes directly.';

-- ---------------------------------------------------------------------------
-- 2. RLS — admin-only read/update via the anon key; the worker always uses
--    the service role (bypasses RLS), so no policies are needed for it.
-- ---------------------------------------------------------------------------

alter table public.grabber_sources enable row level security;
alter table public.grabber_candidates enable row level security;

create policy "Admins can read grabber_sources"
  on public.grabber_sources
  for select
  to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

create policy "Admins can read grabber_candidates"
  on public.grabber_candidates
  for select
  to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

create policy "Admins can update grabber_candidates"
  on public.grabber_candidates
  for update
  to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- ---------------------------------------------------------------------------
-- 3. Seed sources (MVP list)
-- ---------------------------------------------------------------------------

insert into public.grabber_sources (type, identifier, label) values
  ('telegram-preview', '@blackidler_journey', 'Blackidler Journey'),
  ('telegram-preview', '@filippnekrasov', 'Филипп Некрасов'),
  ('telegram-preview', '@gulyainen_official', 'ГУЛЯЙНЕН'),
  ('ips-forum', 'https://velopiter.spb.ru/forum/98-велотуризм-россия-украина-беларусь/', 'ВелоПитер: Велотуризм Россия/Украина/Беларусь'),
  ('ips-forum', 'https://velopiter.spb.ru/forum/26-карты-gps-навигация-связь/', 'ВелоПитер: Карты, GPS, навигация, связь')
on conflict (type, identifier) do nothing;

-- ---------------------------------------------------------------------------
-- 4. pg_cron tick functions + schedule
-- ---------------------------------------------------------------------------
-- Prerequisites (already satisfied by migrations 006/053):
--   pg_cron, pg_net extensions enabled.
--   Vault secrets `app_url` and `cron_secret` present.

create or replace function public.grabber_telegram_tick()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'app_url' limit 1;
  if v_url is null or v_url = '' then
    v_url := 'https://cycleconnect.cc';
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'cron_secret' limit 1;
  if v_secret is null then
    raise warning 'grabber_telegram_tick: cron_secret missing from vault; skipping';
    return;
  end if;

  perform net.http_post(
    url     := v_url || '/api/grabber/cron',
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || v_secret,
                 'Content-Type',  'application/json'
               ),
    body    := '{"mode":"telegram"}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

revoke all on function public.grabber_telegram_tick() from public;
revoke all on function public.grabber_telegram_tick() from anon;
revoke all on function public.grabber_telegram_tick() from authenticated;
grant  execute on function public.grabber_telegram_tick() to service_role;


create or replace function public.grabber_forum_tick()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'app_url' limit 1;
  if v_url is null or v_url = '' then
    v_url := 'https://cycleconnect.cc';
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'cron_secret' limit 1;
  if v_secret is null then
    raise warning 'grabber_forum_tick: cron_secret missing from vault; skipping';
    return;
  end if;

  -- Forum mode is slow (3s crawl-delay per request, several requests per
  -- run) — give pg_net a generous timeout so it doesn't abandon the call.
  perform net.http_post(
    url     := v_url || '/api/grabber/cron',
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || v_secret,
                 'Content-Type',  'application/json'
               ),
    body    := '{"mode":"forum"}'::jsonb,
    timeout_milliseconds := 120000
  );
end;
$$;

revoke all on function public.grabber_forum_tick() from public;
revoke all on function public.grabber_forum_tick() from anon;
revoke all on function public.grabber_forum_tick() from authenticated;
grant  execute on function public.grabber_forum_tick() to service_role;


do $$
begin
  if exists (select 1 from cron.job where jobname = 'grabber-telegram') then
    perform cron.unschedule('grabber-telegram');
  end if;
end
$$;

-- Hourly: cheap (one request per channel), high value.
select cron.schedule(
  'grabber-telegram',
  '0 * * * *',
  $$select public.grabber_telegram_tick();$$
);


do $$
begin
  if exists (select 1 from cron.job where jobname = 'grabber-forum') then
    perform cron.unschedule('grabber-forum');
  end if;
end
$$;

-- Daily at 06:00 UTC (09:00 Moscow): low post velocity + crawl-delay makes
-- more frequent polling pointless.
select cron.schedule(
  'grabber-forum',
  '0 6 * * *',
  $$select public.grabber_forum_tick();$$
);
