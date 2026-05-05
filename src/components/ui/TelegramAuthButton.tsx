"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Phase = "idle" | "waiting" | "expired" | "error";

const POLL_INTERVAL_MS = 1500;
const MAX_POLLS = 200; // 5 min @ 1.5s

export function TelegramAuthButton({ returnUrl = "/" }: { returnUrl?: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");

  const handleClick = async () => {
    setPhase("waiting");

    let res: Response;
    try {
      res = await fetch("/api/auth/tg/start", { method: "POST" });
    } catch {
      setPhase("error");
      return;
    }

    if (!res.ok) { setPhase("error"); return; }

    const { nonce, url } = await res.json() as { nonce: string; url: string; botUsername: string };

    // Open bot in new tab
    window.open(url, "_blank", "noopener,noreferrer");

    // Poll for completion
    let polls = 0;
    const interval = setInterval(async () => {
      polls++;
      if (polls > MAX_POLLS) {
        clearInterval(interval);
        setPhase("expired");
        return;
      }

      let pollRes: Response;
      try {
        pollRes = await fetch(`/api/auth/tg/poll?nonce=${encodeURIComponent(nonce)}`);
      } catch {
        return; // Network blip — keep polling
      }

      if (!pollRes.ok) return;

      const data = await pollRes.json() as {
        status: "pending" | "ready" | "expired" | "missing";
        tokenHash?: string;
        email?: string;
      };

      if (data.status === "ready" && data.tokenHash) {
        clearInterval(interval);
        router.push(
          `/auth/callback?token_hash=${encodeURIComponent(data.tokenHash)}&type=magiclink&returnUrl=${encodeURIComponent(returnUrl)}`
        );
        return;
      }

      if (data.status === "expired" || data.status === "missing") {
        clearInterval(interval);
        setPhase("expired");
      }
    }, POLL_INTERVAL_MS);
  };

  if (phase === "waiting") {
    return (
      <div className="w-full rounded-xl border border-[#0088cc33] bg-[#0088cc08] px-4 py-2.5 text-sm text-center text-[#0088cc]">
        <span className="flex items-center justify-center gap-2">
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          Ждём подтверждения в Telegram...
        </span>
      </div>
    );
  }

  if (phase === "expired") {
    return (
      <button
        type="button"
        onClick={() => setPhase("idle")}
        className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl border border-[#E4E4E7] bg-white text-sm font-medium text-[#71717A] hover:border-[#A1A1AA] transition-colors"
      >
        Время вышло — попробовать снова
      </button>
    );
  }

  if (phase === "error") {
    return (
      <button
        type="button"
        onClick={() => setPhase("idle")}
        className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl border border-red-200 bg-red-50 text-sm font-medium text-red-600 hover:border-red-300 transition-colors"
      >
        Ошибка — попробовать снова
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl border border-[#E4E4E7] bg-white text-sm font-medium text-[#1C1C1E] hover:border-[#A1A1AA] hover:bg-[#FAFAF9] transition-colors"
      style={{ boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.05)" }}
    >
      {/* Telegram plane icon */}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="12" fill="#0088cc" />
        <path
          d="M17.928 6.627L5.427 11.29c-.857.334-.852.8-.156 1.008l3.19.995 1.24 3.836c.15.417.3.58.596.58.247 0 .356-.113.496-.248l1.493-1.452 3.1 2.288c.572.314.984.152 1.127-.53l2.04-9.606c.21-.84-.32-1.222-.625-1.534z"
          fill="white"
        />
      </svg>
      Войти через Telegram
    </button>
  );
}
