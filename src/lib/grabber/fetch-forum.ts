import * as cheerio from "cheerio";
import type { RawPost } from "./types";

const USER_AGENT = "CycleConnectRouteGrabber/1.0 (+https://cycleconnect.cc)";

// velopiter.spb.ru/robots.txt: "Crawl-delay: 3". Sleep before every request
// (including the very first) so callers can process multiple subforums on
// this host sequentially without ever bursting requests.
const CRAWL_DELAY_MS = 3_000;

// Bound worst-case run time: a subforum with more new topics than this in
// one poll window only gets the newest MAX processed; the rest stay above
// the (unadvanced) cursor and get picked up next run.
const MAX_TOPICS_PER_RUN = 15;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function politeFetch(url: string): Promise<string> {
  await sleep(CRAWL_DELAY_MS);
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return res.text();
}

interface TopicListItem {
  permalink: string;
  title: string;
  lastPostIso: string;
}

function parseTopicList(html: string): TopicListItem[] {
  const $ = cheerio.load(html);
  const items: TopicListItem[] = [];

  $(".ipsDataItem").each((_, el) => {
    const titleLink = $(el).find(".ipsDataItem_title a[href]").first();
    const href = titleLink.attr("href");
    if (!href) return;
    const permalink = href.split("?")[0];
    const title = titleLink.find("[itemprop='name headline']").text().trim() || titleLink.text().trim();

    const timeEl = $(el).find(".ipsDataItem_lastPoster time[datetime]").last();
    const lastPostIso = timeEl.attr("datetime");
    if (!lastPostIso) return;

    items.push({ permalink, title, lastPostIso });
  });

  return items;
}

function parseFirstPostText(html: string): string {
  const $ = cheerio.load(html);
  const body = $("[data-role='commentContent']").first();
  const hrefs = body
    .find("a")
    .map((_i, a) => $(a).attr("href"))
    .get()
    .filter((h): h is string => !!h);
  return [body.text().trim(), ...hrefs].filter(Boolean).join("\n");
}

/**
 * One IPS (Invision Community) subforum. `identifier` is the full subforum
 * URL (e.g. https://velopiter.spb.ru/forum/98-.../). Cursor tracks the ISO
 * timestamp of the newest last-post we've already processed.
 */
export async function fetchForumSubforum(
  identifier: string,
  cursor: Record<string, unknown>
): Promise<{ posts: RawPost[]; nextCursor: Record<string, unknown> }> {
  const lastPostTs = typeof cursor.lastPostTs === "string" ? cursor.lastPostTs : null;
  const lastPostMs = lastPostTs ? Date.parse(lastPostTs) : 0;

  const listingHtml = await politeFetch(identifier);
  const topics = parseTopicList(listingHtml)
    .filter((t) => Date.parse(t.lastPostIso) > lastPostMs)
    // Newest first, so if we hit MAX_TOPICS_PER_RUN we drop the oldest of
    // the new batch, not the newest.
    .sort((a, b) => Date.parse(b.lastPostIso) - Date.parse(a.lastPostIso))
    .slice(0, MAX_TOPICS_PER_RUN);

  const posts: RawPost[] = [];
  let maxProcessedMs = lastPostMs;

  for (const topic of topics) {
    const topicHtml = await politeFetch(topic.permalink);
    const firstPost = parseFirstPostText(topicHtml);
    if (!firstPost) continue;

    posts.push({
      permalink: topic.permalink,
      text: `${topic.title}\n${firstPost}`,
      cursorValue: topic.lastPostIso,
    });

    const ms = Date.parse(topic.lastPostIso);
    if (ms > maxProcessedMs) maxProcessedMs = ms;
  }

  return {
    posts,
    nextCursor: { lastPostTs: new Date(maxProcessedMs).toISOString() },
  };
}
