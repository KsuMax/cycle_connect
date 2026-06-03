#!/usr/bin/env npx tsx
/**
 * Dry-run the AI-route-description pipeline up to (but not including) the LLM
 * call: parse a GPX, analyze elevation, fetch OSM context, assemble the
 * narrative JSON, print it.
 *
 * Usage:
 *   npx tsx scripts/dry-run-narrative.ts ./path/to/route.gpx [--no-osm]
 *
 * Flags:
 *   --no-osm     Skip the Overpass call. Useful for elevation/segment debugging
 *                without network access.
 *   --buffer=N   Buffer in meters around the route for OSM lookups. Default 200.
 *   --pretty     Pretty-print JSON (default true). Use --raw for one-line.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { analyzeElevation, type ElePoint } from "../src/lib/routes/elevation-profile";
import { enrichElevation, type ElevationSource } from "../src/lib/routes/enrich-elevation";
import { fetchOsmContext } from "../src/lib/routes/osm-context";
import {
  buildNarrativeContext,
  type RawAuthorWaypoint,
} from "../src/lib/routes/narrative-context";
import { SrtmReader, type HgtResolution } from "../src/lib/routes/srtm-reader";

async function main() {
  const args = process.argv.slice(2);
  const gpxPath = args.find((a) => !a.startsWith("--"));
  if (!gpxPath) {
    console.error("Usage: npx tsx scripts/dry-run-narrative.ts <path-to-gpx> [--no-osm] [--buffer=200]");
    process.exit(1);
  }
  const skipOsm = args.includes("--no-osm");
  const pretty = !args.includes("--raw");
  const bufferArg = args.find((a) => a.startsWith("--buffer="));
  const bufferM = bufferArg ? parseInt(bufferArg.split("=")[1], 10) : 200;
  const srtmDirArg = args.find((a) => a.startsWith("--srtm-dir="));
  const srtmResArg = args.find((a) => a.startsWith("--srtm-res="));
  const srtmDir = srtmDirArg ? srtmDirArg.split("=")[1] : process.env.SRTM_TILE_DIR;
  const srtmRes = (srtmResArg ? srtmResArg.split("=")[1] : process.env.SRTM_RESOLUTION) as
    | HgtResolution
    | undefined;

  const absPath = resolve(gpxPath);
  const xml = readFileSync(absPath, "utf-8");
  const trackpoints = parseGpxTrack(xml);
  const waypoints = parseGpxWaypoints(xml);
  if (trackpoints.length < 2) {
    console.error(`GPX at ${absPath} produced ${trackpoints.length} trackpoints — aborting.`);
    process.exit(1);
  }

  log(`Parsed ${trackpoints.length} trackpoints, ${waypoints.length} author waypoints from ${absPath}`);

  // Optionally enrich missing elevations from a local SRTM tile directory.
  let pointsForAnalysis = trackpoints;
  let elevationSource: ElevationSource = "none";
  if (srtmDir) {
    const reader = new SrtmReader({ tileDir: srtmDir, resolution: srtmRes ?? "srtm1" });
    const enriched = await enrichElevation(trackpoints, { reader });
    pointsForAnalysis = enriched.points;
    elevationSource = enriched.source;
    log(
      `SRTM enrich: source=${enriched.source} filled=${enriched.filledCount}/${enriched.totalCount} from ${srtmDir} (${srtmRes ?? "srtm1"})`
    );
  } else {
    const hasAnyGpxEle = trackpoints.some((p) => typeof p.ele === "number");
    elevationSource = hasAnyGpxEle ? "gpx" : "none";
  }

  const elevation = analyzeElevation(pointsForAnalysis);
  log(
    `Elevation: hasEle=${elevation.hasElevation} source=${elevationSource} gain=${elevation.totalGainM}m loss=${elevation.totalLossM}m profile=${elevation.profile} climbs=${elevation.climbs.length}`
  );

  let osmFeatures: Awaited<ReturnType<typeof fetchOsmContext>>["features"] = [];
  if (!skipOsm) {
    log(`Fetching OSM context (buffer=${bufferM}m)…`);
    try {
      const osm = await fetchOsmContext(trackpoints, {
        bufferM,
        onAttempt: (info) =>
          log(
            `  Overpass ${info.endpoint}: ${info.ok ? "ok" : "fail"} in ${info.ms}ms${info.status ? ` (HTTP ${info.status})` : ""}${info.error ? ` — ${info.error}` : ""}`
          ),
      });
      osmFeatures = osm.features;
      log(
        `OSM: ${osm.features.length} features from ${osm.endpoint} in ${osm.durationMs}ms (${(osm.responseBytes / 1024).toFixed(1)} KB)`
      );
    } catch (err) {
      console.error(`OSM fetch failed: ${err instanceof Error ? err.message : String(err)}`);
      console.error(`Continuing without OSM context.`);
    }
  } else {
    log("Skipping OSM context (--no-osm).");
  }

  const ctx = buildNarrativeContext({
    trackpoints: pointsForAnalysis,
    elevation,
    osmFeatures,
    authorWaypoints: waypoints,
    elevationSource,
  });

  log(
    `Context: ${ctx.segments.length} segments, ${ctx.settlementsAlongRoute.length} settlements, ${ctx.namedWaterways.length} waterways, ${ctx.authorWaypoints.length} author waypoints, warnings=[${ctx.warnings.join(", ")}]`
  );

  const out = pretty ? JSON.stringify(ctx, null, 2) : JSON.stringify(ctx);
  process.stdout.write(out + "\n");
}

function log(msg: string) {
  process.stderr.write(`[dry-run] ${msg}\n`);
}

/**
 * Parse the track (<trkpt>, falling back to <rtept>). Author markers come from
 * <wpt> and are extracted separately by parseGpxWaypoints.
 */
