"use client";

import { useState, use, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Loader2 } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { ImageUpload } from "@/components/routes/ImageUpload";
import { DayEditor } from "@/components/events/DayEditorLazy";
import { useAuth } from "@/lib/context/AuthContext";
import { useToast } from "@/lib/context/ToastContext";
import { supabase } from "@/lib/supabase";
import { isEmptyRichText } from "@/lib/richText";
import type { RideReportVibe } from "@/lib/supabase";

const VIBES: { value: RideReportVibe; emoji: string; label: string }[] = [
  { value: "chill",   emoji: "😌", label: "Кайф" },
  { value: "push",    emoji: "💪", label: "Жарили" },
  { value: "epic",    emoji: "🔥", label: "Эпик" },
  { value: "suffer",  emoji: "😵", label: "Страдали" },
  { value: "explore", emoji: "🧭", label: "Открытие" },
];

interface Props {
  params: Promise<{ id: string }>;
}

export default function NewReportPage({ params }: Props) {
  const { id: routeId } = use(params);
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F5F4F1]"><Header /></div>}>
      <ReportForm routeId={routeId} />
    </Suspense>
  );
}

function ReportForm({ routeId }: { routeId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rideId = searchParams.get("rideId");

  const { user } = useAuth();
  const { showToast } = useToast();

  const today = new Date().toISOString().split("T")[0];

  const [vibe, setVibe] = useState<RideReportVibe | null>(null);
  const [text, setText] = useState("");
  const [riddenAt, setRiddenAt] = useState(today);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    setSubmitting(true);
    try {
      // 1. Upload photos
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

      // 2. Insert report
      const { data: reportData, error } = await supabase.from("ride_reports").insert({
        route_id: routeId,
        user_id: user.id,
        ride_id: rideId ?? null,
        ridden_at: riddenAt,
        vibe: vibe ?? null,
        text: isEmptyRichText(text) ? null : text,
        photos: uploadedUrls,
      }).select("id").single();
      if (error) throw error;

      // Уведомляем тех, кто отметил «Хочу» на этот маршрут (fire-and-forget)
      if (reportData?.id) {
        supabase.functions.invoke("email-notify", {
          body: { mode: "route_report_for_interest", reportId: reportData.id },
        });
      }

      showToast("Отчёт опубликован!", "success");
      router.push(`/routes/${routeId}`);
    } catch {
      showToast("Не удалось сохранить — попробуй ещё раз", "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F5F4F1]">
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-16 text-center text-[#71717A]">
          Войди, чтобы написать отчёт
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F4F1]">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <Link
          href={`/routes/${routeId}`}
          className="inline-flex items-center gap-1.5 text-sm text-[#71717A] hover:text-[#1C1C1E] mb-6 transition-colors"
        >
          <ChevronLeft size={16} /> Назад к маршруту
        </Link>

        <h1 className="text-2xl font-bold text-[#1C1C1E] mb-6">Отчёт о поездке</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Date */}
          <div>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-2">
              Когда поехали
            </label>
            <input
              type="date"
              value={riddenAt}
              max={today}
              onChange={(e) => setRiddenAt(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-[#E4E4E7] bg-white text-sm text-[#1C1C1E] focus:outline-none focus:ring-2 focus:ring-[#F4632A]/30 focus:border-[#F4632A]"
            />
          </div>

          {/* Vibe */}
          <div>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-2">
              Как было
            </label>
            <div className="flex flex-wrap gap-2">
              {VIBES.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  onClick={() => setVibe(vibe === v.value ? null : v.value)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors border"
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

          {/* Text */}
          <div>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-2">
              Расскажи про поездку{" "}
              <span className="font-normal text-[#A1A1AA]">(необязательно)</span>
            </label>
            <DayEditor
              placeholder="Как прошло? Что запомнилось? Есть ли что посоветовать тем, кто поедет этим маршрутом?"
              content={text}
              onChange={(html) => setText(html)}
            />
          </div>

          {/* Photos */}
          <div>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-2">
              Фотографии{" "}
              <span className="font-normal text-[#A1A1AA]">(необязательно)</span>
            </label>
            <ImageUpload
              images={photoPreviews}
              onChange={(previews, files) => {
                setPhotoPreviews(previews);
                setPhotoFiles(files);
              }}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Link
              href={`/routes/${routeId}`}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-center border border-[#E4E4E7] text-[#71717A] hover:border-[#1C1C1E] hover:text-[#1C1C1E] transition-colors"
            >
              Отмена
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ backgroundColor: "#F4632A" }}
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              {submitting ? "Публикуем..." : "Опубликовать отчёт"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
