#!/usr/bin/env npx tsx
/**
 * End-to-end dry-run of the AI description pipeline INCLUDING the LLM call.
 *
 * Usage:
 *   OPENROUTER_API_KEY=... npx tsx scripts/dry-run-llm.ts ./route.gpx [--srtm-dir=/tmp/cc-srtm]
 *
 * Prints the generated description + guardrail report to stdout. Does NOT
 * touch Supabase or the OSM cache table — Overpass is hit fresh each time.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { generateRouteDescription } from "../src/lib/routes/generate-description";

async function main() {
  const args = process.argv.slice(2);
  const gpxPath = args.find((a) => !a.startsWith("--"));
  if (!gpxPath) {
    console.error("Usage: npx tsx scripts/dry-run-llm.ts <path-to-gpx> [--srtm-dir=...]");
    process.exit(1);
  }
  const srtmDirArg = args.find((a) => a.startsWith("--srtm-dir="));
  const srtmDir = srtmDirArg ? srtmDirArg.split("=")[1] : process.env.SRTM_TILE_DIR;

  const gpxXml = readFileSync(resolve(gpxPath), "utf-8");
  process.stderr.write(`[dry-run-llm] starting pipeline for ${gpxPath}\n`);

  const result = await generateRouteDescription({
    gpxXml,
    srtmDir,
    repoRoot: resolve(__dirname, ".."),
  });

  process.stderr.write(
    `[dry-run-llm] model=${result.model} provider=${result.provider} llm=${result.llmDurationMs}ms total=${result.totalDurationMs}ms\n`
  );
  process.stderr.write(
    `[dry-run-llm] guardrails: ok=${result.guardrails.ok} unknownQuoted=${JSON.stringify(result.guardrails.unknownQuoted)} unknownCap=${JSON.stringify(result.guardrails.unknownCapitalised)}\n`
  );
  process.stderr.write(
    `[dry-run-llm] sources: ${JSON.stringify(result.sources)}\n`
  );
  process.stderr.write("\n──── GENERATED DESCRIPTION ────\n");
  process.stdout.write(result.description + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
