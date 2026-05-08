/**
 * LLM-based extraction of POI tags and season months from route text.
 *
 * Used by:
 *   /api/routes/metadata  — backfill and on-create enrichment
 *
 * Model: same Ollama/OpenRouter stack as ai-search (llama3.2:3b local,
 * OpenRouter fallback). Extraction is cheap: one short prompt per route.
 */

import { chatJSON } from "@/lib/llm/ollama-chat";

// ─── Taxonomy ─────────────────────────────────────────────────────────────────

/**
 * Canonical POI tag values stored in routes.poi_tags.
 * Keep in sync with:
 *   - The LLM extraction prompt below
 *   - The regex extractor in ai-search/route.ts (POI_REGEX_MAP)
 *   - The AiSearchWidget CHIPS and POI_LABELS maps
 */
export const POI_TAXONOMY = [
  "lake",
  "river",
  "sea",
  "forest",
  "viewpoint",
  "waterfall",
  "cafe",
  "water_source",
  "monastery",
  "station",
  "park",
  "beach",
  "mountain",
  "bridge",
  "field",
  "castle",
] as const;

export type PoiTag = (typeof POI_TAXONOMY)[number];

export const POI_LABELS_RU: Record<PoiTag, string> = {
  lake:         "озеро",
  river:        "река",
  sea:          "море",
  forest:       "лес",
  viewpoint:    "видовая точка",
  waterfall:    "водопад",
  cafe:         "кафе",
  water_source: "родник",
  monastery:    "монастырь",
  station:      "ж/д станция",
  park:         "парк",
  beach:        "пляж",
  mountain:     "горы",
  bridge:       "мост",
  field:        "поля",
  castle:       "замок",
};

// ─── Result type ──────────────────────────────────────────────────────────────

export interface RouteMetadata {
  poi_tags: PoiTag[];
  /** null = year-round / unknown */
  season_months: number[] | null;
}

// ─── System prompt ────────────────────────────────────────────────────────────

const EXTRACT_SYSTEM = `You are a cycling route metadata extractor for a Russian cycling community.
Given a route title, description and existing tags, return ONLY raw JSON — no markdown, no explanation.

Output schema:
{"poi_tags":["lake"|"river"|"sea"|"forest"|"viewpoint"|"waterfall"|"cafe"|"water_source"|"monastery"|"station"|"park"|"beach"|"mountain"|"bridge"|"field"|"castle"],"season_months":[1..12]|null}

Rules:
1. poi_tags — list every POI type that appears on or very near the route. Empty array if none apply.
2. season_months — months (1-12) when this route is recommended / enjoyable.
   null means year-round or not enough info.
   Examples: spring+summer → [4,5,6,7,8]; autumn → [9,10,11]; summer → [6,7,8]; winter → [12,1,2].
3. Infer from context: "цветущие луга" → spring [4,5,6]; "осенний лес" → [9,10,11]; "снег" → winter.
4. "lake" for озеро/водохранилище/пруд; "river" for река/ручей; "sea" for море/залив.
5. "viewpoint" for "красивый вид", "панорама", "смотровая", "видовой".
6. "station" when route passes an электричка/ж/д station (useful for exit points).
7. Return {} only if the description is empty or uninformative.`;

// ─── Extractor ────────────────────────────────────────────────────────────────

/**
 * Calls the LLM to extract POI tags and season months for a single route.
 * Strips HTML from description before sending.
 * Returns empty defaults on any failure — never throws.
 */
export async function extractRouteMetadata(
  title: string,
  description: string,
  tags: string[],
): Promise<RouteMetadata> {
  const cleanDesc = description
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 800); // cap to avoid huge prompts on long descriptions

  const userMsg =
    `Title: ${title}\n` +
    `Tags: ${tags.join(", ") || "none"}\n` +
    `Description: ${cleanDesc || "(empty)"}`;

  try {
    const raw = await chatJSON(
      [
        { role: "system", content: EXTRACT_SYSTEM },
        { role: "user",   content: userMsg },
      ],
      25_000, // extraction is batch/offline — tolerate cold model load (~5s) + inference
    );

    const poi_tags = Array.isArray(raw.poi_tags)
      ? (raw.poi_tags as unknown[])
          .filter((t): t is string => typeof t === "string" && (POI_TAXONOMY as readonly string[]).includes(t))
      : [];

    const season_months = Array.isArray(raw.season_months)
      ? (raw.season_months as unknown[])
          .filter((m): m is number => typeof m === "number" && m >= 1 && m <= 12)
      : null;

    return { poi_tags: poi_tags as PoiTag[], season_months };
  } catch (err) {
    console.warn(
      "[metadata/extract] LLM failed:",
      err instanceof Error ? err.message : String(err),
    );
    return { poi_tags: [], season_months: null };
  }
}
