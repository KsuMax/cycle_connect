import * as https from "node:https";
import * as http from "node:http";
import { SocksProxyAgent } from "socks-proxy-agent";

/**
 * HTTP client that can egress through a SOCKS5 tunnel.
 *
 * The prod VPS sits on a Russian IP, and several upstreams refuse it at the
 * network or policy level: Telegram is blocked by the hosting provider,
 * OpenRouter answers 403 "Access denied by security policy", and the Google
 * Gemini API answers 400 FAILED_PRECONDITION "User location is not supported".
 * `SOCKS_PROXY` points at a SOCKS5 tunnel (autossh -D, see
 * backup-tunnel.service on the VPS) that egresses through a server that isn't
 * blocked. Unset locally — falls back to a direct connection so dev machines
 * without the tunnel still work.
 *
 * `TELEGRAM_SOCKS_PROXY` is the historical name of the same tunnel and is
 * still honoured so prod keeps working without an env change.
 *
 * Node's global `fetch` (undici) can't use a SOCKS agent, hence node:https.
 */
const PROXY_URL = process.env.SOCKS_PROXY || process.env.TELEGRAM_SOCKS_PROXY;
let agent: SocksProxyAgent | undefined;

function getAgent(): SocksProxyAgent | undefined {
  if (!PROXY_URL) return undefined;
  if (!agent) agent = new SocksProxyAgent(PROXY_URL);
  return agent;
}

/** True when a tunnel is configured — callers log it to explain egress path. */
export const hasProxy = Boolean(PROXY_URL);

export interface ProxyResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export interface ProxyRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Idle-socket timeout; the socket is destroyed when it expires. */
  timeoutMs?: number;
  /** Force a direct connection even when a tunnel is configured. */
  direct?: boolean;
}

export function proxiedFetch(url: string, init: ProxyRequestInit = {}): Promise<ProxyResponse> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === "http:" ? http : https;
    const req = mod.request(
      u,
      {
        method: init.method ?? "GET",
        headers: init.headers,
        agent: init.direct ? undefined : getAgent(),
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
