/**
 * GET /api/ai-search/warmup
 *
 * Fires both Ollama models (bge-m3 embeddings + llama3.2:3b chat) so they're
 * resident before the user submits a query. Called by the AI search widget on
 * open — by the time the user finishes reading suggestions, both models are
 * loaded. Belt-and-braces alongside instrumentation.ts (which warms at boot)
 * for the case where models got evicted after a long idle window.
 *
 * Auth-gated to match /api/ai-search.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { warmUpEmbeddings } from "@/lib/embeddings/jina";
import { warmUpOllama } from "@/lib/llm/ollama-chat";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // Both warmers are fire-and-forget; we return immediately so the widget
  // open isn't blocked on model load.
  warmUpEmbeddings();
  warmUpOllama();
  return NextResponse.json({ ok: true });
}
