/**
 * Embedding helper — Ollama bge-m3 (1024-dim, multilingual incl. Russian).
 *
 * Requires Ollama running on the same host with bge-m3 pulled:
 *   curl -fsSL https://ollama.com/install.sh | sh
 *   ollama pull bge-m3
 *
 * Env vars:
 *   OLLAMA_URL  — base URL (default: http://localhost:11434)
 */

const OLLAMA_URL = (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/$/, "");
const MODEL = "bge-m3";

interface OllamaEmbedResponse {
  embeddings?: number[][];
  /** legacy single-embedding field */
  embedding?: number[];
  error?: string;
}

async function ollamaEmbed(inputs: string[]): Promise<number[][]> {
  if (!inputs.length) return [];

  // keep_alive: "24h" prevents Ollama from unloading bge-m3 after the default
  // 5-minute idle window. Without it, the first search after a quiet period
  // pays a 3–15s model-reload cost.
  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, input: inputs, keep_alive: "24h" }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ollama ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as OllamaEmbedResponse;
  if (data.error) throw new Error(`Ollama error: ${data.error}`);

  const out = data.embeddings ?? (data.embedding ? [data.embedding] : []);
  if (out.length !== inputs.length) {
    throw new Error(`Ollama returned ${out.length} embeddings for ${inputs.length} inputs`);
  }
  return out;
}

// In-process LRU cache for query embeddings. Repeats and chip-refinements re-use
// the same `query` string, so we save a network round-trip and a model call.
const QUERY_CACHE = new Map<string, { v: number[]; expires: number }>();
const QUERY_CACHE_TTL_MS = 60 * 60 * 1000;
const QUERY_CACHE_MAX = 200;

/** Embed a search query. */
export async function embedQuery(text: string): Promise<number[]> {
  const key = text.trim().toLowerCase();
  const now = Date.now();
  const hit = QUERY_CACHE.get(key);
  if (hit && hit.expires > now) {
    // Touch: move to most-recently-used by reinserting.
    QUERY_CACHE.delete(key);
    QUERY_CACHE.set(key, hit);
    return hit.v;
  }
  const [v] = await ollamaEmbed([text]);
  if (QUERY_CACHE.size >= QUERY_CACHE_MAX) {
    const oldest = QUERY_CACHE.keys().next().value;
    if (oldest !== undefined) QUERY_CACHE.delete(oldest);
  }
  QUERY_CACHE.set(key, { v, expires: now + QUERY_CACHE_TTL_MS });
  return v;
}

/** Embed route documents in a single batch. */
export async function embedPassages(texts: string[]): Promise<number[][]> {
  return ollamaEmbed(texts);
}

/**
 * Fire-and-forget warm-up: loads bge-m3 into memory so the first real query is
 * fast. Pairs with `keep_alive: "24h"` to keep it resident. Called at server
 * boot via instrumentation.ts and again when the AI search widget opens.
 */
export function warmUpEmbeddings(): void {
  ollamaEmbed(["warmup"])
    .then(() => console.log(`[embeddings] warm-up ok: ${MODEL} loaded`))
    .catch((err) =>
      console.warn("[embeddings] warm-up failed (non-fatal):", err instanceof Error ? err.message : String(err)),
    );
}

/** Build the canonical embedding text for a route row. */
export function routeEmbeddingText(r: {
  title?: string | null;
  description?: string | null;
  region?: string | null;
  difficulty?: string | null;
  tags?: string[] | null;
  surface?: string[] | null;
  route_types?: string[] | null;
  bike_types?: string[] | null;
  distance_km?: number | null;
  elevation_m?: number | null;
}): string {
  const parts: string[] = [];
  if (r.title) parts.push(r.title);
  if (r.region) parts.push(`Регион: ${r.region}`);
  if (r.difficulty) parts.push(`Сложность: ${r.difficulty}`);
  if (r.distance_km) parts.push(`${r.distance_km} км`);
  if (r.elevation_m) parts.push(`набор ${r.elevation_m} м`);
  if (r.surface?.length) parts.push(`Покрытие: ${r.surface.join(", ")}`);
  if (r.route_types?.length) parts.push(`Тип: ${r.route_types.join(", ")}`);
  if (r.bike_types?.length) parts.push(`Велосипед: ${r.bike_types.join(", ")}`);
  if (r.tags?.length) parts.push(`Теги: ${r.tags.join(", ")}`);
  if (r.description) parts.push(r.description);
  return parts.join(". ");
}

/** Postgres array literal for a vector column: '[0.1,0.2,...]' */
export function toPgVector(v: number[]): string {
  return `[${v.join(",")}]`;
}
