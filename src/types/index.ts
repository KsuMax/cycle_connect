export type Difficulty = "easy" | "medium" | "hard";
export type Surface = "asphalt" | "gravel" | "dirt" | "mixed";
export type BikeType = "road" | "mountain" | "gravel" | "any";
export type RouteType = "road" | "gravel" | "mtb" | "urban";
export type ExitPointKind = "train" | "bus" | "taxi" | "road" | "other";
export type ExitPointsStatus = "has" | "none" | "unknown";

export interface ExitPoint {
  id: string;
  title: string;
  kind: ExitPointKind;
  distance_km_from_start?: number | null;
  note?: string | null;
  order_idx: number;
}

export interface User {
  id: string;
  name: string;
  initials: string;
  color: string; // tailwind bg color class
  bio?: string;
  avatar_url?: string | null;
  km_total: number;
  routes_count: number;
  events_count: number;
  // Public contact (Sprint 2). Always optional — callers should hide the UI
  // when both are empty.
  telegram_username?: string | null;
  contact_email?: string | null;
}

export interface Route {
  id: string;
  title: string;
  description: string;
  region: string;
  distance_km: number;
  elevation_m: number;
  duration_min: number;
  difficulty: Difficulty;
  surface: Surface[];
  bike_types: BikeType[];
  route_types: RouteType[];
  tags: string[];
  author: User;
  riders_today: number;
  likes: number;
  mapmagic_url?: string;
  mapmagic_embed?: string; // iframe-ready URL
  cover_url?: string;
  images?: string[];
  gpx_url?: string | null;
  gpx_updated_at?: string | null;
  exit_points_status: ExitPointsStatus;
  exit_points?: ExitPoint[];
  created_at: string;
}

export interface EventDay {
  day: number;
  date: string;
  title: string;
  distance_km: number;
  start_point: string;
  end_point: string;
  description: string; // HTML from Tiptap
  surface_note?: string;
}

export interface CycleEvent {
  id: string;
  title: string;
  description: string;
  route: Route;
  organizer: User;
  start_date: string;
  end_date: string;
  days: EventDay[];
  participants: User[];
  likes: number;
  max_participants?: number;
  is_private?: boolean;
  cover_url?: string | null;
  created_at: string;
}

export interface Comment {
  id: string;
  author: User;
  text: string;
  created_at: string;
  likes: number;
}

export interface FeedItem {
  type: "route" | "event" | "activity";
  route?: Route;
  event?: CycleEvent;
  created_at: string;
}
