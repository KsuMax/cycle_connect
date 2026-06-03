#!/usr/bin/env node
/**
 * Regenerate src/lib/routes/few-shot-data.ts from data/few-shot/.
 *
 * Runs as a prebuild hook so the production container always has the latest
 * few-shot examples bundled into the JS source (the standalone Docker image
 * doesn't ship the data/ folder).
 *
 * Pure Node (no tsx) so it works inside `npm run build` without extra
 * devDependencies in the build stage.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");

const ids = ["route", "route-2", "route-3"];
const srcDir = join(root, "data", "few-shot");
const out = join(root, "src", "lib", "routes", "few-shot-data.ts");

const entries = ids.map((id) => {
  const context = JSON.parse(readFileSync(join(srcDir, `${id}.context.json`), "utf-8"));
  const description = readFileSync(join(srcDir, `${id}.description.md`), "utf-8").trim();
  return { id, context, description };
});

const body = [
  "// AUTO-GENERATED from data/few-shot/. Run `npm run build:few-shot` to regenerate.",
  "// Bundled into source so the production container has the few-shot examples without runtime fs.",
  "",
  'import type { NarrativeContext } from "./narrative-context";',
  "",
  "export interface EmbeddedFewShot {",
  "  id: string;",
  "  context: NarrativeContext;",
  "  description: string;",
  "}",
  "",
  "export const EMBEDDED_FEW_SHOT: EmbeddedFewShot[] = [",
  ...entries.map(
    (e) =>
      `  { id: ${JSON.stringify(e.id)}, context: ${JSON.stringify(e.context)} as NarrativeContext, description: ${JSON.stringify(e.description)} },`,
  ),
  "];",
  "",
].join("\n");

writeFileSync(out, body);
process.stderr.write(`[build-few-shot] wrote ${out} (${entries.length} examples)\n`);
