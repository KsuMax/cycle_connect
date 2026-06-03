/**
 * High-level generator: GPX bytes + author identity → final draft description.
 *
 * Used by the /api/routes/generate-description endpoint. Kept separate so the
 * pipeline can be unit-tested without the Next.js request layer.
 */

import { createHash } from "node:crypto";

import { chatText } from "../llm/ollama-chat";
import { runGuardrails, type GuardrailReport } from "./description-guardrails";
import { analyzeElevation } from "./elevation-profile";
import { enrichElevation, type ElevationSource } from "./enrich-elevation";
import { parseGpxServer } from "./gpx-parse-server";
import { cumulativeDistancesM, simplify, type LatLng } from "./geometry";
import {
  buildNarrativeContext,
  type NarrativeContext,
} from "./narrative-context";
import { fetchOsmContext, type OsmFeature } from "./osm-context";
import { buildDescriptionPrompt, loadFewShotExamples } from "./prompt-builder";
import { SrtmReader, type HgtResolution } from "./srtm-reader";

export interface GenerateOptions {
  gpxXml: string;
  language?: "ru";
  /** Override the generator model (default: chain decides). */
  models?: string[];
  /** Caller-provided cache hooks. Both lookup and store are optional. */
  cache?: {
    getOsm?: (geometryHash: string) => Promise<OsmFeature[] | null>;
    putOsm?: (geometryHash: string, features: OsmFeature[], endpoint: string) => Promise<void>;
  };
  /** Local SRTM directory. Defaults to env SRTM_TILE_DIR. */
  srtmDir?: string;
  /** Repo root for few-shot examples. Defaults to env REPO_ROOT or cwd. */
  repoRoot?: string;
  /** Existing draft for polish mode. */
  existingDraft?: string;
}

export interface GenerateResult {
  description: string;
  context: NarrativeContext;
  geometryHash: string;
  model: string;
  provider: string;
  llmDurationMs: number;
  totalDurationMs: number;
  guardrails: GuardrailReport;
  sources: {
    elevation: ElevationSource;
    osmFromCache: boolean;
    osmEndpoint?: string;
    osmFeatureCount: number;
    srtmFilled: number;
    srtmTotal: number;
  };
}

/**
 * Run the full pipeline: GPX → CONTEXT → LLM → guarded draft.
 */
export async function generateRouteDescription(opts: GenerateOptions): Promise<GenerateResult> {
  const t0 = Date.now();
  const language = opts.language ?? "ru";
  const repoRoot = opts.repoRoot ?? process.env.REPO_ROOT ?? process.cwd();
  const srtmDir = opts.srtmDir ?? process.env.SRTM_TILE_DIR ?? undefined;
  const srtmRes = (process.env.SRTM_RESOLUTION as HgtResolution | undefined) ?? "srtm1";

  // ── Parse GPX ────────────────────────────────────────────────────────────
  const { trackpoints, authorWaypoints } = parseGpxServer(opts.gpxXml);
  if (trackpoints.length < 2) {
    throw new Error(`GPX produced only ${trackpoints.length} trackpoints`);
  }

  // ── Elevation: enrich from SRTM if available, then analyze ───────────────
  let pointsForAnalysis = trackpoints;
  let elevationSource: ElevationSource = "none";
  let srtmFilled = 0;
  if (srtmDir) {
    const reader = new SrtmReader({ tileDir: srtmDir, resolution: srtmRes });
    const enriched = await enrichElevation(trackpoints, { reader });
    pointsForAnalysis = enriched.points;
    elevationSource = enriched.source;
    srtmFilled = enriched.filledCount;
  } else {
    elevationSource = trackpoints.some((p) => typeof p.ele === "number") ? "gpx" : "none";
  }
  const elevation = analyzeElevation(pointsForAnalysis);

  // ── OSM context (with cache) ─────────────────────────────────────────────
  const simplifiedForHash = simplify(
    pointsForAnalysis.map<LatLng>((p) => ({ lat: p.lat, lng: p.lng })),
    50
  );
  const geometryHash = hashGeometry(simplifiedForHash);

  let osmFeatures: OsmFeature[] = [];
  let osmFromCache = false;
  let osmEndpoint: string | undefined;

  if (opts.cache?.getOsm) {
    const cached = await opts.cache.getOsm(geometryHash);
    if (cached) {
      osmFeatures = cached;
      osmFromCache = true;
    }
  }
  if (!osmFromCache) {
    try {
      const osm = await fetchOsmContext(pointsForAnalysis);
      osmFeatures = osm.features;
      osmEndpoint = osm.endpoint;
      if (opts.cache?.putOsm && osmFeatures.length > 0) {
        await opts.cache.putOsm(geometryHash, osmFeatures, osmEndpoint);
      }
    } catch (err) {
      // OSM is non-fatal — proceed with author waypoints + elevation only.
      // The LLM will produce a sparser description but won't hallucinate.
      console.warn("[generate-description] OSM fetch failed:", err instanceof Error ? err.message : err);
    }
  }

  // ── Build narrative CONTEXT ──────────────────────────────────────────────
  const context = buildNarrativeContext({
    trackpoints: pointsForAnalysis,
    elevation,
    osmFeatures,
    authorWaypoints,
    elevationSource,
    language,
  });

  // ── LLM ──────────────────────────────────────────────────────────────────
  const examples = loadFewShotExamples(repoRoot);
  const messages = buildDescriptionPrompt({
    context,
    examples,
    existingDraft: opts.existingDraft,
  });
  const llm = await chatText(messages, {
    models: opts.models,
    skipOllama: true, // local 3B model can't write coherent RU prose
    timeoutMs: 60_000,
    maxTokens: 900,
    temperature: 0.3,
  });

  // ── Guardrails ───────────────────────────────────────────────────────────
  const guardrails = runGuardrails(llm.text, context);

  return {
    description: llm.text,
    context,
    geometryHash,
    model: llm.model,
    provider: llm.provider,
    llmDurationMs: llm.durationMs,
    totalDurationMs: Date.now() - t0,
    guardrails,
    sources: {
      elevation: elevationSource,
      osmFromCache,
      osmEndpoint,
      osmFeatureCount: osmFeatures.length,
      srtmFilled,
      srtmTotal: trackpoints.length,
    },
  };
}

/**
 * Stable hash of the simplified route geometry. Used as a cache key so two
 * physically identical tracks share the same OSM lookup.
 */
function hashGeometry(points: LatLng[]): string {
  const cumM = cumulativeDistancesM(points);
  const totalKm = (cumM[cumM.length - 1] / 1000).toFixed(1);
  const coords = points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join("|");
  return createHash("sha1").update(`${totalKm}|${coords}`).digest("hex");
}
