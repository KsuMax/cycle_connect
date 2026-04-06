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
  likes_count: number;
  riders_today: number;
  created_at: string;
  // joined
  author?: DbProfile;
  route_images?: { url: string }[];
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
