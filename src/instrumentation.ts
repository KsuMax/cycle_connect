export async function register() {
  // Only warm up in the Node.js runtime (not in the Edge runtime)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { warmUpOllama } = await import("@/lib/llm/ollama-chat");
    warmUpOllama();
  }
}
