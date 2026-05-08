"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Loader2, Trash2 } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { ImageUpload } from "@/components/routes/ImageUpload";
import { DayEditor } from "@/components/events/DayEditorLazy";
import { useAuth } from "@/lib/context/AuthContext";
import { useToast } from "@/lib/context/ToastContext";
import { supabase } from "@/lib/supabase";
import { isEmptyRichText } from "@/lib/richText";
import type { DbRideReport, RideReportVibe } from "@/lib/supabase";

const VIBES: { value: RideReportVibe; emoji: string; label: string }[] = [
  { value: "chill",   emoji: "😌", label: "Кайф" },
  { value: "push",    emoji: "💪", label: "Жарили" },
  { value: "epic",    emoji: "🔥", label: "Эпик" },
  { value: "suffer",  emoji: "😵", label: "Страдали" },
  { value: "explore", emoji: "🧭", label: "Открытие" },
];

interface Props {
  params: Promise<{ id: string; reportId: string }>;
}

export default function EditReportPage({ params }: Props) {
  const { id: routeId, reportId } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  const [vibe, setVibe] = useState<RideReportVibe | null>(null);
  const [text, setText] = useState("");
  const [riddenAt, setRiddenAt] = useState("");
  const [existingPhotos, setExistingPhotos] = useState<string[]>([]);
  const [newPhotoPreviews, setNewPhotoPreviews] = useState<string[]>([]);
  const [newPhotoFiles, setNewPhotoFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("ride_reports")
        .select("id, route_id, user_id, ride_id, ridden_at, vibe, text, photos, created_at")
        .eq("id", reportId)
        .maybeSingle();
      if (cancel) return;
      const r = data as unknown as DbRideReport | null;
      if (!r) {
        setForbidden(true);
        setLoading(false);
        return;
      }
      if (r.user_id !== user.id) {
        setForbidden(true);
        setLoading(false);
        return;
      }
      setVibe(r.vibe);
      setText(r.text ?? "");
      setRiddenAt(r.ridden_at);
      setExistingPhotos(r.photos ?? []);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [reportId, user]);

  const today = new Date().toISOString().split("T")[0];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    setSubmitting(true);
    try {
      const uploadedUrls: string[] = [];
      for (const file of newPhotoFiles) {
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

      const { error } = await supabase
        .from("ride_reports")
        .update({
          ridden_at: riddenAt,
          vibe: vibe ?? null,
          text: isEmptyRichText(text) ? null : text,
          photos: [...existingPhotos, ...uploadedUrls],
        })
        .eq("id", reportId);
      if (error) throw error;

      showToast("Отчёт обновлён!", "success");
      router.push(`/routes/${routeId}/report/${reportId}`);
    } catch {
      showToast("Не удалось сохранить — попробуй ещё раз", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!user) return;
    if (!confirm("Удалить отчёт? Это действие необратимо.")) return;
    setDeleting(true);
    const { error } = await supabase.from("ride_reports").delete().eq("id", reportId);
    if (error) {
      showToast("Не удалось удалить", "error");
      setDeleting(false);
      return;
    }
    showToast("Отчёт удалён", "success");
    router.push(`/routes/${routeId}`);
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F5F4F1]">
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-16 text-center text-[#71717A]">
          Войди, чтобы редактировать отчёт
        </main>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F4F1]">
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-16 flex justify-center">
          <Loader2 size={20} className="animate-spin text-[#A1A1AA]" />
        </main>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="min-h-screen bg-[#F5F4F1]">
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-16 text-center text-[#71717A]">
          Этот отчёт нельзя редактировать
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F4F1]">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <Link
          href={`/routes/${routeId}/report/${reportId}`}
          className="inline-flex items-center gap-1.5 text-sm text-[#71717A] hover:text-[#1C1C1E] mb-6 transition-colors"
        >
          <ChevronLeft size={16} /> К отчёту
        </Link>

        <h1 className="text-2xl font-bold text-[#1C1C1E] mb-6">Редактирование отчёта</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-2">Когда поехали</label>
            <input
              type="date"
              value={riddenAt}
              max={today}
              onChange={(e) => setRiddenAt(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-[#E4E4E7] bg-white text-sm text-[#1C1C1E] focus:outline-none focus:ring-2 focus:ring-[#F4632A]/30 focus:border-[#F4632A]"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-2">Как было</label>
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

          <div>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-2">
              Расскажи про поездку{" "}
              <span className="font-normal text-[#A1A1AA]">(необязательно)</span>
            </label>
            <DayEditor
              placeholder="Как прошло? Что запомнилось?"
              content={text}
              onChange={(html) => setText(html)}
            />
          </div>

          {existingPhotos.length > 0 && (
            <div>
              <label className="block text-sm font-semibold text-[#1C1C1E] mb-2">
                Текущие фотографии
              </label>
              <div className="grid grid-cols-3 gap-2">
                {existingPhotos.map((url, i) => (
                  <div key={i} className="relative aspect-square overflow-hidden rounded-lg border border-[#E4E4E7]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setExistingPhotos((p) => p.filter((_, idx) => idx !== i))}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center hover:bg-black/80"
                      title="Убрать"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-2">
              Добавить фотографии{" "}
              <span className="font-normal text-[#A1A1AA]">(необязательно)</span>
            </label>
            <ImageUpload
              images={newPhotoPreviews}
              onChange={(previews, files) => {
                setNewPhotoPreviews(previews);
                setNewPhotoFiles(files);
              }}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting || submitting}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-[#DC2626] border border-[#FECACA] hover:bg-[#FEF2F2] transition-colors disabled:opacity-60 inline-flex items-center gap-2"
            >
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Удалить
            </button>
            <Link
              href={`/routes/${routeId}/report/${reportId}`}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-center border border-[#E4E4E7] text-[#71717A] hover:border-[#1C1C1E] hover:text-[#1C1C1E] transition-colors"
            >
              Отмена
            </Link>
            <button
              type="submit"
              disabled={submitting || deleting}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ backgroundColor: "#F4632A" }}
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              {submitting ? "Сохраняем..." : "Сохранить"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
