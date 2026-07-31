/**
 * Lightweight chat wrapper: Gemini → OpenRouter → Ollama → DeepSeek.
 *
 * Every remote provider is called through `proxiedFetch`, so on the prod VPS
 * they egress via the SOCKS5 tunnel. Both Google and OpenRouter reject that
 * VPS's Russian IP outright (400 FAILED_PRECONDITION "User location is not
 * supported" and 403 "Access denied by security policy" respectively), which
 * is what left the grabber with no working LLM. Ollama is local and stays on
 * a direct connection.
 *
 * Env vars:
 *   GEMINI_API_KEY     — primary; Google AI Studio key (AIza…)
 *   GEMINI_MODELS      — comma-separated override of the model chain
 *   OPENROUTER_API_KEY — secondary
 *   OLLAMA_URL         — fallback local (default: http://localhost:11434)
 *   OLLAMA_CHAT_MODEL  — default llama3.2:3b
 *   DEEPSEEK_API_KEY   — last-resort paid fallback
 *   SOCKS_PROXY        — egress tunnel (falls back to TELEGRAM_SOCKS_PROXY)
 *   NEXT_PUBLIC_SITE_URL
 */

import { proxiedFetch } from "@/lib/net/proxied-fetch";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
// Ordered by quality; on 429/404 the next model is tried automatically.
const GEMINI_MODELS = (process.env.GEMINI_MODELS ?? "gemini-3.5-flash,gemini-2.5-flash")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";
// Ordered by quality; on 429 the next model is tried automatically.
const OPENROUTER_MODELS = [
  "nvidia/nemotron-3-super-120b-a12b:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
  "meta-llama/llama-3.3-70b-instruct:free",
];
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY ?? "";
const OLLAMA_URL = (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/$/, "");
const OLLAMA_CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL ?? "llama3.2:3b";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://cycleconnect.cc";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface GeminiCallOptions {
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  /** Ask for `response_format: json_object`. */
  json: boolean;
  /**
   * Gemini 2.5/3.x think before answering and those tokens are billed against
   * `max_tokens`: with thinking on, a 256-token budget came back with
   * `finish_reason: "length"` and an EMPTY `content`. "none" disables it —
   * neither classification nor short prose needs a reasoning pass.
   */
  reasoningEffort: "none" | "low" | "medium" | "high";
}

/**
 * One call to Gemini's OpenAI-compatible endpoint.
 * Returns null when this particular model is unavailable (rate limit, retired
 * model, upstream hiccup) so the caller can try the next one; throws on
 * anything else, e.g. a bad API key — that must not be retried 3× silently.
 */
