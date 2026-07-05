import { chatJSON } from "@/lib/llm/ollama-chat";
import type { CandidateDraft, DetectedLink, RawPost } from "./types";

const MIN_CONFIDENCE = 0.3;

const SYSTEM_PROMPT = `Ты помогаешь находить посты о конкретных велосипедных маршрутах в постах из телеграм-каналов и на форумах.

Тебе дают текст поста и список ссылок, уже найденных в нём (ссылка есть точно — это не твоя задача проверять). Определи, описывает ли пост конкретную велопоездку или маршрут (место, направление, детали пути), а не общие рассуждения, рекламу товара или пустой анонс без содержания.

Верни строго JSON:
{
  "is_route": boolean,
  "confidence": число от 0 до 1,
  "title": строка или null — короткое название по смыслу поста (место/регион/направление),
  "region": строка или null — регион/область, если понятно из текста,
  "summary": строка или null — 1-2 предложения по-русски, о чём поездка
}

Не выдумывай факты, которых нет в тексте. Если не уверен — is_route: false, confidence ниже.`;

/**
 * Classify + extract one link-bearing post. Returns null only when the LLM
 * affirmatively said "not a route" (or was too unsure). If the LLM itself
 * is unavailable (chatJSON throws or returns an empty object — its
 * all-providers-failed signature), we FAIL OPEN: the post already passed
 * the founder's main filter (contains a link), so losing it forever because
 * a free-tier model timed out is the worse outcome. The cursor advances
 * past every post exactly once — there is no retry pass.
 */
export async function extractCandidate(
  post: RawPost,
  links: DetectedLink[]
): Promise<CandidateDraft | null> {
  const linksList = links.map((l) => `- ${l.url} (${l.type})`).join("\n");
  const userMessage = `Пост:\n"""\n${post.text.slice(0, 3000)}\n"""\n\nНайденные ссылки:\n${linksList}`;

  let result: Record<string, unknown> | null;
  try {
    // Generous timeout + context: this runs in a background job where
    // latency is free, and the Ollama fallback is a small CPU model that
    // needs ~30s cold. The default num_ctx=1024 silently truncates our
    // ~1300-token prompt (system + 3000 chars of post), which is worse
    // than slow — the model classifies a cut-off post.
    result = await chatJSON(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      60_000,
      4096
    );
    if (!("is_route" in result)) result = null;
  } catch (err) {
    console.error("[grabber/extract] chatJSON failed:", err instanceof Error ? err.message : err);
    result = null;
  }

  if (result === null) {
    return {
      permalink: post.permalink,
      title: null,
      region: null,
      summary: "⚠️ Не удалось классифицировать (LLM недоступен) — в посте есть ссылка, проверьте вручную.",
      links,
      confidence: 0,
      rawSnippet: post.text.slice(0, 1000),
    };
  }

  if (result.is_route !== true) return null;

  const confidenceRaw = typeof result.confidence === "number" ? result.confidence : 0;
  const confidence = Math.max(0, Math.min(1, confidenceRaw));
  if (confidence < MIN_CONFIDENCE) return null;

  return {
    permalink: post.permalink,
    title: typeof result.title === "string" ? result.title.slice(0, 200) : null,
    region: typeof result.region === "string" ? result.region.slice(0, 100) : null,
    summary: typeof result.summary === "string" ? result.summary.slice(0, 500) : null,
    links,
    confidence,
    rawSnippet: post.text.slice(0, 1000),
  };
}
