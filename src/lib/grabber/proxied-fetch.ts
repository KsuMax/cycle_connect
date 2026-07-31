/**
 * Telegram (t.me / api.telegram.org) is unreachable directly from the prod
 * VPS — the hosting provider blocks its IP ranges at the network level
 * (confirmed: raw TCP SYN to Telegram's real IPs times out, DNS resolves
 * fine, other domains work). It therefore egresses through the shared SOCKS5
 * tunnel; see `src/lib/net/proxied-fetch.ts` for the tunnel itself.
 */
export { proxiedFetch as telegramFetch, type ProxyResponse } from "@/lib/net/proxied-fetch";
