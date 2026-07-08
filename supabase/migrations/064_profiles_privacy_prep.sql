-- Migration: 064_profiles_privacy_prep
-- Created: 2026-07-08
-- Description:
--   July 2026 security audit — PII/takeover hardening on public.profiles.
--
--   The base SELECT policy `profiles: read public USING (true)` combined with a
--   table-wide SELECT grant leaks EVERY column of EVERY profile to anonymous
--   clients — including tg_link_code / tg_link_code_exp (account-takeover: a
--   leaked, still-valid link code lets an attacker bind their Telegram to a
--   victim's account via the bot's /start link_<code> flow), contact_email,
--   notify_email_address and telegram_chat_id.
--
--   RLS cannot restrict columns, so the actual lockdown is column-level GRANTs
--   (see 065). This migration is the ADDITIVE, breakage-free prerequisite:
--     1. get_my_profile() — owner-only RPC returning the caller's FULL row,
--        so the client can still read its own private fields after 065 revokes
--        column-level SELECT on them.
--     2. Hardens the INSERT policy so a client can't self-insert is_admin=true.
--        (UPDATE was already pinned; INSERT was not.)
--     3. Locks tg_login_nonces so anon/authenticated have no direct grants
--        (they never should — all access is via service-role API routes).
--
--   Apply order: 064 (this) → deploy app code → 065.

-- ============================================================
-- UP
-- ============================================================

-- 1. Owner-only full-profile RPC ------------------------------------------------
-- SECURITY DEFINER (owned by postgres) so it bypasses the column-level GRANTs
-- that 065 puts in place. Self-gated to auth.uid(): a caller can only ever get
-- their OWN row, private columns included.
create or replace function public.get_my_profile()
returns setof public.profiles
language sql
security definer
set search_path = public
stable
as $$
  select * from public.profiles where id = auth.uid();
$$;

revoke all on function public.get_my_profile() from public, anon;
grant execute on function public.get_my_profile() to authenticated;

comment on function public.get_my_profile() is
  'Returns the calling user''s own profile row (all columns, including private '
  'ones such as contact_email / telegram_chat_id / tg_link_code). Owner-only '
  'via auth.uid(); used by the client after 065 restricts column-level SELECT.';

-- 2. Harden INSERT policy: block self-granted admin ----------------------------
-- Existing policy only checked `auth.uid() = id`. The auth trigger
-- (handle_new_user) and ensure_profile RPC are SECURITY DEFINER and bypass RLS,
-- so tightening the client INSERT path here does not affect signup.
drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own"
  on public.profiles
  for insert
  to public
  with check (auth.uid() = id and coalesce(is_admin, false) = false);

-- 3. Lock down tg_login_nonces -------------------------------------------------
-- Table is service-role-only by design (tg/start + tg/poll routes use the
-- service key). Migration 034 tried this but noted it must run as the table
-- owner on the self-hosted deployment; make it explicit and idempotent here.
revoke all on table public.tg_login_nonces from anon, authenticated, public;

-- ============================================================
-- ROLLBACK (run manually if needed)
-- ============================================================
-- drop function if exists public.get_my_profile();
-- drop policy if exists "profiles: insert own" on public.profiles;
-- create policy "profiles: insert own" on public.profiles
--   for insert to public with check (auth.uid() = id);
-- grant select, insert, update, delete on public.tg_login_nonces to anon, authenticated;
