import type { DetectedLink, LinkType } from "./types";

/**
 * Domains we can label with confidence. Anything else still counts as a
 * qualifying link (see extractLinks) — we just can't name the service.
 */
const DOMAIN_RULES: Array<{ type: LinkType; re: RegExp }> = [
  { type: "nakarte", re: /nakarte\.me/i },
  { type: "strava", re: /strava\.com/i },
  { type: "komoot", re: /komoot\.(com|de)/i },
  { type: "wikiloc", re: /wikiloc\.com/i },
  { type: "osm", re: /openstreetmap\.org/i },
  { type: "mapmagic", re: /mapmagic\.app/i },
];

// Common RU/international link shorteners seen in cycling posts. Best-effort
// resolution only — an unresolvable shortener still passes the "has a link"
// filter, it's just labelled "unknown" for the admin to check by hand.
const SHORTENER_HOSTS = new Set([
  "clck.ru",
  "vk.cc",
  "bit.ly",
  "goo.gl",
  "t.co",
  "tinyurl.com",
  "is.gd",
  "cutt.ly",
]);

const URL_RE = /https?:\/\/[^\s)>\]"'«»]+/gi;

function classify(url: string): LinkType {
  if (/\.gpx(?:[?#]|$)/i.test(url)) return "gpx";
  for (const { type, re } of DOMAIN_RULES) {
    if (re.test(url)) return type;
  }
  if (/\/uploads\/|attachment\.php|\/applications\/core\/interface\/file\//i.test(url)) {
    return "forum-attachment";
  }
  return "unknown";
}

/** All distinct http(s) URLs found in free text. Order preserved. */
export function extractLinks(text: string): string[] {
  return Array.from(new Set(text.match(URL_RE) ?? []));
}

// Shorteners redirect to attacker-influenced URLs (post content). Following
// redirects blindly would let a crafted link make our server GET an internal
// address (metadata endpoint, internal admin port, etc). Resolve one hop at
// a time and refuse to follow any hop that points at a private/loopback/
// link-local host.
const PRIVATE_HOST_RE =
  /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|::1$|\[::1\]$)|^172\.(1[6-9]|2\d|3[01])\./i;

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return PRIVATE_HOST_RE.test(h) || h.endsWith(".local") || h.endsWith(".internal");
}

async function resolveShortlink(url: string): Promise<string | null> {
  let current = url;
  for (let hop = 0; hop < 5; hop++) {
    try {
      const parsed = new URL(current);
      if (isPrivateHost(parsed.hostname)) return null;

      const res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(3000),
      });
      res.body?.cancel().catch(() => {});

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) return null;
        current = new URL(location, current).toString();
        continue;
      }

      return current !== url ? current : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Classify every link in a post. Shortener domains get one best-effort
 * resolution attempt; failures are labelled "unknown" rather than dropped —
 * per product decision, ANY link is enough to qualify a post for review.
 */
export async function detectLinks(text: string): Promise<DetectedLink[]> {
  const urls = extractLinks(text);
  const out: DetectedLink[] = [];

  for (const url of urls) {
    let type = classify(url);
    let resolvedUrl: string | undefined;

    if (type === "unknown") {
      let host = "";
      try {
        host = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        // malformed URL — keep as unknown, still counts toward the filter
      }
      if (SHORTENER_HOSTS.has(host)) {
        const resolved = await resolveShortlink(url);
        if (resolved) {
          resolvedUrl = resolved;
          type = classify(resolved);
        }
      }
    }

    out.push(resolvedUrl ? { url, type, resolvedUrl } : { url, type });
  }

  return out;
}
