-- Postgres-backed rate limiter.
-- Token-bucket-ish: each (key, window) starts at 0 and increments per call.
-- Returns true if the call is allowed, false if it would exceed the limit.
-- Cheaper than building a Redis dep on a self-hosted box and not blocked by ISP.

create table if not exists public.rate_limits (
  key        text primary key,
  count      integer not null default 0,
  reset_at   timestamptz not null
);

-- Allow service_role to manage the table; clients never touch it directly.
revoke all on table public.rate_limits from anon, authenticated, public;
grant  all on table public.rate_limits to service_role;

create or replace function public.check_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_count integer;
  v_reset timestamptz;
begin
  -- Atomic upsert: if the row is past its reset, start a new window.
  insert into public.rate_limits (key, count, reset_at)
  values (p_key, 1, v_now + make_interval(secs => p_window_seconds))
  on conflict (key) do update
    set count    = case when public.rate_limits.reset_at < v_now then 1
                        else public.rate_limits.count + 1 end,
        reset_at = case when public.rate_limits.reset_at < v_now
                        then v_now + make_interval(secs => p_window_seconds)
                        else public.rate_limits.reset_at end
  returning count, reset_at into v_count, v_reset;

  return v_count <= p_limit;
end $$;

revoke execute on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant  execute on function public.check_rate_limit(text, integer, integer) to service_role;

-- Periodic GC for stale rows.
create or replace function public.rate_limits_gc()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.rate_limits where reset_at < now() - interval '1 hour';
$$;
revoke execute on function public.rate_limits_gc() from public, anon, authenticated;
grant  execute on function public.rate_limits_gc() to service_role;
