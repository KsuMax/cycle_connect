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

  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, input: inputs }),
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

/** Embed a search query. */
export async function embedQuery(text: string): Promise<number[]> {
  const [v] = await ollamaEmbed([text]);
  return v;
}

/** Embed route documents in a single batch. */
export async function embedPassages(texts: string[]): Promise<number[][]> {
  return ollamaEmbed(texts);
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
