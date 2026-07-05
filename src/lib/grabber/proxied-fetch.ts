import * as https from "node:https";
import * as http from "node:http";
import { SocksProxyAgent } from "socks-proxy-agent";

/**
 * Telegram (t.me / api.telegram.org) is unreachable directly from the prod
 * VPS — the hosting provider blocks its IP ranges at the network level
 * (confirmed: raw TCP SYN to Telegram's real IPs times out, DNS resolves
 * fine, other domains work). TELEGRAM_SOCKS_PROXY points at a SOCKS5 tunnel
 * (autossh -D, see backup-tunnel.service on the VPS) that egresses through
 * a server that isn't blocked. Unset locally — falls back to a direct
 * connection so dev machines without the tunnel still work.
 */
const PROXY_URL = process.env.TELEGRAM_SOCKS_PROXY;
let agent: SocksProxyAgent | undefined;

function getAgent(): SocksProxyAgent | undefined {
  if (!PROXY_URL) return undefined;
  if (!agent) agent = new SocksProxyAgent(PROXY_URL);
  return agent;
}

export interface ProxyResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export function telegramFetch(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number } = {}
): Promise<ProxyResponse> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === "http:" ? http : https;
    const req = mod.request(
      u,
      {
        method: init.method ?? "GET",
        headers: init.headers,
        agent: getAgent(),
        timeout: init.timeoutMs ?? 10_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const status = res.statusCode ?? 0;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            text: async () => Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("request timeout")));
    req.on("error", reject);
    if (init.body) req.write(init.body);
    req.end();
  });
}
