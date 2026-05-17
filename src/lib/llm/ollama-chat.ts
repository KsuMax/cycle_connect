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
const OPENROUTER_MODEL = "meta-llama/llama-3.3-70b-instruct:free";
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
  // ── Primary: OpenRouter (free 70b model) ─────────────────────────────────
  if (OPENROUTER_API_KEY) {
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
          model: OPENROUTER_MODEL,
          messages,
          max_tokens: 256,
          temperature: 0,
          response_format: { type: "json_object" },
        }),
      }).finally(() => clearTimeout(timer));
      if (!res.ok) throw new Error(`openrouter HTTP ${res.status}`);
      const data = await res.json() as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      };
      if (data.error) throw new Error(`openrouter: ${data.error.message}`);
      const raw = data.choices?.[0]?.message?.content ?? "{}";
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return {};
      return JSON.parse(match[0]) as Record<string, unknown>;
    } catch (err) {
      console.warn(
        "[llm] OpenRouter failed, trying Ollama:",
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      clearTimeout(timer);
    }
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
