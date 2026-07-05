/**
 * Naming and embeddability for external route-planner links.
 *
 * A route's map can come from any planner (MapMagic, Komoot, Strava, nakarte,
 * esya.ru, …). Two facts about such a link matter to the UI:
 *
 *  1. Can we show it in an <iframe>?  Almost nobody allows it — most planners
 *     send `X-Frame-Options: DENY/SAMEORIGIN`, so an iframe renders blank. Only
 *     MapMagic ships a proper cross-origin `/embed`. For everyone else we draw
 *     the map ourselves from the uploaded GPX instead of embedding their page.
 *
 *  2. What is it called?  So the "open in …" button names the real service
 *     instead of always saying "MapMagic".
 */

/** Known planners we can name with confidence, matched by hostname. */
const PROVIDERS: Array<{ label: string; re: RegExp }> = [
  { label: "MapMagic", re: /(^|\.)mapmagic\.app$/i },
  { label: "Komoot", re: /(^|\.)komoot\.(com|de)$/i },
  { label: "Strava", re: /(^|\.)strava\.com$/i },
  { label: "nakarte", re: /(^|\.)nakarte\.me$/i },
  { label: "Wikiloc", re: /(^|\.)wikiloc\.com$/i },
  { label: "OpenStreetMap", re: /(^|\.)openstreetmap\.org$/i },
  { label: "Ridewithgps", re: /(^|\.)ridewithgps\.com$/i },
  { label: "Garmin Connect", re: /(^|\.)connect\.garmin\.com$/i },
];

/**
 * Human-readable name of the planner behind a link, for the "Открыть в …"
 * button. Falls back to the bare hostname (sans `www.`) for services we don't
 * recognise, and to null for a missing/malformed URL.
 */
export function mapProviderName(url: string | null | undefined): string | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  for (const { label, re } of PROVIDERS) {
    if (re.test(host)) return label;
  }
  return host.replace(/^www\./, "");
}

/**
 * Whether a planner link can be shown inside an <iframe>. Only MapMagic gives
 * us an embeddable view; everything else is drawn from GPX instead. Keeping
 * this an allow-list (not a block-list) means an unknown planner never
 * produces the blank-iframe bug — it just falls through to the GPX map.
 */
export function isEmbeddableMapUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return /(^|\.)mapmagic\.app$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}
