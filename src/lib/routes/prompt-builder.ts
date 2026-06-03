/**
 * Build the chat prompt for AI route descriptions.
 *
 * Strategy: a small set of hand-written few-shot examples teaches the model
 * the exact mapping from `NarrativeContext` JSON → guidebook prose. The
 * reference pairs live in `data/few-shot/*` and are loaded once at startup.
 *
 * Style rules are mirrored in `data/few-shot/README.md` and also enforced
 * after generation by `description-guardrails.ts`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { ChatMessage } from "../llm/ollama-chat";
import type { NarrativeContext } from "./narrative-context";

export interface FewShotExample {
  id: string;
  context: NarrativeContext;
  description: string;
}

export interface BuildPromptInput {
  context: NarrativeContext;
  examples: FewShotExample[];
  /** Optional draft author already wrote — model will polish rather than start fresh. */
  existingDraft?: string;
}

const SYSTEM_PROMPT_RU = `Ты пишешь практичные описания велосипедных маршрутов для российского сайта.
На вход получаешь CONTEXT — структурированный JSON, собранный из GPX, OpenStreetMap и пользовательских меток.
На выход — связный текст на русском, который полезен велосипедисту-путешественнику.

Жёсткие правила:
1. Упоминай ТОЛЬКО те объекты, имена и факты, которые явно перечислены в CONTEXT.
   Не выдумывай названия деревень, дат, исторических фактов, регионов.
   Если CONTEXT не содержит названия населённого пункта или региона — не упоминай его.
2. Если CONTEXT тонкий — пиши коротко (около 100 слов). Не наполняй текст домыслами ради объёма.
3. Тон безличный. Не используй фразы «автор отметил», «по словам того, кто проехал».
   Пиши так, будто маршрут уже описан сам собой: «по маршруту встречается», «в районе X сохранились».
4. 2-е лицо, настоящее время: «пересекаешь», «выходишь к озеру», «готовь лёгкую передачу».
5. Никаких маркетинговых эпитетов: «захватывающий», «незабываемый», «потрясающие виды» — запрещены.
6. Рельеф описывай обобщённо. Конкретные километры упоминай ТОЛЬКО для:
   — резких или коротких подъёмов с пиковой крутизной 8% и выше,
   — главных достопримечательностей и опасностей,
   — длинных пустых интервалов между точками питания.
7. Структура: 2–3 абзаца, всего 150–250 слов.
   Абзац 1: где, длина, общий характер рельефа (одна-две фразы); резкие подъёмы — пометить.
   Абзац 2: достопримечательности, виды, история — по смыслу, не по километрам.
   Абзац 3: практика — магазины, кафе, источники воды, опасные участки.
8. Магазины, кафе и источники воды — обязательно упомяни, есть они или нет.
   Если их нет в CONTEXT — прямо так и напиши: «кафе по маршруту не отмечены».
9. Имена собственных пиши в точности как в CONTEXT (включая ё/е, дефисы, регистр).
10. Не используй маркетинг, не давай оценок «лучший», «самый красивый» — кроме случаев, когда это явная характеристика из CONTEXT.

Отвечай только текстом описания. Без преамбул вида «Вот описание маршрута:».`;

/**
 * Load all CONTEXT → DESCRIPTION pairs from data/few-shot/. Pure I/O — call
 * once at startup or behind a cache.
 */
export function loadFewShotExamples(repoRoot: string): FewShotExample[] {
  const dir = join(repoRoot, "data", "few-shot");
  const ids = ["route", "route-2", "route-3"];
  return ids.map((id) => {
    const context = JSON.parse(readFileSync(join(dir, `${id}.context.json`), "utf-8")) as NarrativeContext;
    const description = readFileSync(join(dir, `${id}.description.md`), "utf-8").trim();
    return { id, context, description };
  });
}

/**
 * Assemble the messages array for the LLM. Uses few-shot teaching:
 * each example is a (user → assistant) pair, then the real CONTEXT goes
 * as the final user message.
 */
export function buildDescriptionPrompt(input: BuildPromptInput): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT_RU }];

  for (const ex of input.examples) {
    messages.push({ role: "user", content: formatUserMessage(ex.context) });
    messages.push({ role: "assistant", content: ex.description });
  }

  const finalInstruction = input.existingDraft
    ? `${formatUserMessage(input.context)}\n\nТЕКУЩИЙ ЧЕРНОВИК (отредактируй, не переписывай полностью):\n${input.existingDraft}`
    : formatUserMessage(input.context);

  messages.push({ role: "user", content: finalInstruction });
  return messages;
}

function formatUserMessage(ctx: NarrativeContext): string {
  // We pass the CONTEXT as compact JSON so token usage stays low and the
  // model treats it as structured data, not prose.
  return `CONTEXT:\n${JSON.stringify(ctx)}`;
}

/**
 * Whitelist of proper nouns that the description is allowed to mention,
 * derived from CONTEXT. Caller uses this for post-generation guardrails.
 */
export function buildAllowedNames(ctx: NarrativeContext): Set<string> {
  const names = new Set<string>();
  for (const s of ctx.settlementsAlongRoute) names.add(s.name);
  for (const w of ctx.namedWaterways) names.add(w.name);
  for (const w of ctx.authorWaypoints) if (w.name) names.add(w.name);
  for (const seg of ctx.segments) {
    for (const f of seg.namedFeatures) names.add(f.name);
  }
  for (const cat of ["waterSources", "cafesAndFood", "shelters"] as const) {
    for (const a of ctx.amenities[cat]) names.add(a.name);
  }
  return names;
}
