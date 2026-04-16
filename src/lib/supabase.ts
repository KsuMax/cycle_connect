import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const isBrowser = typeof window !== "undefined";

// Cookie keys are derived from supabaseUrl, so we must always pass the real URL to
// createBrowserClient — otherwise the middleware (which also uses supabaseUrl) won't
// find the session cookie and will redirect authenticated users to /auth/login.
// Requests are still routed through the Vercel proxy via a custom fetch.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: (input, init) => {
      if (isBrowser) {
        const url = input instanceof Request ? input.url : String(input);
        const proxied = url.replace(supabaseUrl, `${window.location.origin}/api/supabase`);
        if (proxied !== url) {
          return fetch(new Request(proxied, input instanceof Request ? input : undefined), init);
        }
      }
      return fetch(input, init);
    },
  },
});

/**
 * Rewrite a Supabase storage URL to go through our proxy when in the browser.
 * DB stores absolute URLs like "https://xxx.supabase.co/storage/v1/object/public/..."
 * In Russia these are blocked, so we rewrite them to "/api/supabase/storage/..."
 */
export function proxyImageUrl(url: string | null | undefined): string | null | undefined {
  if (!url || !isBrowser) return url;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith(".supabase.co") || parsed.hostname.endsWith(".supabase.in")) {
      return `/api/supabase${parsed.pathname}${parsed.search}`;
    }
  } catch {
    // not a valid URL, return as-is
  }
  return url;
}

// ─── Types matching DB schema ─────────────────────────────────────────────────

export interface DbProfile {
  id: string;
  name: string;
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
  km_total: number;
  routes_count: number;
  events_count: number;
  created_at: string;
  website?: string | null;
  strava_url?: string | null;
  showcase_achievements?: string[] | null;
  is_admin?: boolean;
  // Strava integration (added by migration 005). All optional so old rows
  // and other code that selects subsets of profiles still type-check.
  strava_connected?: boolean;
  strava_athlete_id?: number | null;
  strava_synced_km?: number;
  strava_synced_rides?: number;
  strava_last_activity_at?: string | null;
  strava_show_activities?: boolean;
  strava_sport_types?: string[];
  // Contact fields (migration 012)
  telegram_username?: string | null;
  contact_email?: string | null;
  email_public?: boolean;
  // TG bot linking (migration 013)
  telegram_chat_id?: number | null;
  tg_link_code?: string | null;
  tg_link_code_exp?: string | null;
  tg_notify_intents?: boolean;
}

/**
 * Row shape for public.strava_activities. Mirrors the columns we
 * read from the client; the `raw` jsonb column is not exposed here
 * because we never need it on the frontend.
 */
export interface DbStravaActivity {
  id: number;
  user_id: string;
  athlete_id: number;
  type: string;
  sport_type: string | null;
  name: string | null;
  distance_m: number;
  moving_time_s: number;
  elapsed_time_s: number;
  total_elevation_gain_m: number | null;
  average_speed_ms: number | null;
  max_speed_ms: number | null;
  average_heartrate: number | null;
  max_heartrate: number | null;
  kudos_count: number;
  start_date: string;
  timezone: string | null;
  start_latlng: number[] | null;
  end_latlng: number[] | null;
  summary_polyline: string | null;
  is_manual: boolean;
  is_private: boolean;
  is_commute: boolean;
  is_trainer: boolean;
  is_counted: boolean;
}

export interface DbRoute {
  id: string;
  author_id: string;
  title: string;
  description: string;
  region: string;
  distance_km: number;
  elevation_m: number;
  duration_min: number;
  difficulty: "easy" | "medium" | "hard";
  surface: string[];
  bike_types: string[];
  route_types: string[];
  tags: string[];
  mapmagic_url: string | null;
  mapmagic_embed: string | null;
  cover_url: string | null;
  gpx_path: string | null;
  gpx_updated_at: string | null;
  exit_points_status: "has" | "none" | "unknown";
  likes_count: number;
  riders_today: number;
  created_at: string;
  // joined
  author?: DbProfile;
  route_images?: { url: string }[];
  route_exit_points?: DbRouteExitPoint[];
}

export interface DbRouteExitPoint {
  id: string;
  route_id: string;
  order_idx: number;
  title: string;
  kind: "train" | "bus" | "taxi" | "road" | "other";
  lat: number | null;
  lng: number | null;
  distance_km_from_start: number | null;
  note: string | null;
  created_at: string;
}

export interface DbEvent {
  id: string;
  route_id: string | null;
  organizer_id: string;
  title: string;
  description: string;
  start_date: string | null;
  end_date: string | null;
  max_participants: number | null;
  likes_count: number;
  is_private: boolean;
  cover_url: string | null;
  gpx_path: string | null;
  gpx_updated_at: string | null;
  created_at: string;
  // joined
  organizer?: DbProfile;
  route?: DbRoute;
  event_days?: DbEventDay[];
  event_participants?: { user_id: string; profile?: DbProfile | null }[];
}

export interface DbEventDay {
  id: string;
  event_id: string;
  day_number: number;
  date: string | null;
  title: string | null;
  distance_km: number | null;
  start_point: string | null;
  end_point: string | null;
  description: string | null;
  surface_note: string | null;
}

export interface DbAchievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  is_hidden: boolean;
  sort_order: number;
  max_level: number;
  level_thresholds: Record<string, number> | null;
  created_at: string;
}

export interface DbUserAchievement {
  user_id: string;
  achievement_id: string;
  earned_at: string;
  level: number;
  level_updated_at: string | null;
}

export interface DbRideIntent {
  id: string;
  route_id: string;
  creator_id: string;
  planned_date: string;
  note: string | null;
  created_at: string;
  // joined
  creator?: DbProfile;
  participants?: { user_id: string; joined_at: string; profile?: DbProfile | null }[];
}

export interface DbNotification {
  id: string;
  user_id: string;
  type: string;
  actor_id: string | null;
  data: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
  actor?: DbProfile;
}
