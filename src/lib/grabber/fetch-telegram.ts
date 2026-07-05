import * as cheerio from "cheerio";
import { telegramFetch } from "./proxied-fetch";
import type { RawPost } from "./types";

const USER_AGENT = "CycleConnectRouteGrabber/1.0 (+https://cycleconnect.cc)";

// One t.me/s page can hold as few as 3-5 messages when the channel posts
// photo albums (each album eats a run of message ids but renders as one
// widget). Pagination via ?before=<oldest id on page> walks the history
// back. Caps below bound one run: a fresh source backfills up to
// MAX_PAGES_BACKFILL pages (~100+ posts on text-heavy channels), an
// up-to-date source normally stops after page 1 at the cursor.
const MAX_PAGES_BACKFILL = 15;
const MAX_PAGES_INCREMENTAL = 5;
const PAGE_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface PageResult {
  posts: RawPost[];
  minId: number | null;
  maxId: number | null;
}

function parsePreviewPage(html: string, handle: string): PageResult {
  const $ = cheerio.load(html);
  const posts: RawPost[] = [];
  let minId: number | null = null;
  let maxId: number | null = null;

  $(".tgme_widget_message[data-post]").each((_, el) => {
    const dataPost = $(el).attr("data-post") ?? "";
    const idPart = dataPost.split("/")[1];
    const messageId = idPart ? parseInt(idPart, 10) : NaN;
    if (!Number.isFinite(messageId)) return;

    if (minId === null || messageId < minId) minId = messageId;
    if (maxId === null || messageId > maxId) maxId = messageId;

    const textEl = $(el).find(".tgme_widget_message_text").first();
    // .text() drops href targets when link text differs from the URL
    // (e.g. "трек тут") — append hrefs explicitly so link-detect still finds them.
    const hrefs = textEl
      .find("a")
      .map((_i, a) => $(a).attr("href"))
      .get()
      .filter((h): h is string => !!h);
    const text = [textEl.text().trim(), ...hrefs].filter(Boolean).join("\n");

    if (!text) return;

    posts.push({
      permalink: `https://t.me/${handle}/${messageId}`,
      text,
      cursorValue: messageId,
    });
  });

  return { posts, minId, maxId };
}

/**
 * Public web preview of a Telegram channel — no bot token / auth needed.
 * Walks ?before= pagination newest-first until it reaches the cursor (or a
 * page cap), so both a fresh source's backfill and a burst of new posts
 * between hourly runs are picked up, not just whatever fits on page one.
 */
export async function fetchTelegramChannel(
  identifier: string,
  cursor: Record<string, unknown>
): Promise<{ posts: RawPost[]; nextCursor: Record<string, unknown> }> {
  const handle = identifier.replace(/^@/, "");
  const lastMessageId = typeof cursor.lastMessageId === "number" ? cursor.lastMessageId : 0;
  const maxPages = lastMessageId === 0 ? MAX_PAGES_BACKFILL : MAX_PAGES_INCREMENTAL;

  const allPosts: RawPost[] = [];
  let newestSeen = lastMessageId;
  let before: number | null = null;

  for (let page = 0; page < maxPages; page++) {
    if (page > 0) await sleep(PAGE_DELAY_MS);

    const url = `https://t.me/s/${handle}${before !== null ? `?before=${before}` : ""}`;
    const res = await telegramFetch(url, {
      headers: { "User-Agent": USER_AGENT },
      timeoutMs: 10_000,
    });
    if (!res.ok) {
      // First page failing is a real error; a deep page failing mid-backfill
      // just ends the walk — whatever was collected still gets processed.
      if (page === 0) throw new Error(`t.me/s/${handle} responded ${res.status}`);
      break;
    }

    const { posts, minId, maxId } = parsePreviewPage(await res.text(), handle);
    if (minId === null) break; // empty page — reached the start of history

    if (maxId !== null && maxId > newestSeen) newestSeen = maxId;
    allPosts.push(...posts.filter((p) => (p.cursorValue as number) > lastMessageId));

    if (minId <= lastMessageId) break; // caught up with the cursor
    if (before !== null && minId >= before) break; // no progress — stop
    before = minId;
  }

  return {
    posts: allPosts,
    nextCursor: { lastMessageId: newestSeen },
  };
}
