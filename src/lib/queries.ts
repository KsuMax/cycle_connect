/**
 * Supabase select strings for list pages.
 *
 * Explicitly lists columns to avoid fetching:
 *  - start_point / route_line  (PostGIS geometry — can be large)
 *  - unused profile fields (bio, strava_*, tg_link_code, etc.)
 *  - route join inside events (EventCard doesn't use it)
 */

const PROFILE_FIELDS =
  "id, name, avatar_url, km_total, routes_count, events_count, telegram_username";

/**
 * Non-sensitive profile columns, safe to expose to any viewer (anon included).
 *
 * Use this in place of `profiles(*)` embeds and `profiles.select('*')` on pages
 * that read OTHER users' profiles. As of migration 065 the sensitive columns
 * (contact_email, email_public, telegram_chat_id, tg_link_code,
 * tg_link_code_exp, notify_email_address) are NOT granted to anon/authenticated,
 * so `*` would raise "permission denied". The owner reads their own full row via
 * the get_my_profile() RPC (see AuthContext).
 */
export const PUBLIC_PROFILE_COLS =
  "id, name, username, avatar_url, bio, website, strava_url, telegram_username, " +
  "km_total, routes_count, events_count, showcase_achievements, is_admin, " +
  "strava_connected, strava_synced_km, strava_synced_rides, strava_last_activity_at, " +
  "strava_show_activities, strava_sport_types, season_goal_km, created_at";

/** Use for route list pages (routes/page.tsx, RoutesPageClient load-more). */
export const ROUTE_LIST_SELECT = [
  "id, author_id, title, description, region",
  "distance_km, elevation_m, duration_min, duration_days, difficulty",
  "surface, route_types, tags",
  "mapmagic_url, mapmagic_embed, cover_url, gpx_path, gpx_updated_at",
  "exit_points_status, likes_count, riders_today, is_club_featured, created_at",
  `author:profiles!author_id(${PROFILE_FIELDS})`,
  "route_images(url)",
  "route_comments(id, text, likes_count, created_at, author:profiles!author_id(name))",
  "club:clubs!club_id(id, slug, name)",
].join(", ");

/** Use for event list pages (routes/page.tsx events tab, load-more). */
export const EVENT_LIST_SELECT = [
  "id, route_id, organizer_id, title, description",
  "start_date, end_date, max_participants, likes_count, is_private, cover_url, created_at",
  `organizer:profiles!organizer_id(${PROFILE_FIELDS})`,
  "event_days(day_number, date, title, distance_km, start_point, end_point, description)",
  `event_participants(user_id, profile:profiles!user_id(id, name, avatar_url, km_total, routes_count, events_count))`,
  "club:clubs!club_id(id, slug, name)",
].join(", ");

export const PAGE_SIZE = 20;

/** Use for club list and club detail pages. */
export const CLUB_LIST_SELECT =
  "id, slug, name, description, city, avatar_url, cover_url, visibility, owner_id, members_count, telegram_channel, created_at, last_activity_at";

/** Member rows joined with minimal profile fields. */
export const CLUB_MEMBERS_SELECT = [
  "club_id, user_id, role, status, joined_at",
  "profile:profiles!user_id(id, name, avatar_url, km_total, routes_count, events_count)",
].join(", ");
