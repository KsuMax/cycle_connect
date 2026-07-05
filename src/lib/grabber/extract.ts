import { chatJSON } from "@/lib/llm/ollama-chat";
import type { CandidateDraft, DetectedLink, RawPost } from "./types";

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

export async function extractCandidate(
  post: RawPost,
  links: DetectedLink[]
): Promise<CandidateDraft | null> {
  const linksList = links.map((l) => `- ${l.url} (${l.type})`).join("\n");
  const userMessage = `Пост:\n"""\n${post.text.slice(0, 3000)}\n"""\n\nНайденные ссылки:\n${linksList}`;

  let result: Record<string, unknown>;
  try {
    result = await chatJSON(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      15_000
    );
  } catch (err) {
    console.error("[grabber/extract] chatJSON failed:", err instanceof Error ? err.message : err);
    return null;
  }

  if (result.is_route !== true) return null;

  const confidenceRaw = typeof result.confidence === "number" ? result.confidence : 0;
  const confidence = Math.max(0, Math.min(1, confidenceRaw));

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
