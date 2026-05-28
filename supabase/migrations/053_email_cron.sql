-- ============================================================
-- Email cron jobs: hour-before reminder + post-event report prompt.
--
-- Pattern mirrors migration 006 (strava_cron): pg_cron fires a
-- SECURITY DEFINER wrapper every N minutes; the wrapper reads
-- `app_url` and `cron_secret` from Vault and POSTs to the
-- Next.js route handler /api/email-cron, which in turn invokes
-- the email-notify edge function with the service role key.
--
-- Prerequisites (same as migration 006):
--   Vault secret `app_url`     — e.g. https://cycleconnect.cc
--   Vault secret `cron_secret` — shared secret; must equal
--                                 process.env.CRON_SECRET in Next.js
--   pg_cron and pg_net already enabled (done in migration 006).
-- ============================================================


-- ── 1. hour-before reminder ──────────────────────────────────

create or replace function public.email_hour_reminder_tick()
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
    raise warning 'email_hour_reminder_tick: cron_secret missing from vault; skipping';
    return;
  end if;

  perform net.http_post(
    url     := v_url || '/api/email-cron',
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || v_secret,
                 'Content-Type',  'application/json'
               ),
    body    := '{"mode":"event_hour_reminder"}'::jsonb,
    timeout_milliseconds := 8000
  );
end;
$$;

revoke all on function public.email_hour_reminder_tick() from public;
revoke all on function public.email_hour_reminder_tick() from anon;
revoke all on function public.email_hour_reminder_tick() from authenticated;
grant  execute on function public.email_hour_reminder_tick() to service_role;


-- ── 2. post-event report prompt ──────────────────────────────

create or replace function public.email_post_report_tick()
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
    raise warning 'email_post_report_tick: cron_secret missing from vault; skipping';
    return;
  end if;

  perform net.http_post(
    url     := v_url || '/api/email-cron',
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || v_secret,
                 'Content-Type',  'application/json'
               ),
    body    := '{"mode":"event_post_report"}'::jsonb,
    timeout_milliseconds := 15000
  );
end;
$$;

revoke all on function public.email_post_report_tick() from public;
revoke all on function public.email_post_report_tick() from anon;
revoke all on function public.email_post_report_tick() from authenticated;
grant  execute on function public.email_post_report_tick() to service_role;


-- ── 3. Cron schedules ─────────────────────────────────────────

-- hour-before reminder: every 30 min
-- Window in edge function: events starting in 50–70 min.
-- Running every 30 min ensures each event is caught in exactly
-- one firing even with pg_cron scheduling drift.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'email-hour-reminder') then
    perform cron.unschedule('email-hour-reminder');
  end if;
end
$$;

select cron.schedule(
  'email-hour-reminder',
  '*/30 * * * *',
  $$select public.email_hour_reminder_tick();$$
);


-- post-event report prompt: daily at 08:00 UTC (11:00 МСК)
-- Window in edge function: events that started 22–26 h ago.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'email-post-report') then
    perform cron.unschedule('email-post-report');
  end if;
end
$$;

select cron.schedule(
  'email-post-report',
  '0 8 * * *',
  $$select public.email_post_report_tick();$$
);
