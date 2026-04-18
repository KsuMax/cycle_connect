/**
 * Supabase select strings for list pages.
 *
 * Explicitly lists columns to avoid fetching:
 *  - start_point / route_line  (PostGIS geometry — can be large)
 *  - unused profile fields (bio, strava_*, tg_link_code, etc.)
 *  - route join inside events (EventCard doesn't use it)
 */

const PROFILE_FIELDS =
  "id, name, avatar_url, km_total, routes_count, events_count, telegram_username, contact_email, email_public";

/** Use for route list pages (routes/page.tsx, RoutesPageClient load-more). */
export const ROUTE_LIST_SELECT = [
  "id, author_id, title, description, region",
  "distance_km, elevation_m, duration_min, difficulty",
  "surface, bike_types, route_types, tags",
  "mapmagic_url, mapmagic_embed, cover_url, gpx_path, gpx_updated_at",
  "exit_points_status, likes_count, riders_today, created_at",
  `author:profiles!author_id(${PROFILE_FIELDS})`,
  "route_images(url)",
  "route_comments(id, text, likes_count, created_at, author:profiles!author_id(name))",
].join(", ");

/** Use for event list pages (routes/page.tsx events tab, load-more). */
export const EVENT_LIST_SELECT = [
  "id, route_id, organizer_id, title, description",
  "start_date, end_date, max_participants, likes_count, is_private, cover_url, created_at",
  `organizer:profiles!organizer_id(${PROFILE_FIELDS})`,
  "event_days(day_number, date, title, distance_km, start_point, end_point, description)",
  `event_participants(user_id, profile:profiles!user_id(id, name, avatar_url, km_total, routes_count, events_count))`,
].join(", ");

export const PAGE_SIZE = 20;
