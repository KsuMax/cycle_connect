"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import Link from "next/link";
import { Sparkles, X, ArrowUp, MapPin, Mountain } from "lucide-react";
import type { RouteResult } from "@/app/api/ai-search/route";

const SUGGESTIONS = [
  "Лёгкий маршрут на 50 км",
  "Горный MTB в Карелии",
  "Городская покатушка на 2 часа",
  "Гравийный маршрут вдали от трасс",
];

const DIFFICULTY_STYLES: Record<string, string> = {
  easy: "bg-emerald-50 text-emerald-700",
  medium: "bg-amber-50 text-amber-700",
  hard: "bg-red-50 text-red-600",
};

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: "Лёгкий",
  medium: "Средний",
  hard: "Сложный",
};

export function AiSearchWidget() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [routes, setRoutes] = useState<RouteResult[] | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 80);
    } else {
      setRoutes(null);
      setQuery("");
      setError("");
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  async function handleSearch(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    setQuery(trimmed);
    setLoading(true);
    setError("");
    setRoutes(null);
    try {
      const res = await fetch("/api/ai-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка поиска");
      setRoutes(data.routes ?? []);
    } catch {
      setError("Не удалось выполнить поиск. Попробуй ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    handleSearch(query);
  }

  function onSuggestion(s: string) {
    setQuery(s);
    handleSearch(s);
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        aria-label="AI поиск маршрутов"
        className="fixed right-4 z-40 flex items-center gap-2 px-4 py-3 rounded-2xl text-white text-sm font-semibold shadow-lg transition-transform active:scale-95 hover:brightness-110"
        style={{
          bottom: "calc(env(safe-area-inset-bottom) + 76px)",
          backgroundColor: "#7C5CFC",
          boxShadow: "0 4px 16px 0 rgb(124 92 252 / 0.45)",
        }}
      >
        <Sparkles size={16} strokeWidth={2} />
        <span className="sm:inline hidden">Найти маршрут с ИИ</span>
        <span className="sm:hidden inline">AI поиск</span>
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl transition-transform duration-300 ease-out flex flex-col
          sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:rounded-3xl sm:w-[600px] sm:max-h-[80vh]
          ${open ? "translate-y-0 sm:-translate-y-1/2" : "translate-y-full sm:translate-y-[-40%] sm:opacity-0 sm:pointer-events-none"}`}
        style={{
          maxHeight: "90dvh",
          boxShadow: "0 -4px 40px 0 rgb(0 0 0 / 0.18)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle (mobile) */}
        <div className="sm:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-[#E4E4E7]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-3 pb-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span
              className="flex items-center justify-center w-8 h-8 rounded-xl"
              style={{ backgroundColor: "#EDE9FF" }}
            >
              <Sparkles size={16} style={{ color: "#7C5CFC" }} />
            </span>
            <div>
              <p className="text-sm font-semibold text-[#1C1C1E]">AI-поиск маршрутов</p>
              <p className="text-xs text-[#71717A]">Опиши своими словами</p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F5F4F1] text-[#71717A]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search form */}
        <form onSubmit={onSubmit} className="px-5 pb-3 flex-shrink-0">
          <div className="relative flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSearch(query);
                }
              }}
              placeholder='Например: "лёгкий маршрут 60 км в Карелии"'
              rows={2}
              className="flex-1 resize-none rounded-2xl border border-[#E4E4E7] px-4 py-3 text-sm text-[#1C1C1E] placeholder-[#A1A1AA] focus:outline-none focus:border-[#7C5CFC] focus:ring-2 focus:ring-[#7C5CFC]/20 transition-colors"
              style={{ maxHeight: 120 }}
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-white transition-all disabled:opacity-40"
              style={{ backgroundColor: "#7C5CFC" }}
            >
              {loading ? (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <ArrowUp size={18} strokeWidth={2.5} />
              )}
            </button>
          </div>
        </form>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto px-5 pb-6" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)" }}>
          {/* Suggestions (idle state) */}
          {!loading && routes === null && !error && (
            <div className="flex flex-wrap gap-2 pt-1">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => onSuggestion(s)}
                  className="text-xs px-3 py-1.5 rounded-full border border-[#E4E4E7] text-[#3F3F46] hover:border-[#7C5CFC] hover:text-[#7C5CFC] transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Loading skeleton */}
          {loading && (
            <div className="space-y-3 pt-1">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-2xl border border-[#E4E4E7] p-4 animate-pulse">
                  <div className="h-4 bg-[#F5F4F1] rounded w-3/4 mb-2" />
                  <div className="h-3 bg-[#F5F4F1] rounded w-1/2" />
                </div>
              ))}
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-red-500 pt-2">{error}</p>
          )}

          {/* No results */}
          {!loading && routes !== null && routes.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-[#71717A]">Маршрутов не нашлось 😔</p>
              <p className="text-xs text-[#A1A1AA] mt-1">Попробуй другое описание</p>
            </div>
          )}

          {/* Results */}
          {!loading && routes !== null && routes.length > 0 && (
            <div className="space-y-2.5 pt-1">
              <p className="text-xs text-[#71717A] mb-3">
                Найдено {routes.length} маршрут{routes.length === 1 ? "" : routes.length < 5 ? "а" : "ов"} по запросу «{query}»
              </p>
              {routes.map((r) => (
                <Link
                  key={r.id}
                  href={`/routes/${r.id}`}
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-3 rounded-2xl border border-[#E4E4E7] p-4 hover:border-[#7C5CFC]/40 hover:bg-[#FAFAFF] transition-colors group"
                >
                  {r.cover_url ? (
                    <img
                      src={r.cover_url}
                      alt=""
                      className="w-14 h-14 rounded-xl object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-[#F5F4F1] flex items-center justify-center flex-shrink-0">
                      <MapPin size={20} className="text-[#A1A1AA]" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#1C1C1E] truncate group-hover:text-[#7C5CFC] transition-colors">
                      {r.title}
                    </p>
                    <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1">
                      <span className="text-xs text-[#71717A] flex items-center gap-1">
                        <span className="text-[#1C1C1E] font-medium">{r.distance_km}</span> км
                      </span>
                      <span className="text-xs text-[#71717A] flex items-center gap-1">
                        <Mountain size={11} />
                        <span className="text-[#1C1C1E] font-medium">{r.elevation_m}</span> м
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${DIFFICULTY_STYLES[r.difficulty] ?? "bg-gray-50 text-gray-600"}`}
                      >
                        {DIFFICULTY_LABELS[r.difficulty] ?? r.difficulty}
                      </span>
                    </div>
                    <p className="text-xs text-[#A1A1AA] mt-1 flex items-center gap-1">
                      <MapPin size={10} />
                      {r.region}
                    </p>
                  </div>
                </Link>
              ))}

              <Link
                href="/routes"
                onClick={() => setOpen(false)}
                className="block text-center text-xs text-[#7C5CFC] font-medium py-3 hover:underline"
              >
                Смотреть все маршруты →
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