async function geminiChat(
  model: string,
  messages: ChatMessage[],
  opts: GeminiCallOptions,
): Promise<string | null> {
  const res = await proxiedFetch(GEMINI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GEMINI_API_KEY}`,
      "Content-Type": "application/json",
    },
    timeoutMs: opts.timeoutMs,
    body: JSON.stringify({
      model,
      messages,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
      reasoning_effort: opts.reasoningEffort,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  const body = await res.text();
  if (res.status === 429 || res.status === 404 || res.status === 503) {
    console.warn(`[llm] Gemini ${model} unavailable (HTTP ${res.status}), trying next`);
    return null;
  }
  if (!res.ok) throw new Error(`gemini HTTP ${res.status}: ${body.slice(0, 200)}`);
  const data = JSON.parse(body) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (data.error) throw new Error(`gemini: ${data.error.message}`);
  return data.choices?.[0]?.message?.content ?? "";
}

/**
 * Send messages and receive a JSON-parsed response object.
 * Chain: Gemini (if key set) → OpenRouter → Ollama local → DeepSeek.
 *
 * `maxTokens` counts REASONING tokens too on reasoning models (Nemotron):
 * with a long prompt and the old fixed 256, the whole budget went to
 * thinking and `content` came back empty. Callers with non-trivial prompts
 * should pass 1024+.
 */
export async function chatJSON(
  messages: ChatMessage[],
  timeoutMs = 5_000,
  numCtx = 1024,
  maxTokens = 256,
): Promise<Record<string, unknown>> {
  // ── Primary: Gemini (rotate models on 429/404) ───────────────────────────
  if (GEMINI_API_KEY) {
    for (const model of GEMINI_MODELS) {
      try {
        // Callers on the interactive path pass 5s, sized for a local Ollama.
        // A remote API through the tunnel needs more than that before we give
        // up and fall through to a worse provider.
        const raw = await geminiChat(model, messages, {
          maxTokens,
          temperature: 0,
          timeoutMs: Math.max(timeoutMs, 15_000),
          json: true,
          reasoningEffort: "none",
        });
        if (raw === null) continue;
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) throw new Error("empty or non-JSON content");
        return JSON.parse(match[0]) as Record<string, unknown>;
      } catch (err) {
        console.warn(
          `[llm] Gemini ${model} failed:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
    console.warn("[llm] All Gemini models failed, falling back to OpenRouter");
  }

  // ── Secondary: OpenRouter (rotate models on 429) ─────────────────────────
  if (OPENROUTER_API_KEY) {
    for (const model of OPENROUTER_MODELS) {
      try {
        const res = await proxiedFetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": SITE_URL,
            "X-Title": "CycleConnect",
          },
          timeoutMs: 10_000,
          body: JSON.stringify({
            model,
            messages,
            max_tokens: maxTokens,
            temperature: 0,
            response_format: { type: "json_object" },
          }),
        });
        const body = await res.text();
        if (!res.ok) throw new Error(`openrouter HTTP ${res.status}`);
        const data = JSON.parse(body) as {
          choices?: Array<{ message?: { content?: string } }>;
          error?: { message?: string; code?: number };
        };
        // 429 = rate-limited upstream → try next model in list
        if (data.error?.code === 429) {
          console.warn(`[llm] OpenRouter ${model} rate-limited, trying next`);
          continue;
        }
        if (data.error) throw new Error(`openrouter: ${data.error.message}`);
        const raw = data.choices?.[0]?.message?.content ?? "";
        const match = raw.match(/\{[\s\S]*\}/);
        // Empty content is a real failure mode (reasoning models burning the
        // whole token budget before emitting JSON) — try the next model
        // rather than silently handing the caller an empty object.
        if (!match) throw new Error("empty or non-JSON content");
        return JSON.parse(match[0]) as Record<string, unknown>;
      } catch (err) {
        console.warn(
          `[llm] OpenRouter ${model} failed:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
    console.warn("[llm] All OpenRouter models failed, falling back to Ollama");
  }

  // ── Tertiary: Ollama local (direct — it runs on this host) ────────────────
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_CHAT_MODEL,
        messages,
        stream: false,
        format: "json",
        options: { temperature: 0, num_ctx: numCtx },
        keep_alive: "87600h",
      }),
    });
    if (!res.ok) throw new Error(`ollama HTTP ${res.status}`);
    const data = await res.json() as { message?: { content?: string }; error?: string };
    if (data.error) throw new Error(`ollama: ${data.error}`);
    const content = data.message?.content ?? "{}";
    return JSON.parse(content) as Record<string, unknown>;
  } catch (err) {
    console.warn(
      "[llm] Ollama unavailable, trying DeepSeek:",
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    clearTimeout(timer);
  }

  // ── Last resort: DeepSeek ─────────────────────────────────────────────────
  if (!DEEPSEEK_API_KEY) {
    console.error("[llm] No fallback configured, all LLM paths failed");
    return {};
  }
  try {
    const res = await proxiedFetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeoutMs: 8_000,
      body: JSON.stringify({
        model: "deepseek-chat",
        messages,
        max_tokens: maxTokens,
        temperature: 0,
        response_format: { type: "json_object" },
      }),
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`deepseek HTTP ${res.status}`);
    const data = JSON.parse(body) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };
    if (data.error) throw new Error(`deepseek: ${data.error.message}`);
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return {};
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch (err) {
    console.error(
      "[llm] DeepSeek also failed:",
      err instanceof Error ? err.message : String(err),
    );
    return {};
  }
}

export interface ChatTextOptions {
  /** Hard timeout per provider attempt (ms). Default 60s — generation is slow. */
  timeoutMs?: number;
  /** Max output tokens. Default 1024 (~ 400 RU words). */
  maxTokens?: number;
  /** Sampling temperature. Default 0.3 — slight variety for prose. */
  temperature?: number;
  /**
   * Subset of OpenRouter models to try (preserves chain semantics).
   * Defaults to the same list as `chatJSON`. Gemini's chain is set by
   * `GEMINI_MODELS`.
   */
  models?: string[];
  /**
   * Reasoning budget for Gemini. Defaults to "none": thinking tokens are
   * charged against `maxTokens`, and at "low" a 400-token budget came back as
   * a truncated mid-sentence fragment instead of a description. Raise it only
   * together with `maxTokens`.
   */
  reasoningEffort?: "none" | "low" | "medium" | "high";
  /** Skip the local Ollama fallback (its small model writes poor prose). */
  skipOllama?: boolean;
}

export interface ChatTextResult {
  text: string;
  model: string;
  provider: "gemini" | "openrouter" | "ollama" | "deepseek";
  durationMs: number;
}

/**
 * Free-form text generation with the same provider chain as `chatJSON`.
 * Use this for prose tasks (descriptions, summaries). Returns the model name
 * actually used so callers can persist it for A/B / accept-rate analytics.
 */
export async function chatText(
  messages: ChatMessage[],
  opts: ChatTextOptions = {},
): Promise<ChatTextResult> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const maxTokens = opts.maxTokens ?? 1024;
  const temperature = opts.temperature ?? 0.3;
  const models = opts.models ?? OPENROUTER_MODELS;
  const t0 = Date.now();

  if (GEMINI_API_KEY) {
    for (const model of GEMINI_MODELS) {
      try {
        const text = (
          await geminiChat(model, messages, {
            maxTokens,
            temperature,
            timeoutMs,
            json: false,
            reasoningEffort: opts.reasoningEffort ?? "none",
          })
        )?.trim();
        if (text === undefined) continue;
        if (!text) {
          console.warn(`[llm.text] Gemini ${model} returned empty body`);
          continue;
        }
        return { text, model, provider: "gemini", durationMs: Date.now() - t0 };
      } catch (err) {
        console.warn(
          `[llm.text] Gemini ${model} failed:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
    console.warn("[llm.text] All Gemini models failed");
  }

  if (OPENROUTER_API_KEY) {
    for (const model of models) {
      try {
        const res = await proxiedFetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": SITE_URL,
            "X-Title": "CycleConnect",
          },
          timeoutMs,
          body: JSON.stringify({
            model,
            messages,
            max_tokens: maxTokens,
            temperature,
          }),
        });
        const body = await res.text();
        if (!res.ok) throw new Error(`openrouter HTTP ${res.status}`);
        const data = JSON.parse(body) as {
          choices?: Array<{ message?: { content?: string } }>;
          error?: { message?: string; code?: number };
        };
        if (data.error?.code === 429) {
          console.warn(`[llm.text] OpenRouter ${model} rate-limited, trying next`);
          continue;
        }
        if (data.error) throw new Error(`openrouter: ${data.error.message}`);
        const text = (data.choices?.[0]?.message?.content ?? "").trim();
        if (!text) {
          console.warn(`[llm.text] OpenRouter ${model} returned empty body`);
          continue;
        }
        return { text, model, provider: "openrouter", durationMs: Date.now() - t0 };
      } catch (err) {
        console.warn(
          `[llm.text] OpenRouter ${model} failed:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
    console.warn("[llm.text] All OpenRouter models failed");
  }

  if (!opts.skipOllama) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: OLLAMA_CHAT_MODEL,
          messages,
          stream: false,
          options: { temperature, num_ctx: 8192, num_predict: maxTokens },
          keep_alive: "87600h",
        }),
      });
      if (!res.ok) throw new Error(`ollama HTTP ${res.status}`);
      const data = (await res.json()) as { message?: { content?: string }; error?: string };
      if (data.error) throw new Error(`ollama: ${data.error}`);
      const text = (data.message?.content ?? "").trim();
      if (text) return { text, model: OLLAMA_CHAT_MODEL, provider: "ollama", durationMs: Date.now() - t0 };
    } catch (err) {
      console.warn(
        "[llm.text] Ollama failed:",
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      clearTimeout(timer);
    }
  }

  if (!DEEPSEEK_API_KEY) {
    throw new Error("All LLM providers exhausted and no DeepSeek key");
  }
  const res = await proxiedFetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json",
    },
    timeoutMs,
    body: JSON.stringify({
      model: "deepseek-chat",
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`deepseek HTTP ${res.status}`);
  const data = JSON.parse(body) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (data.error) throw new Error(`deepseek: ${data.error.message}`);
  const text = (data.choices?.[0]?.message?.content ?? "").trim();
  if (!text) throw new Error("deepseek returned empty body");
  return { text, model: "deepseek-chat", provider: "deepseek", durationMs: Date.now() - t0 };
}

/**
 * Fire-and-forget warm-up for Ollama chat model.
 * Skipped when a remote provider is configured — Ollama won't be used then.
 */
export function warmUpOllama(): void {
  if (GEMINI_API_KEY || OPENROUTER_API_KEY) return;
  fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_CHAT_MODEL,
      messages: [],
      stream: false,
      keep_alive: "87600h",
    }),
  })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      console.log(`[llm] warm-up ok: ${OLLAMA_CHAT_MODEL} loaded`);
    })
    .catch((err) =>
      console.warn("[llm] warm-up failed (non-fatal):", err instanceof Error ? err.message : String(err)),
    );
}
