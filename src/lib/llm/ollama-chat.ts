/**
 * Lightweight chat wrapper: OpenRouter → Ollama → DeepSeek.
 *
 * Env vars:
 *   OPENROUTER_API_KEY — primary; free 70b model, no cost, better quality
 *   OLLAMA_URL         — fallback local (default: http://localhost:11434)
 *   OLLAMA_CHAT_MODEL  — default llama3.2:3b
 *   DEEPSEEK_API_KEY   — last-resort paid fallback
 *   NEXT_PUBLIC_SITE_URL
 */

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

/**
 * Send messages and receive a JSON-parsed response object.
 * Chain: OpenRouter (if key set) → Ollama local → DeepSeek (last resort).
 */
export async function chatJSON(
  messages: ChatMessage[],
  timeoutMs = 5_000,
  numCtx = 1024,
): Promise<Record<string, unknown>> {
  // ── Primary: OpenRouter (rotate models on 429) ───────────────────────────
  if (OPENROUTER_API_KEY) {
    for (const model of OPENROUTER_MODELS) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": SITE_URL,
            "X-Title": "CycleConnect",
          },
          signal: controller.signal,
          body: JSON.stringify({
            model,
            messages,
            max_tokens: 256,
            temperature: 0,
            response_format: { type: "json_object" },
          }),
        }).finally(() => clearTimeout(timer));
        if (!res.ok) throw new Error(`openrouter HTTP ${res.status}`);
        const data = await res.json() as {
          choices?: Array<{ message?: { content?: string } }>;
          error?: { message?: string; code?: number };
        };
        // 429 = rate-limited upstream → try next model in list
        if (data.error?.code === 429) {
          console.warn(`[llm] OpenRouter ${model} rate-limited, trying next`);
          continue;
        }
        if (data.error) throw new Error(`openrouter: ${data.error.message}`);
        const raw = data.choices?.[0]?.message?.content ?? "{}";
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) return {};
        return JSON.parse(match[0]) as Record<string, unknown>;
      } catch (err) {
        console.warn(
          `[llm] OpenRouter ${model} failed:`,
          err instanceof Error ? err.message : String(err),
        );
      } finally {
        clearTimeout(timer);
      }
    }
    console.warn("[llm] All OpenRouter models failed, falling back to Ollama");
  }

  // ── Secondary: Ollama local ───────────────────────────────────────────────
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
    const dsController = new AbortController();
    const dsTimer = setTimeout(() => dsController.abort(), 8_000);
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: dsController.signal,
      body: JSON.stringify({
        model: "deepseek-chat",
        messages,
        max_tokens: 256,
        temperature: 0,
        response_format: { type: "json_object" },
      }),
    }).finally(() => clearTimeout(dsTimer));
    if (!res.ok) throw new Error(`deepseek HTTP ${res.status}`);
    const data = await res.json() as {
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
   * Defaults to the same list as `chatJSON`.
   */
  models?: string[];
  /** Skip the local Ollama fallback (its small model writes poor prose). */
  skipOllama?: boolean;
}

export interface ChatTextResult {
  text: string;
  model: string;
  provider: "openrouter" | "ollama" | "deepseek";
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

  if (OPENROUTER_API_KEY) {
    for (const model of models) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": SITE_URL,
            "X-Title": "CycleConnect",
          },
          signal: controller.signal,
          body: JSON.stringify({
            model,
            messages,
            max_tokens: maxTokens,
            temperature,
          }),
        }).finally(() => clearTimeout(timer));
        if (!res.ok) throw new Error(`openrouter HTTP ${res.status}`);
        const data = (await res.json()) as {
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
      } finally {
        clearTimeout(timer);
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
  const dsController = new AbortController();
  const dsTimer = setTimeout(() => dsController.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: dsController.signal,
      body: JSON.stringify({
        model: "deepseek-chat",
        messages,
        max_tokens: maxTokens,
        temperature,
      }),
    }).finally(() => clearTimeout(dsTimer));
    if (!res.ok) throw new Error(`deepseek HTTP ${res.status}`);
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };
    if (data.error) throw new Error(`deepseek: ${data.error.message}`);
    const text = (data.choices?.[0]?.message?.content ?? "").trim();
    if (!text) throw new Error("deepseek returned empty body");
    return { text, model: "deepseek-chat", provider: "deepseek", durationMs: Date.now() - t0 };
  } finally {
    clearTimeout(dsTimer);
  }
}

/**
 * Fire-and-forget warm-up for Ollama chat model.
 * Skipped when OpenRouter is configured — Ollama won't be used for chat.
 */
export function warmUpOllama(): void {
  if (OPENROUTER_API_KEY) return;
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
