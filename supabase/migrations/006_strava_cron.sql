-- ============================================================================
-- Strava Integration — pg_cron queue processor
-- ============================================================================
-- Vercel Hobby restricts cron jobs to daily frequency, which is too slow to
-- drain the Strava webhook queue. Instead we schedule the work in the
-- database itself via pg_cron, which fires an HTTP POST to our Next.js
-- route handler every minute through pg_net. The handler authenticates the
-- call with a shared secret stored in Supabase Vault.
--
-- Prerequisite: the secret `cron_secret` must already exist in vault — see
-- the manual setup instructions (Supabase Dashboard → Vault). The secret's
-- value must match the CRON_SECRET environment variable used by the Next.js
-- route handler at /api/strava/cron/process-events.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enable required extensions
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Only service_role / cron should be able to call the HTTP helper. pg_net
-- already restricts access to postgres superuser and anyone with net usage.

-- ---------------------------------------------------------------------------
-- 2. SQL wrapper that dispatches one tick of the queue processor
-- ---------------------------------------------------------------------------
-- Having a function makes it trivial to change the target URL or headers
-- without touching the cron schedule itself. Keep the function body tiny so
-- pg_cron logs stay readable.

create or replace function public.strava_cron_tick()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url     text;
  v_secret  text;
begin
  -- App URL lives in a Vault secret so we can swap staging/prod without a
  -- migration. Fallback to the production domain if absent.
  select decrypted_secret into v_url
    from vault.decrypted_secrets
   where name = 'app_url'
   limit 1;

  if v_url is null or v_url = '' then
    v_url := 'https://cycleconnect.cc';
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = 'cron_secret'
   limit 1;

  if v_secret is null then
    raise warning 'strava_cron_tick: cron_secret is missing from vault; skipping';
    return;
  end if;

  perform net.http_post(
    url     := v_url || '/api/strava/cron/process-events',
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || v_secret,
                 'Content-Type',  'application/json'
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
end;
$$;

revoke all on function public.strava_cron_tick() from public;
revoke all on function public.strava_cron_tick() from anon;
revoke all on function public.strava_cron_tick() from authenticated;
grant execute on function public.strava_cron_tick() to service_role;

-- ---------------------------------------------------------------------------
-- 3. Schedule: one tick every minute
-- ---------------------------------------------------------------------------
-- cron.schedule is idempotent on the job name — repeated runs update the
-- schedule in place rather than creating duplicates. We unschedule first
-- to guarantee clean state if the function signature changes.

do $$
begin
  if exists (
    select 1 from cron.job where jobname = 'strava-process-events'
  ) then
    perform cron.unschedule('strava-process-events');
  end if;
end
$$;

select cron.schedule(
  'strava-process-events',
  '* * * * *',
  $$select public.strava_cron_tick();$$
);
