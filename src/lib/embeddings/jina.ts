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

const EMBED_TIMEOUT_MS = 4_000;

async function ollamaEmbed(inputs: string[]): Promise<number[][]> {
  if (!inputs.length) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);

  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: controller.signal,
    body: JSON.stringify({ model: MODEL, input: inputs, keep_alive: "87600h" }),
  }).finally(() => clearTimeout(timer));

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

// In-process LRU cache: stores Promises so concurrent calls for the same query
// share one in-flight Ollama request (deduplication, not just result caching).
// Calling embedQuery() early in the SSE handler means the second call inside
// runMatchRoutes() awaits the same promise — no duplicate Ollama requests.
const QUERY_CACHE = new Map<string, { p: Promise<number[]>; expires: number }>();
const QUERY_CACHE_TTL_MS = 60 * 60 * 1000;
const QUERY_CACHE_MAX = 200;

/** Embed a search query. */
export async function embedQuery(text: string): Promise<number[]> {
  const key = text.trim().toLowerCase();
  const now = Date.now();
  const hit = QUERY_CACHE.get(key);
  if (hit && hit.expires > now) {
    QUERY_CACHE.delete(key);
    QUERY_CACHE.set(key, hit); // LRU touch
    return hit.p;
  }
  if (QUERY_CACHE.size >= QUERY_CACHE_MAX) {
    const oldest = QUERY_CACHE.keys().next().value;
    if (oldest !== undefined) QUERY_CACHE.delete(oldest);
  }
  const p = ollamaEmbed([text]).then(([v]) => v);
  QUERY_CACHE.set(key, { p, expires: now + QUERY_CACHE_TTL_MS });
  // Remove on failure so retries get a fresh attempt
  p.catch(() => QUERY_CACHE.delete(key));
  return p;
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
const SEASON_LABEL: Record<number, string> = {
  1: "январь", 2: "февраль", 3: "март", 4: "апрель",
  5: "май", 6: "июнь", 7: "июль", 8: "август",
  9: "сентябрь", 10: "октябрь", 11: "ноябрь", 12: "декабрь",
};

export function routeEmbeddingText(r: {
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
  duration_days?: number | null;
}): string {
  const parts: string[] = [];
  if (r.title) parts.push(r.title);
  if (r.region) parts.push(`Регион: ${r.region}`);
  if (r.difficulty) parts.push(`Сложность: ${r.difficulty}`);
  if (r.duration_days) parts.push(`Многодневный маршрут на ${r.duration_days} дн.`);
  if (r.distance_km) parts.push(`${r.distance_km} км`);
  if (r.elevation_m) parts.push(`набор ${r.elevation_m} м`);
  if (r.surface?.length) parts.push(`Покрытие: ${r.surface.join(", ")}`);
  if (r.route_types?.length) parts.push(`Тип: ${r.route_types.join(", ")}`);
  if (r.tags?.length) parts.push(`Теги: ${r.tags.join(", ")}`);
  if (r.poi_tags?.length) parts.push(`Места: ${r.poi_tags.join(", ")}`);
  if (r.season_months?.length) {
    const labels = r.season_months.map((m) => SEASON_LABEL[m] ?? m).join(", ");
    parts.push(`Сезон: ${labels}`);
  }
  if (r.description) parts.push(r.description);
  return parts.join(". ");
}

/** Postgres array literal for a vector column: '[0.1,0.2,...]' */
export function toPgVector(v: number[]): string {
  return `[${v.join(",")}]`;
}
