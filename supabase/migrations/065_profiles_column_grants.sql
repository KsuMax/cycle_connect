-- Migration: 065_profiles_column_grants
-- Created: 2026-07-08
-- Description:
--   Closes the profiles PII / account-takeover leak (July 2026 audit).
--
--   RLS is row-level and cannot hide columns, so we switch anon + authenticated
--   from a table-wide SELECT grant to COLUMN-level SELECT grants that exclude:
--     contact_email, notify_email_address  — private e-mail addresses
--     telegram_chat_id                      — Telegram numeric id (PII)
--     tg_link_code, tg_link_code_exp        — account-link secret (TAKEOVER)
--     email_public                          — private preference flag
--
--   After this, `select('*')` and `profiles!fk(*)` embeds by anon/authenticated
--   would error, so this MUST be applied only AFTER the app deploy that:
--     • routes the owner's own-row read through get_my_profile() (migration 064)
--     • replaces every profiles select('*') / (*) embed with explicit columns.
--
--   Writes are unaffected (only SELECT is changed). Service-role paths (edge
--   functions, grabber, tg/start, tg/poll) bypass grants entirely.

-- ============================================================
-- UP
-- ============================================================

-- INSERT/UPDATE/DELETE grants are left intact — only SELECT is narrowed.
revoke select on public.profiles from anon;
revoke select on public.profiles from authenticated;

-- Non-sensitive columns — safe for any viewer (public profile pages, embeds).
grant select (
  id, name, bio, km_total, routes_count, events_count, created_at,
  username, avatar_url, website, strava_url, showcase_achievements, is_admin,
  strava_connected, strava_athlete_id, strava_synced_km, strava_synced_rides,
  strava_last_activity_at, strava_show_activities, strava_sport_types,
  telegram_username, tg_notify_interests, consent_given_at, consent_version,
  onboarded_at, email_notify_account, email_notify_events, email_notify_routes,
  email_notify_clubs, email_notify_digest, tg_notify_events, tg_notify_clubs,
  season_goal_km
) on public.profiles to anon, authenticated;

-- The six omitted columns (contact_email, email_public, telegram_chat_id,
-- tg_link_code, tg_link_code_exp, notify_email_address) are now readable only
-- via service role or the owner-only get_my_profile() RPC.

-- ============================================================
-- ROLLBACK (run manually if needed)
-- ============================================================
-- grant select on public.profiles to anon, authenticated;
