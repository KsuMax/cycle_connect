import * as cheerio from "cheerio";
import type { RawPost } from "./types";

const USER_AGENT = "CycleConnectRouteGrabber/1.0 (+https://cycleconnect.cc)";

/**
 * Public web preview of a Telegram channel — no bot token / auth needed,
 * shows the ~20 most recent posts. Good enough for hourly polling of a
 * personal channel; we're not trying to backfill full history.
 */
export async function fetchTelegramChannel(
  identifier: string,
  cursor: Record<string, unknown>
): Promise<{ posts: RawPost[]; nextCursor: Record<string, unknown> }> {
  const handle = identifier.replace(/^@/, "");
  const lastMessageId = typeof cursor.lastMessageId === "number" ? cursor.lastMessageId : 0;

  const res = await fetch(`https://t.me/s/${handle}`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`t.me/s/${handle} responded ${res.status}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  const posts: RawPost[] = [];
  let maxSeen = lastMessageId;

  $(".tgme_widget_message[data-post]").each((_, el) => {
    const dataPost = $(el).attr("data-post") ?? "";
    const idPart = dataPost.split("/")[1];
    const messageId = idPart ? parseInt(idPart, 10) : NaN;
    if (!Number.isFinite(messageId)) return;

    if (messageId > maxSeen) maxSeen = messageId;
    if (messageId <= lastMessageId) return;

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

  return {
    posts,
    nextCursor: { lastMessageId: maxSeen },
  };
}
