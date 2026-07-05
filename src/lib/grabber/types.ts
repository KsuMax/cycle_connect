/**
 * Route grabber — shared types.
 *
 * The grabber scans a fixed list of external sources (public Telegram
 * channels, a cycling forum) for posts that might describe a real bike
 * route, and surfaces them to an admin for manual review. It never creates
 * or edits routes itself — see grabber_candidates.status and
 * src/app/admin/grabber for the review flow.
 */

export type SourceType = "telegram-preview" | "ips-forum";

export interface GrabberSource {
  id: string;
  type: SourceType;
  identifier: string;
  label: string | null;
  enabled: boolean;
  cursor: Record<string, unknown>;
}

export type LinkType =
  | "nakarte"
  | "strava"
  | "komoot"
  | "wikiloc"
  | "osm"
  | "mapmagic"
  | "gpx"
  | "forum-attachment"
  | "unknown";

export interface DetectedLink {
  url: string;
  type: LinkType;
  resolvedUrl?: string;
}

/** One unit of content fetched from a source, before filtering/extraction. */
export interface RawPost {
  permalink: string;
  text: string;
  /** Value to advance source.cursor past this post once processed. */
  cursorValue: string | number;
}

export interface CandidateDraft {
  permalink: string;
  title: string | null;
  region: string | null;
  summary: string | null;
  links: DetectedLink[];
  confidence: number;
  rawSnippet: string;
}

export interface RunSummary {
  source: string;
  fetched: number;
  filtered: number;
  llmCalls: number;
  inserted: number;
  error?: string;
}
