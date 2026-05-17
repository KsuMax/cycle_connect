#!/usr/bin/env npx tsx
/**
 * Reindex all route embeddings using the updated routeEmbeddingText()
 * that now includes poi_tags and season_months.
 *
 * Run on the VPS (where .env.local is present):
 *   npx tsx scripts/reindex-embeddings.ts
 *
 * Optional env overrides:
 *   BATCH_SIZE=30    — routes per Ollama batch (default 20)
 *   SLEEP_MS=1000    — ms between batches (default 1500)
 *   DRY_RUN=1        — print text only, no writes
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OLLAMA_URL   = (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/$/, "");
const BATCH_SIZE   = parseInt(process.env.BATCH_SIZE ?? "20", 10);
const SLEEP_MS     = parseInt(process.env.SLEEP_MS ?? "1500", 10);
const DRY_RUN      = process.env.DRY_RUN === "1";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Inline routeEmbeddingText (mirrors src/lib/embeddings/jina.ts) ───────────

const SEASON_LABEL: Record<number, string> = {
  1: "январь", 2: "февраль", 3: "март", 4: "апрель",
  5: "май", 6: "июнь", 7: "июль", 8: "август",
  9: "сентябрь", 10: "октябрь", 11: "ноябрь", 12: "декабрь",
};

function routeEmbeddingText(r: {
  title?: string | null;
  description?: string | null;
  region?: string | null;
  difficulty?: string | null;
  tags?: string[] | null;
  surface?: string[] | null;
  route_types?: string[] | null;
  distance_km?: number | null;
  elevation_m?: number | null;
  poi_tags?: string[] | null;
  season_months?: number[] | null;
}): string {
  const parts: string[] = [];
  if (r.title) parts.push(r.title);
  if (r.region) parts.push(`Регион: ${r.region}`);
  if (r.difficulty) parts.push(`Сложность: ${r.difficulty}`);
  if (r.distance_km) parts.push(`${r.distance_km} км`);
  if (r.elevation_m) parts.push(`набор ${r.elevation_m} м`);
  if (r.surface?.length) parts.push(`Покрытие: ${r.surface.join(", ")}`);
  if (r.route_types?.length) parts.push(`Тип: ${r.route_types.join(", ")}`);
  if (r.tags?.length) parts.push(`Теги: ${r.tags.join(", ")}`);
  if (r.poi_tags?.length) parts.push(`Места: ${r.poi_tags.join(", ")}`);
  if (r.season_months?.length) {
    const labels = r.season_months.map((m: number) => SEASON_LABEL[m] ?? m).join(", ");
    parts.push(`Сезон: ${labels}`);
  }
  if (r.description) parts.push(r.description);
  return parts.join(". ");
}

// ── Ollama embed ─────────────────────────────────────────────────────────────

async function ollamaEmbed(inputs: string[]): Promise<number[][]> {
  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "bge-m3", input: inputs, keep_alive: "87600h" }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const data = await res.json() as { embeddings?: number[][]; embedding?: number[] };
  return data.embeddings ?? (data.embedding ? [data.embedding] : []);
}

function toPgVector(v: number[]): string {
  return `[${v.join(",")}]`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Main ─────────────────────────────────────────────────────────────────────

const COLUMNS = "id, title, description, region, difficulty, tags, surface, route_types, distance_km, elevation_m, poi_tags, season_months";

async function main() {
  console.log(`Reindex embeddings — batch=${BATCH_SIZE} sleep=${SLEEP_MS}ms dry_run=${DRY_RUN}`);

  // Count total for progress display
  const { count } = await sb.from("routes").select("id", { count: "exact", head: true });
  console.log(`Total routes: ${count ?? "?"}`);

  let afterId = "";
  let total = 0;
  let batch = 0;

  while (true) {
    let q = sb.from("routes").select(COLUMNS).order("id").limit(BATCH_SIZE);
    if (afterId) q = q.gt("id", afterId);

    const { data, error } = await q;
    if (error) { console.error("DB error:", error.message); process.exit(1); }
    if (!data?.length) break;

    batch++;
    const texts = data.map(routeEmbeddingText);

    if (DRY_RUN) {
      console.log(`[dry] batch ${batch}: ${data.length} routes`);
      texts.slice(0, 2).forEach((t, i) => console.log(`  ${i + 1}. ${t.slice(0, 120)}…`));
    } else {
      process.stdout.write(`Batch ${batch}: embedding ${data.length} routes… `);
      const t0 = Date.now();
      const vectors = await ollamaEmbed(texts);
      const embedMs = Date.now() - t0;

      const now = new Date().toISOString();
      for (let i = 0; i < data.length; i++) {
        const { error: upErr } = await sb
          .from("routes")
          .update({ embedding: toPgVector(vectors[i]), embedding_updated_at: now })
          .eq("id", data[i].id);
        if (upErr) console.error(`  ✗ ${data[i].id}: ${upErr.message}`);
      }

      total += data.length;
      const pct = count ? Math.round((total / count) * 100) : "?";
      console.log(`done in ${embedMs}ms  (${total}/${count ?? "?"}, ${pct}%)`);
    }

    afterId = data[data.length - 1].id;
    if (data.length < BATCH_SIZE) break;
    await sleep(SLEEP_MS);
  }

  console.log(`\nDone. Total reindexed: ${DRY_RUN ? "(dry run)" : total}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
