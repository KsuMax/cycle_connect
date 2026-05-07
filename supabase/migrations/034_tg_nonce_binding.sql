-- Bind tg_login_nonces to the browser that requested them.
-- Closes nonce-stealing attack: even if attacker steals the nonce, they
-- can't poll it from a different browser/IP.
--
-- NOTE: tg_login_nonces is owned by supabase_admin on the self-hosted
-- deployment. ALTER TABLE must be applied with -U supabase_admin:
--   docker exec supabase-db psql -U supabase_admin -d postgres -c \
--     'alter table public.tg_login_nonces add column if not exists client_fp text;'
-- The ALTER below is left for fresh installs where postgres is the owner.

alter table public.tg_login_nonces
  add column if not exists client_fp text;

-- Defense-in-depth: nonces are service-role-only by design, but make it explicit.
revoke all on table public.tg_login_nonces from anon, authenticated, public;

-- Cleanup of expired rows (run via pg_cron or manual).
create or replace function public.tg_login_nonces_gc()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.tg_login_nonces where expires_at < now() - interval '1 day';
$$;
revoke execute on function public.tg_login_nonces_gc() from public, anon, authenticated;
grant  execute on function public.tg_login_nonces_gc() to service_role;
