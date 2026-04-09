/**
 * MapTiler Static Maps URL builder.
 *
 * Strava activities give us a Google-encoded summary polyline. MapTiler's
 * Static Maps API accepts that format directly via the `path` segment using
 * the `enc:` prefix, so we don't need to decode points client-side at all
 * for the common case (rendering a thumbnail next to an activity row).
 *
 * Docs: https://docs.maptiler.com/cloud/api/static-maps/
 *
 * URL shape:
 *   /maps/{style}/static/path-{width}+{color}({pathSpec})/{auto|center}/{w}x{h}.{fmt}?key=...
 *
 * Where pathSpec is `enc:<encoded polyline>` for Google polylines, and the
 * special `auto` center fits the bounds to the path.
 *
 * Notes:
 * - We URL-encode the encoded polyline because Google polylines contain
 *   characters like `\`, `~`, `?` and `|` that have special meaning in URLs.
 * - The MapTiler key MUST be exposed via NEXT_PUBLIC_MAPTILER_KEY (it's a
 *   public, domain-restricted key — restrict origins in MapTiler dashboard).
 */

const STYLE = "outdoor-v2";
const STROKE_HEX = "fc4c02"; // Strava brand orange (no leading #)
const STROKE_WIDTH = 4;

export interface StaticMapOptions {
  width: number;
  height: number;
  /** Optional retina (@2x). MapTiler returns the same URL, charged once. */
  retina?: boolean;
}

/**
 * Returns null if there's no polyline (e.g. manual activities, indoor
 * trainer rides) or if the MapTiler key is not configured. Callers should
 * fall back to a placeholder.
 */
export function buildStravaStaticMapUrl(
  summaryPolyline: string | null | undefined,
  options: StaticMapOptions,
): string | null {
  if (!summaryPolyline) return null;

  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  if (!key) return null;

  const { width, height, retina = false } = options;

  // Google polyline → URL-safe segment. encodeURIComponent handles all
  // the tricky escapes (`\`, `~`, `?`, `|`, `#`).
  const pathSpec = `enc:${encodeURIComponent(summaryPolyline)}`;

  const size = retina
    ? `${width}x${height}@2x.png`
    : `${width}x${height}.png`;

  return (
    `https://api.maptiler.com/maps/${STYLE}/static/` +
    `path-${STROKE_WIDTH}+${STROKE_HEX}(${pathSpec})/` +
    `auto/${size}?key=${key}&padding=24`
  );
}
