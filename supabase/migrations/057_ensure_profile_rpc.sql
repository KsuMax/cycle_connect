-- Wave 5 of the May 2026 security audit.
--
-- The auth callback used to do `supabase.from("profiles").insert(...)` from
-- the browser, feeding it raw values out of `auth.users.user_metadata`. Since
-- a user can PATCH their own metadata via the GoTrue API, anything in there
-- is attacker-controlled — they could push a `javascript:` URL into
-- `strava_url` and have it rendered as a link on their profile.
--
-- This migration moves profile creation/back-fill into a single SECURITY
-- DEFINER RPC that:
--   1. Validates `strava_url` shape (https://strava.com/... only).
--   2. Re-uses the existing telegram username constraint.
--   3. Deduplicates `username` server-side (loop with numeric suffix) so the
--      browser-side TOCTOU race goes away.
--   4. Only fills NULL columns on conflict — we never overwrite values the
--      user has set later from /profile/settings.
--
-- It also adds a hard CHECK constraint on `profiles.strava_url` so that even
-- direct PATCHes via PostgREST (within RLS) can't slip a `javascript:` URL in.

-- ── 1. CHECK constraint on strava_url ────────────────────────────────────────
alter table public.profiles
  drop constraint if exists profiles_strava_url_fmt;
alter table public.profiles
  add  constraint profiles_strava_url_fmt
  check (strava_url is null
         or strava_url ~* '^https?://(www\.)?strava\.com/.+');

-- ── 2. ensure_profile RPC ────────────────────────────────────────────────────
create or replace function public.ensure_profile(
  p_id        uuid,
  p_name      text,
  p_username  text,
  p_telegram  text,
  p_strava    text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name     text := nullif(btrim(coalesce(p_name, '')), '');
  v_username text := lower(regexp_replace(coalesce(p_username, ''), '[^a-z0-9_]', '', 'g'));
  v_tg       text := nullif(btrim(regexp_replace(coalesce(p_telegram, ''), '^@', '')), '');
  v_strava   text := nullif(btrim(coalesce(p_strava, '')), '');
  v_candidate text;
  v_suffix    int := 0;
begin
  -- Auth check: the RPC is SECURITY DEFINER so we have to gate it ourselves.
  if auth.uid() is null or auth.uid() <> p_id then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  -- Fallbacks if the caller passed empty values.
  if v_name is null then
    v_name := 'Велосипедист';
  end if;
  if v_username is null or v_username = '' then
    v_username := 'user_' || substr(p_id::text, 1, 8);
  end if;

  -- Strava URL shape: matches the CHECK constraint above.
  if v_strava is not null and v_strava !~* '^https?://(www\.)?strava\.com/.+' then
    v_strava := null;
  end if;

  -- Telegram username: 5-32 chars of [A-Za-z0-9_], matches existing constraint.
  if v_tg is not null and v_tg !~ '^[A-Za-z0-9_]{5,32}$' then
    v_tg := null;
  end if;

  -- Deduplicate username server-side. Loop with a numeric suffix until we
  -- find a free slot or hit the safety cap.
  v_candidate := v_username;
  while exists (
    select 1 from public.profiles
    where username = v_candidate and id <> p_id
  ) loop
    v_suffix := v_suffix + 1;
    if v_suffix > 50 then
      -- Give up dedup and fall back to id-suffix; collisions on uuid prefix
      -- have ~zero probability.
      v_candidate := v_username || '_' || substr(p_id::text, 1, 4);
      exit;
    end if;
    v_candidate := v_username || '_' || v_suffix::text;
  end loop;

  insert into public.profiles (
    id, name, username, telegram_username, strava_url
  ) values (
    p_id, v_name, v_candidate, v_tg, v_strava
  )
  on conflict (id) do update
  set
    -- Only fill NULL columns on conflict — don't clobber user edits from
    -- /profile/settings made after the original signup.
    name              = coalesce(public.profiles.name,              excluded.name),
    username          = coalesce(public.profiles.username,          excluded.username),
    telegram_username = coalesce(public.profiles.telegram_username, excluded.telegram_username),
    strava_url        = coalesce(public.profiles.strava_url,        excluded.strava_url);
end;
$$;

revoke all on function public.ensure_profile(uuid, text, text, text, text) from public;
grant execute on function public.ensure_profile(uuid, text, text, text, text) to authenticated;

comment on function public.ensure_profile(uuid, text, text, text, text) is
  'Server-side profile bootstrap. Called by /auth/callback to back-fill the row '
  'created by the auth trigger (or insert it if the trigger missed). Validates '
  'strava_url/telegram_username shape and dedupes username — all values that '
  'used to come straight from user_metadata.';
