import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
  created_at: string;
}

export interface DbUserAchievement {
  user_id: string;
  achievement_id: string;
  earned_at: string;
}
