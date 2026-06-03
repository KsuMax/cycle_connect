/**
 * Post-generation guardrails for AI route descriptions.
 *
 * The model is instructed to mention only objects present in CONTEXT, but
 * LLMs sometimes confabulate proper nouns (a wrong settlement name, an
 * imaginary monastery). We compare every proper-noun-looking token in the
 * output against a whitelist derived from CONTEXT and report mismatches.
 *
 * Caller decides what to do with the report — retry once, surface a warning
 * to the editor, or accept the draft.
 */

import { buildAllowedNames } from "./prompt-builder";
import type { NarrativeContext } from "./narrative-context";

export interface GuardrailReport {
  ok: boolean;
  /** Quoted proper nouns («…» / "…") found in the description but missing from CONTEXT. */
  unknownQuoted: string[];
  /** Capitalised standalone words found in the description but missing from CONTEXT + stop list. */
  unknownCapitalised: string[];
  /** Whitelist of allowed proper nouns (debug aid). */
  allowedCount: number;
}

/**
 * Words that look capitalised but are common nouns or season/region phrases
 * we don't want to flag. Extend as we discover false positives.
 */
const RU_STOP_NAMES = new Set([
  "Маршрут",
  "Рельеф",
  "Россия",
  "Россию",
  "Подъёмов",
  "Подъём",
  "Кафе",
  "Источников",
  "Источник",
  "Карельского",
  "Карельский",
  "Карелии",
  "Карелия",
  "Ленинградской",
  "Ленинградская",
  "Ленинградскую",
  "Финский",
  "Финская",
  "Финское",
  "Финских",
  "Финские",
  "Готовь",
  "Это",
  "Из",
  "В",
  "С",
  "На",
  "Дальше",
  "Первый",
  "Второй",
  "Третий",
  "Старт",
  "Финиш",
]);

const QUOTED_RE = /[«"]([^«»"]{2,80})[»"]/g;
const CAPITALISED_RE = /\b([А-ЯЁ][а-яё][а-яёА-ЯЁ-]*(?:\s+[А-ЯЁа-яё][а-яёА-ЯЁ-]*)*)/g;

export function runGuardrails(description: string, ctx: NarrativeContext): GuardrailReport {
  const allowed = buildAllowedNames(ctx);
  const allowedLc = new Set<string>();
  for (const n of allowed) allowedLc.add(n.toLowerCase());

  const unknownQuoted: string[] = [];
  for (const match of description.matchAll(QUOTED_RE)) {
    const phrase = match[1].trim();
    if (!phrase) continue;
    if (allowedLc.has(phrase.toLowerCase())) continue;
    // Accept descriptions/quotes from author waypoint `description` fields too.
    if (matchesAuthorDescription(phrase, ctx)) continue;
    unknownQuoted.push(phrase);
  }

  const unknownCapitalised: string[] = [];
  const seenCap = new Set<string>();
  for (const match of description.matchAll(CAPITALISED_RE)) {
    const phrase = match[1].trim();
    if (!phrase) continue;
    if (seenCap.has(phrase.toLowerCase())) continue;
    seenCap.add(phrase.toLowerCase());

    // Skip sentence-initial capitals: if the matched range starts at offset 0
    // or right after a sentence terminator, it's likely just a normal word.
    const startIdx = match.index ?? 0;
    if (isSentenceStart(description, startIdx)) continue;
    if (RU_STOP_NAMES.has(phrase)) continue;
    if (allowedLc.has(phrase.toLowerCase())) continue;
    // Allow if it's the head word of a known multi-word name.
    if (anyAllowedStartsWith(allowedLc, phrase)) continue;
    unknownCapitalised.push(phrase);
  }

  return {
    ok: unknownQuoted.length === 0 && unknownCapitalised.length === 0,
    unknownQuoted,
    unknownCapitalised,
    allowedCount: allowed.size,
  };
}

function isSentenceStart(text: string, idx: number): boolean {
  for (let i = idx - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === " " || ch === "\n" || ch === "\t") continue;
    return ch === "." || ch === "!" || ch === "?" || ch === "\n";
  }
  return true;
}

function anyAllowedStartsWith(allowedLc: Set<string>, phrase: string): boolean {
  const lc = phrase.toLowerCase();
  for (const a of allowedLc) {
    if (a.startsWith(lc + " ") || a === lc) return true;
  }
  return false;
}

function matchesAuthorDescription(phrase: string, ctx: NarrativeContext): boolean {
  const lc = phrase.toLowerCase();
  for (const w of ctx.authorWaypoints) {
    if (w.description && w.description.toLowerCase().includes(lc)) return true;
  }
  return false;
}
