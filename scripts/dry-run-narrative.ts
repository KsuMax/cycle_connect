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

import { analyzeElevation } from "../src/lib/routes/elevation-profile";
import { enrichElevation, type ElevationSource } from "../src/lib/routes/enrich-elevation";
import { parseGpxServer } from "../src/lib/routes/gpx-parse-server";
import { fetchOsmContext } from "../src/lib/routes/osm-context";
import { buildNarrativeContext } from "../src/lib/routes/narrative-context";
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
  const { trackpoints, authorWaypoints: waypoints } = parseGpxServer(xml);
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
