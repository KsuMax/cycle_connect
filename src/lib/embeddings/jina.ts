/**
 * Jina Embeddings v3 — 1024-dim multilingual vectors.
 * Docs: https://api.jina.ai/v1/embeddings
 */

const JINA_URL = "https://api.jina.ai/v1/embeddings";
const MODEL = "jina-embeddings-v3";

type JinaTask = "retrieval.query" | "retrieval.passage";

interface JinaResponse {
  data?: Array<{ embedding: number[] }>;
  detail?: string;
}

async function jinaEmbed(inputs: string[], task: JinaTask): Promise<number[][]> {
  const key = process.env.JINA_API_KEY;
  if (!key) throw new Error("JINA_API_KEY not configured");

  const res = await fetch(JINA_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, task, input: inputs }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Jina ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as JinaResponse;
  const out = data.data?.map((d) => d.embedding) ?? [];
  if (out.length !== inputs.length) {
    throw new Error(`Jina returned ${out.length} embeddings for ${inputs.length} inputs`);
  }
  return out;
}

/** Embed a search query (asymmetric retrieval task). */
export async function embedQuery(text: string): Promise<number[]> {
  const [v] = await jinaEmbed([text], "retrieval.query");
  return v;
}

/** Embed route documents in a single batch. */
export async function embedPassages(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  return jinaEmbed(texts, "retrieval.passage");
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
