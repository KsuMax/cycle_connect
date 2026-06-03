/**
 * Fill missing trackpoint elevations from a DEM (SRTM HGT tiles).
 *
 * The pipeline calls this BEFORE analyzeElevation so the climb detector has
 * a complete profile to work with. We never overwrite GPX-supplied elevations
 * — only fill in undefined slots — unless `mode: "replace-all"` is set.
 */

import type { ElePoint } from "./elevation-profile";
import type { SrtmReader } from "./srtm-reader";

export type ElevationSource = "gpx" | "srtm" | "mixed" | "none";

export interface EnrichElevationOptions {
  reader: SrtmReader;
  /** "fill" (default): only replace missing values. "replace-all": ignore GPX elevations entirely. */
  mode?: "fill" | "replace-all";
}

export interface EnrichElevationResult {
  points: ElePoint[];
  source: ElevationSource;
  filledCount: number;
  totalCount: number;
}

export async function enrichElevation(
  points: ElePoint[],
  opts: EnrichElevationOptions
): Promise<EnrichElevationResult> {
  if (points.length === 0) {
    return { points, source: "none", filledCount: 0, totalCount: 0 };
  }

  const mode = opts.mode ?? "fill";
  const originalHadEle = points.some((p) => typeof p.ele === "number" && isFinite(p.ele));

  const out: ElePoint[] = new Array(points.length);
  let filled = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const hasEle = typeof p.ele === "number" && isFinite(p.ele);
    if (mode === "fill" && hasEle) {
      out[i] = p;
      continue;
    }
    const z = await opts.reader.getElevation(p.lat, p.lng);
    if (z !== null && isFinite(z)) {
      out[i] = { ...p, ele: z };
      filled++;
    } else {
      out[i] = p; // leave unset; analyzeElevation will interpolate
    }
  }

  let source: ElevationSource;
  if (filled === 0) source = originalHadEle ? "gpx" : "none";
  else if (mode === "replace-all" || !originalHadEle) source = "srtm";
  else source = "mixed";

  return { points: out, source, filledCount: filled, totalCount: points.length };
}
