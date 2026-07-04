"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Star, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/context/AuthContext";
import { useRides } from "@/lib/context/RidesContext";
import { useToast } from "@/lib/context/ToastContext";
import { ImageUpload } from "@/components/routes/ImageUpload";
import { VIBES } from "@/lib/vibes";
import type { RideReportVibe } from "@/lib/supabase";

type DateMode = "today" | "yesterday" | "custom";

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Плоский текст из textarea → HTML: каждый абзац оборачиваем в <p>…</p>. Пусто → null. */
function plainTextToHtml(text: string): string | null {
  const paragraphs = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return null;
  return paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("");
}

interface Props {
  routeId: string;
  routeTitle: string;
  routeDistanceKm?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Вызывается после успешного сабмита (проезд записан; отчёт — если был контент). */
  onPublished?: () => void;
}

/**
 * «Как прокатилось?» — единый пост-райд шит: отмечает проезд и, если райдер
 * добавил хоть что-то (настроение, оценку, фото, текст), сразу публикует отчёт.
 * Заменяет двухшаговый флоу «отметить проезд → отдельная страница отчёта».
 */
export function PostRideSheet({
  routeId,
  routeTitle,
  routeDistanceKm,
  open,
  onOpenChange,
  onPublished,
}: Props) {
  const { user } = useAuth();
  const { addRide } = useRides();
  const { showToast } = useToast();

  const today = isoDaysAgo(0);

  const [dateMode, setDateMode] = useState<DateMode>("today");
  const [customDate, setCustomDate] = useState(today);
  const [vibe, setVibe] = useState<RideReportVibe | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Ремоунт ImageUpload при сбросе формы: у него собственный внутренний стейт файлов.
  const [formKey, setFormKey] = useState(0);
  // Проезд, созданный в рамках этой сессии шита: при ретрае после ошибки
  // (например, не залилось фото) не создаём дубликат записи о проезде.
  const rideIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      rideIdRef.current = null;
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onOpenChange]);

  const hasContent =
    vibe !== null || rating !== null || photoFiles.length > 0 || text.trim().length > 0;

  const riddenAt =
    dateMode === "today" ? today : dateMode === "yesterday" ? isoDaysAgo(1) : customDate;

  function resetForm() {
    setDateMode("today");
    setCustomDate(today);
    setVibe(null);
    setRating(null);
    setPhotoPreviews([]);
    setPhotoFiles([]);
    setText("");
    setFormKey((k) => k + 1);
    rideIdRef.current = null;
  }

  async function handleSubmit() {
    if (!user || submitting) return;
    setSubmitting(true);
    try {
      // 1. Проезд (km_total обновит DB-триггер)
      let rideId = rideIdRef.current;
      if (!rideId) {
        rideId = await addRide(routeId, routeDistanceKm);
        rideIdRef.current = rideId;
      }

      // 2. Отчёт — только если есть хоть какой-то контент
      let reportCreated = false;
      if (hasContent) {
        const uploadedUrls: string[] = [];
        for (const file of photoFiles) {
          const ext = file.name.split(".").pop() ?? "jpg";
          const path = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("report-photos")
            .upload(path, file, { upsert: false });
          if (upErr) throw upErr;
          const { data: { publicUrl } } = supabase.storage
            .from("report-photos")
            .getPublicUrl(path);
          uploadedUrls.push(publicUrl);
        }

        const baseRow = {
          route_id: routeId,
          user_id: user.id,
          ride_id: rideId ?? null,
          ridden_at: riddenAt,
          vibe: vibe ?? null,
          text: plainTextToHtml(text),
          photos: uploadedUrls,
        };

        let insert = await supabase
          .from("ride_reports")
          .insert(rating != null ? { ...baseRow, rating } : baseRow)
          .select("id")
          .single();

        // Колонки rating может ещё не быть в проде (42703 / упоминание "rating"
        // в тексте ошибки). В любом сомнительном случае ретраим без rating —
        // отчёт важнее оценки и не должен теряться.
        if (insert.error && rating != null) {
          insert = await supabase.from("ride_reports").insert(baseRow).select("id").single();
        }
        if (insert.error) throw insert.error;
        reportCreated = true;

        // Уведомляем тех, кто отметил «Хочу» на этот маршрут (fire-and-forget)
        if (insert.data?.id) {
          supabase.functions.invoke("email-notify", {
            body: { mode: "route_report_for_interest", reportId: insert.data.id },
          });
        }
      }

      showToast(reportCreated ? "Отчёт опубликован!" : "Проезд записан!", "success");
      onPublished?.();
      resetForm();
      onOpenChange(false);
    } catch {
      // Шит не закрываем — форма сохранена, можно ретраить (проезд уже не задублируется)
      showToast("Не удалось сохранить — попробуй ещё раз", "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const dateChips: { mode: DateMode; label: string }[] = [
    { mode: "today", label: "Сегодня" },
    { mode: "yesterday", label: "Вчера" },
    { mode: "custom", label: "Дата" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 sm:max-w-md sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Отметить проезд: ${routeTitle}`}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-[#1C1C1E]">Как прокатилось?</h3>
            <p className="mt-0.5 truncate text-xs text-[#A1A1AA]">{routeTitle}</p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="shrink-0 rounded-full p-1.5 text-[#71717A] transition-colors hover:bg-[#F5F4F1] hover:text-[#1C1C1E]"
            aria-label="Закрыть"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Дата */}
          <div>
            <div className="flex gap-2">
              {dateChips.map(({ mode, label }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setDateMode(mode)}
                  className="rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors"
                  style={
                    dateMode === mode
                      ? { backgroundColor: "#1C1C1E", color: "white", borderColor: "#1C1C1E" }
                      : { backgroundColor: "white", color: "#3F3F46", borderColor: "#E4E4E7" }
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            {dateMode === "custom" && (
              <input
                type="date"
                value={customDate}
                max={today}
                onChange={(e) => setCustomDate(e.target.value)}
                className="mt-2 w-full rounded-xl border border-[#E4E4E7] bg-white px-4 py-2.5 text-sm text-[#1C1C1E] focus:border-[#F4632A] focus:outline-none focus:ring-2 focus:ring-[#F4632A]/30"
              />
            )}
          </div>

          {/* Настроение */}
          <div>
            <div className="flex flex-wrap gap-2">
              {VIBES.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  onClick={() => setVibe(vibe === v.value ? null : v.value)}
                  className="flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors"
                  style={
                    vibe === v.value
                      ? { backgroundColor: "#F4632A", color: "white", borderColor: "#F4632A" }
                      : { backgroundColor: "white", color: "#3F3F46", borderColor: "#E4E4E7" }
                  }
                >
                  {v.emoji} {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Оценка маршрута */}
          <div>
            <span className="mb-1.5 block text-sm font-semibold text-[#1C1C1E]">
              Оценка маршрута
            </span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setRating(rating === i ? null : i)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-[#F5F4F1]"
                  aria-label={`Оценка ${i} из 5`}
                >
                  <Star
                    size={24}
                    fill={rating != null && i <= rating ? "#F4632A" : "none"}
                    style={{ color: rating != null && i <= rating ? "#F4632A" : "#D4D4D8" }}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Фото */}
          <ImageUpload
            key={formKey}
            images={photoPreviews}
            onChange={(previews, files) => {
              setPhotoPreviews(previews);
              setPhotoFiles(files);
            }}
          />

          {/* Текст */}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Пара слов: покрытие, трафик, где кофе…"
            className="w-full resize-none rounded-xl border border-[#E4E4E7] bg-white px-4 py-2.5 text-sm text-[#1C1C1E] placeholder:text-[#A1A1AA] focus:border-[#F4632A] focus:outline-none focus:ring-2 focus:ring-[#F4632A]/30"
          />

          <div>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: "#1C1C1E" }}
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              {submitting
                ? "Сохраняем..."
                : hasContent
                  ? "Опубликовать отчёт"
                  : "Отметить проезд"}
            </button>
            <p className="mt-2 text-center text-xs text-[#A1A1AA]">
              Засчитается как проезд — попадёт в вашу статистику и в отчёты маршрута.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