function parseGpxTrack(xml: string): ElePoint[] {
  let chosenTag: "trkpt" | "rtept" = "trkpt";
  if (!/<trkpt\b/i.test(xml) && /<rtept\b/i.test(xml)) chosenTag = "rtept";
  return collectElements(xml, chosenTag, (attrs, inner) => makePoint(attrs, inner));
}

/** Parse all <wpt> author markers with name/type/desc. */
function parseGpxWaypoints(xml: string): RawAuthorWaypoint[] {
  return collectElements(xml, "wpt", (attrs, inner) => {
    const lat = parseFloat(attrs.match(/\blat\s*=\s*"([^"]+)"/i)?.[1] ?? "");
    const lng = parseFloat(attrs.match(/\blon\s*=\s*"([^"]+)"/i)?.[1] ?? "");
    if (!isFinite(lat) || !isFinite(lng)) return null;
    const name = decodeXml(inner.match(/<name\b[^>]*>([\s\S]*?)<\/name>/i)?.[1]);
    const rawType = decodeXml(inner.match(/<type\b[^>]*>([\s\S]*?)<\/type>/i)?.[1]);
    const description = decodeXml(inner.match(/<desc\b[^>]*>([\s\S]*?)<\/desc>/i)?.[1]);
    return { lat, lng, name, rawType, description };
  });
}

function collectElements<T>(
  xml: string,
  tag: string,
  build: (attrs: string, inner: string) => T | null
): T[] {
  const pairedRe = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const selfRe = new RegExp(`<${tag}\\b([^/>]*)/>`, "gi");
  const ordered: Array<{ idx: number; value: T }> = [];
  for (const match of xml.matchAll(pairedRe)) {
    const v = build(match[1], match[2]);
    if (v != null) ordered.push({ idx: match.index ?? 0, value: v });
  }
  for (const match of xml.matchAll(selfRe)) {
    const v = build(match[1], "");
    if (v != null) ordered.push({ idx: match.index ?? 0, value: v });
  }
  ordered.sort((a, b) => a.idx - b.idx);
  return ordered.map((o) => o.value);
}

function makePoint(attrs: string, inner: string): ElePoint | null {
  const lat = parseFloat(attrs.match(/\blat\s*=\s*"([^"]+)"/i)?.[1] ?? "");
  const lng = parseFloat(attrs.match(/\blon\s*=\s*"([^"]+)"/i)?.[1] ?? "");
  if (!isFinite(lat) || !isFinite(lng)) return null;
  const eleStr = inner.match(/<ele\b[^>]*>([^<]+)<\/ele>/i)?.[1];
  const ele = eleStr !== undefined ? parseFloat(eleStr) : undefined;
  return {
    lat,
    lng,
    ele: ele !== undefined && isFinite(ele) ? ele : undefined,
  };
}

function decodeXml(s: string | undefined): string | undefined {
  if (s === undefined) return undefined;
  const trimmed = s.trim();
  if (!trimmed) return undefined;
  return trimmed
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
