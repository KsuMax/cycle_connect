"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";

const STORAGE_KEY = "cc_cookie_ack_v1";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      // localStorage unavailable — silently skip
    }
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    setVisible(false);
  };

  return (
    <div
      role="region"
      aria-label="Уведомление о cookies"
      className="fixed bottom-20 sm:bottom-3 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-1.5rem)] max-w-md
        bg-white/95 backdrop-blur border border-[#E4E4E7] rounded-xl
        px-3 py-2 flex items-center gap-2 text-xs text-[#71717A]"
      style={{ boxShadow: "0 4px 12px 0 rgb(0 0 0 / 0.08)" }}
    >
      <span className="flex-1 leading-snug">
        Используем cookies для работы сайта.{" "}
        <Link href="/legal/privacy" className="text-[#F4632A] hover:underline whitespace-nowrap">
          Подробнее
        </Link>
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Закрыть уведомление"
        className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-[#A1A1AA] hover:text-[#1C1C1E] hover:bg-[#F5F4F1] transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
}
