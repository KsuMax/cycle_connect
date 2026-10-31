/** Embedding helper — Ollama bge-m3 by default, or Gemini when opted in. */

import { proxiedFetch } from "@/lib/net/proxied-fetch";

const OLLAMA_URL = (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/$/, "");
const MODEL = "bge-m3";
const EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER === "gemini" ? "gemini" : "ollama";
const GEMINI_MODEL = process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-2";
const GEMINI_TIMEOUT_MS = Math.max(1, Number.parseInt(process.env.GEMINI_EMBEDDING_TIMEOUT_MS ?? "15000", 10) || 15_000);
const EMBEDDING_DIMENSIONS = 1024;

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

function normalizeGeminiVector(values: unknown): number[] {
  if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Gemini embedding must contain ${EMBEDDING_DIMENSIONS} dimensions`);
  }
  if (!values.every((value) => typeof value === "number" && Number.isFinite(value))) {
    throw new Error("Gemini embedding contains invalid values");
  }

  const vector = values as number[];
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || norm === 0) throw new Error("Gemini embedding has zero norm");
  return vector.map((value) => value / norm);
}

async function geminiEmbedOne(text: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is required when EMBEDDING_PROVIDER=gemini");

  let res;
  try {
    res = await proxiedFetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:embedContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        timeoutMs: GEMINI_TIMEOUT_MS,
        body: JSON.stringify({
          content: { parts: [{ text }] },
          outputDimensionality: EMBEDDING_DIMENSIONS,
        }),
      },
    );
  } catch {
    throw new Error("Gemini embedding request failed");
  }

  if (!res.ok) throw new Error(`Gemini embedding HTTP ${res.status}`);

  let data: { embedding?: { values?: unknown } };
  try {
    data = JSON.parse(await res.text()) as { embedding?: { values?: unknown } };
  } catch {
    throw new Error("Gemini returned invalid embedding data");
  }
  return normalizeGeminiVector(data.embedding?.values);
}

/** Gemini exposes one text per request; limit document batches to two requests at once. */
async function geminiEmbed(inputs: string[]): Promise<number[][]> {
  const out = new Array<number[]>(inputs.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(2, inputs.length) }, async () => {
    while (nextIndex < inputs.length) {
      const index = nextIndex++;
      out[index] = await geminiEmbedOne(inputs[index]);
    }
  });
  await Promise.all(workers);
  return out;
}

async function embedTexts(inputs: string[]): Promise<number[][]> {
  if (!inputs.length) return [];
  return EMBEDDING_PROVIDER === "gemini" ? geminiEmbed(inputs) : ollamaEmbed(inputs);
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
  const p = embedTexts([text]).then(([v]) => v);
  QUERY_CACHE.set(key, { p, expires: now + QUERY_CACHE_TTL_MS });
  // Remove on failure so retries get a fresh attempt
  p.catch(() => QUERY_CACHE.delete(key));
  return p;
}

/** Embed route documents in a single batch. */
export async function embedPassages(texts: string[]): Promise<number[][]> {
  return embedTexts(texts);
}

/**
 * Fire-and-forget warm-up: loads bge-m3 into memory so the first real query is
 * fast. Pairs with `keep_alive: "24h"` to keep it resident. Called at server
 * boot via instrumentation.ts and again when the AI search widget opens.
 */
export function warmUpEmbeddings(): void {
  if (EMBEDDING_PROVIDER === "gemini") return;
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
