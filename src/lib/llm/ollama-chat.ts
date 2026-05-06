/**
 * Lightweight chat wrapper: Ollama (primary) → OpenRouter (fallback).
 *
 * Ollama runs locally on the VPS alongside the app.
 * OpenRouter is the fallback when Ollama is unavailable or slow.
 *
 * Env vars:
 *   OLLAMA_URL         — default http://localhost:11434
 *   OLLAMA_CHAT_MODEL  — default llama3.2:3b
 *   OPENROUTER_API_KEY — for fallback
 *   NEXT_PUBLIC_SITE_URL
 */

const OLLAMA_URL = (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/$/, "");
const OLLAMA_CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL ?? "llama3.2:3b";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://cycleconnect.cc";
// Same model family as local, so prompts are consistent
const OPENROUTER_FALLBACK_MODEL = "meta-llama/llama-3.2-3b-instruct:free";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Send messages and receive a JSON-parsed response object.
 * Uses Ollama `format:"json"` for guaranteed valid JSON output.
 * Falls back to OpenRouter on timeout (default 8 s) or error.
 */
export async function chatJSON(
  messages: ChatMessage[],
  timeoutMs = 5_000,
): Promise<Record<string, unknown>> {
  // ── Primary: Ollama local ──────────────────────────────────────────────────
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
        options: {
          temperature: 0,
          num_ctx: 1024,
        },
        keep_alive: "10m",
      }),
    });
    if (!res.ok) throw new Error(`ollama HTTP ${res.status}`);
    const data = await res.json() as { message?: { content?: string }; error?: string };
    if (data.error) throw new Error(`ollama: ${data.error}`);
    const content = data.message?.content ?? "{}";
    return JSON.parse(content) as Record<string, unknown>;
  } catch (err) {
    console.warn(
      "[ollama-chat] Ollama unavailable, trying OpenRouter fallback:",
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    clearTimeout(timer);
  }

  // ── Fallback: OpenRouter ───────────────────────────────────────────────────
  if (!OPENROUTER_API_KEY) {
    console.error("[ollama-chat] No OPENROUTER_API_KEY set, both LLM paths failed");
    return {};
  }
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": SITE_URL,
        "X-Title": "CycleConnect",
      },
      body: JSON.stringify({
        model: OPENROUTER_FALLBACK_MODEL,
        messages,
        max_tokens: 256,
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    });
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
    console.error(
      "[ollama-chat] OpenRouter fallback also failed:",
      err instanceof Error ? err.message : String(err),
    );
    return {};
  }
}

/**
 * Fire-and-forget warm-up: loads the model into memory so the first real request is fast.
 * Only beneficial when running on a machine with a GPU or sufficient free RAM.
 * On a CPU-only VPS with limited RAM this is a no-op (model won't stay warm anyway).
 */
export function warmUpOllama(): void {
  fetch(`${OLLAMA_URL}/api/tags`)
    .then((r) => r.json())
    .then((d) => {
      const models: string[] = (d as { models?: Array<{ name: string }> }).models?.map((m) => m.name) ?? [];
      console.log("[ollama-chat] available models:", models.join(", ") || "none");
    })
    .catch((err) =>
      console.warn("[ollama-chat] Ollama ping failed (non-fatal):", err instanceof Error ? err.message : String(err)),
    );
}
