#!/usr/bin/env npx tsx
/**
 * Reindex all route embeddings using the updated routeEmbeddingText()
 * that now includes poi_tags and season_months.
 *
 * Run on the VPS (where .env.local is present):
 *   npx tsx scripts/reindex-embeddings.ts
 *
 * Optional env overrides:
 *   BATCH_SIZE=30    — routes per embedding batch (default 20)
 *   SLEEP_MS=1000    — ms between batches (default 1500)
 *   DRY_RUN=1        — print text only, no writes
 *   EMBEDDING_PROVIDER=gemini — use Gemini instead of the default Ollama
 */

import { createClient } from "@supabase/supabase-js";
import { embedPassages, routeEmbeddingText, toPgVector } from "../src/lib/embeddings/jina";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BATCH_SIZE   = parseInt(process.env.BATCH_SIZE ?? "20", 10);
const SLEEP_MS     = parseInt(process.env.SLEEP_MS ?? "1500", 10);
const DRY_RUN      = process.env.DRY_RUN === "1";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Main ─────────────────────────────────────────────────────────────────────

const COLUMNS = "id, title, description, region, difficulty, tags, surface, route_types, distance_km, elevation_m, poi_tags, season_months, duration_days";

async function main() {
  const provider = process.env.EMBEDDING_PROVIDER === "gemini" ? "gemini" : "ollama";
  console.log(`Reindex embeddings — provider=${provider} batch=${BATCH_SIZE} sleep=${SLEEP_MS}ms dry_run=${DRY_RUN}`);

  // Count total for progress display
  const { count, error: countError } = await sb.from("routes").select("id", { count: "exact", head: true });
  if (countError) throw new Error(`DB count failed: ${countError.message}`);
  console.log(`Total routes: ${count ?? "?"}`);

  let afterId = "";
  let batch = 0;
  const staged: Array<{ id: string; vector: number[] }> = [];

  while (true) {
    let q = sb.from("routes").select(COLUMNS).order("id").limit(BATCH_SIZE);
    if (afterId) q = q.gt("id", afterId);

    const { data, error } = await q;
    if (error) throw new Error(`DB read failed: ${error.message}`);
    if (!data?.length) break;

    batch++;
    const texts = data.map(routeEmbeddingText);

    if (DRY_RUN) {
      console.log(`[dry] batch ${batch}: ${data.length} routes`);
      texts.slice(0, 2).forEach((t, i) => console.log(`  ${i + 1}. ${t.slice(0, 120)}…`));
    } else {
      process.stdout.write(`Batch ${batch}: embedding ${data.length} routes… `);
      const t0 = Date.now();
      const vectors = await embedPassages(texts);
      if (vectors.length !== data.length) throw new Error(`Embedding count mismatch in batch ${batch}`);
      const embedMs = Date.now() - t0;
      for (let i = 0; i < data.length; i++) {
        staged.push({ id: data[i].id, vector: vectors[i] });
      }

      const pct = count ? Math.round((staged.length / count) * 100) : "?";
      console.log(`staged in ${embedMs}ms  (${staged.length}/${count ?? "?"}, ${pct}%)`);
    }

    afterId = data[data.length - 1].id;
    if (data.length < BATCH_SIZE) break;
    await sleep(SLEEP_MS);
  }

  if (DRY_RUN) {
    console.log("\nDone. Dry run; no embeddings generated or written.");
    return;
  }

  console.log(`\nWriting ${staged.length} staged embeddings…`);
  const now = new Date().toISOString();
  for (let i = 0; i < staged.length; i++) {
    const { id, vector } = staged[i];
    const { error } = await sb
      .from("routes")
      .update({ embedding: toPgVector(vector), embedding_updated_at: now })
      .eq("id", id);
    if (error) throw new Error(`DB write failed for route ${id}: ${error.message}`);
    if ((i + 1) % BATCH_SIZE === 0 || i + 1 === staged.length) {
      console.log(`Written ${i + 1}/${staged.length}`);
    }
  }
  console.log(`\nDone. Total reindexed: ${staged.length}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Reindex failed");
  process.exitCode = 1;
});
