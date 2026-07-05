import { createAdminSupabase } from "@/lib/supabase-admin";
import { fetchTelegramChannel } from "./fetch-telegram";
import { fetchForumSubforum } from "./fetch-forum";
import { detectLinks, extractLinks } from "./link-detect";
import { extractCandidate } from "./extract";
import type { GrabberSource, RunSummary } from "./types";

const MIN_CONFIDENCE = 0.3;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://cycleconnect.cc";
// api.telegram.org's Bot API is already reachable via the same reverse proxy
// tg-notify/tg-webhook use (TELEGRAM_API_BASE) — no need for the SOCKS
// tunnel here, that's only required for scraping t.me directly (see
// fetch-telegram.ts), which the proxy doesn't serve.
const TG_API_BASE = (process.env.TELEGRAM_API_BASE ?? "https://api.telegram.org").replace(/\/$/, "");

export type GrabberMode = "telegram" | "forum";

const MODE_TO_SOURCE_TYPE = {
  telegram: "telegram-preview",
  forum: "ips-forum",
} as const;

export async function runGrabber(mode: GrabberMode): Promise<RunSummary[]> {
  const admin = createAdminSupabase();
  const sourceType = MODE_TO_SOURCE_TYPE[mode];

  const { data: sources, error: sourcesErr } = await admin
    .from("grabber_sources")
    .select("id, type, identifier, label, enabled, cursor")
    .eq("type", sourceType)
    .eq("enabled", true);

  if (sourcesErr) {
    console.error("[grabber] failed to load sources:", sourcesErr.message);
    return [];
  }

  const summaries: RunSummary[] = [];
  let totalInserted = 0;

  // Sequential on purpose: forum sources share a host and must respect its
  // crawl-delay across subforums, not just within one.
  for (const source of (sources ?? []) as GrabberSource[]) {
    const summary: RunSummary = {
      source: source.label ?? source.identifier,
      fetched: 0,
      filtered: 0,
      llmCalls: 0,
      inserted: 0,
    };

    try {
      const { posts, nextCursor } =
        mode === "telegram"
          ? await fetchTelegramChannel(source.identifier, source.cursor)
          : await fetchForumSubforum(source.identifier, source.cursor);

      summary.fetched = posts.length;

      for (const post of posts) {
        // Hard pre-filter in code: no link, no candidate — enforced before
        // spending an LLM call, per product decision (any link qualifies).
        if (extractLinks(post.text).length === 0) continue;
        summary.filtered++;

        const links = await detectLinks(post.text);
        summary.llmCalls++;
        const draft = await extractCandidate(post, links);
        if (!draft || draft.confidence < MIN_CONFIDENCE) continue;

        const { error: insertErr } = await admin.from("grabber_candidates").upsert(
          {
            source_id: source.id,
            permalink: draft.permalink,
            title: draft.title,
            region: draft.region,
            summary: draft.summary,
            links: draft.links,
            confidence: draft.confidence,
            raw_snippet: draft.rawSnippet,
          },
          { onConflict: "source_id,permalink", ignoreDuplicates: true }
        );
        if (!insertErr) {
          summary.inserted++;
          totalInserted++;
        }
      }

      await admin
        .from("grabber_sources")
        .update({ cursor: nextCursor, last_run_at: new Date().toISOString(), last_error: null })
        .eq("id", source.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      summary.error = message;
      console.error(`[grabber] source ${source.identifier} failed:`, message);
      await admin
        .from("grabber_sources")
        .update({ last_run_at: new Date().toISOString(), last_error: message })
        .eq("id", source.id);
    }

    summaries.push(summary);
  }

  if (totalInserted > 0) {
    await sendDigest(admin, totalInserted);
  }

  return summaries;
}

async function sendDigest(admin: ReturnType<typeof createAdminSupabase>, count: number): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  const { data: admins } = await admin
    .from("profiles")
    .select("telegram_chat_id")
    .eq("is_admin", true)
    .not("telegram_chat_id", "is", null);

  const text =
    `🔎 Граббер нашёл ${count} ${pluralizeCandidates(count)}\n\n` +
    `<a href="${SITE_URL}/admin/grabber">Посмотреть →</a>`;

  for (const row of admins ?? []) {
    const chatId = row.telegram_chat_id as number | null;
    if (!chatId) continue;
    try {
      await fetch(`${TG_API_BASE}/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
        signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      console.error("[grabber] telegram digest failed:", err instanceof Error ? err.message : err);
    }
  }
}

function pluralizeCandidates(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "новый маршрут";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "новых маршрута";
  return "новых маршрутов";
}
