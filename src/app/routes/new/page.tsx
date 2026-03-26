"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { MapPin, Link as LinkIcon, ChevronRight, AlertCircle } from "lucide-react";
import { ImageUpload } from "@/components/routes/ImageUpload";
import { CoverUpload } from "@/components/routes/CoverUpload";
import { useAuth } from "@/lib/context/AuthContext";
import { supabase } from "@/lib/supabase";
import type { RouteType, Difficulty } from "@/types";
import Link from "next/link";

const ROUTE_TYPES: { value: RouteType; label: string }[] = [
  { value: "road",   label: "Шоссе" },
  { value: "gravel", label: "Гревел" },
  { value: "mtb",    label: "МТБ" },
  { value: "urban",  label: "Городской" },
];

const DIFFICULTIES: { value: Difficulty; label: string; emoji: string }[] = [
  { value: "easy",   label: "Лёгкий",  emoji: "⭐" },
  { value: "medium", label: "Средний", emoji: "🔥" },
  { value: "hard",   label: "Сложный", emoji: "💪" },
];

export default function NewRoutePage() {
  const router = useRouter();
  const { user, profile } = useAuth();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mapUrl, setMapUrl] = useState("");
  const [region, setRegion] = useState("");
  const [distance, setDistance] = useState("");
  const [elevation, setElevation] = useState("");
  const [duration, setDuration] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [routeTypes, setRouteTypes] = useState<RouteType[]>([]);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const toggleType = (type: RouteType) => {
    setRouteTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleImages = (previews: string[], files: File[]) => {
    setImagePreviews(previews);
    setImageFiles(files);
  };

  const canSubmit = title.trim() && routeTypes.length > 0 && !submitting;

  // Build mapmagic embed URL from regular URL
  const buildEmbedUrl = (url: string) => {
    if (!url) return null;
    try {
      const u = new URL(url);
      u.searchParams.set("embed", "1");
      return u.toString();
    } catch {
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setError("");

    // 1. Insert route
    const { data: routeData, error: routeError } = await supabase
      .from("routes")
      .insert({
        author_id: user.id,
        title: title.trim(),
        description: description.trim(),
        region: region.trim(),
        distance_km: parseFloat(distance) || 0,
        elevation_m: parseInt(elevation) || 0,
        duration_min: parseInt(duration) || 0,
        difficulty,
        surface: [],
        bike_types: [],
        route_types: routeTypes,
        tags: [],
        mapmagic_url: mapUrl || null,
        mapmagic_embed: buildEmbedUrl(mapUrl),
        likes_count: 0,
        riders_today: 0,
      })
      .select()
      .single();

    if (routeError || !routeData) {
      setError("Не удалось сохранить маршрут. Попробуй ещё раз.");
      setSubmitting(false);
      return;
    }

    // 2. Upload cover image
    if (coverFile) {
      const ext = coverFile.name.split(".").pop();
      const path = `${routeData.id}/cover.${ext}`;
      const { data: uploadData } = await supabase.storage
        .from("route-images")
        .upload(path, coverFile, { upsert: true });
      if (uploadData) {
        const { data: { publicUrl } } = supabase.storage.from("route-images").getPublicUrl(path);
        await supabase.from("routes").update({ cover_url: publicUrl }).eq("id", routeData.id);
      }
    }

    // 3. Upload images to Supabase Storage
    for (const file of imageFiles) {
      const ext = file.name.split(".").pop();
      const path = `${routeData.id}/${Date.now()}.${ext}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("route-images")
        .upload(path, file, { upsert: false });

      if (!uploadError && uploadData) {
        const { data: { publicUrl } } = supabase.storage
          .from("route-images")
          .getPublicUrl(path);

        await supabase.from("route_images").insert({
          route_id: routeData.id,
          url: publicUrl,
          storage_path: path,
        });
      }
    }

    // 4. Update author's routes_count
    await supabase
      .from("profiles")
      .update({ routes_count: (profile?.routes_count ?? 0) + 1 })
      .eq("id", user.id);

    router.push(`/routes/${routeData.id}`);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F5F4F1]">
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-20 text-center">
          <AlertCircle size={48} className="mx-auto mb-4 text-[#F4632A]" />
          <h2 className="text-xl font-bold text-[#1C1C1E] mb-2">Нужна авторизация</h2>
          <p className="text-[#71717A] mb-6">Чтобы добавить маршрут, войди в аккаунт</p>
          <Link href="/auth/login"
            className="inline-block px-6 py-3 rounded-xl text-white text-sm font-semibold"
            style={{ backgroundColor: "#F4632A" }}>
            Войти
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F4F1]">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#1C1C1E] mb-1">Новый маршрут</h1>
          <p className="text-[#71717A] text-sm">Добавь маршрут и поделись им с сообществом</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          {/* Title */}
          <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-2">Название маршрута *</label>
            <input type="text" placeholder="Например: Карельская тишина"
              value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors" />
          </div>

          {/* Route type */}
          <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-1">Тип маршрута *</label>
            <p className="text-xs text-[#71717A] mb-3">Можно выбрать несколько</p>
            <div className="flex flex-wrap gap-2">
              {ROUTE_TYPES.map(({ value, label }) => (
                <button type="button" key={value} onClick={() => toggleType(value)}
                  className="px-4 py-2 rounded-xl text-sm font-medium transition-colors border"
                  style={routeTypes.includes(value)
                    ? { backgroundColor: "#1C1C1E", color: "white", borderColor: "#1C1C1E" }
                    : { backgroundColor: "white", color: "#71717A", borderColor: "#E4E4E7" }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty */}
          <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-3">Сложность *</label>
            <div className="flex gap-3">
              {DIFFICULTIES.map(({ value, label, emoji }) => (
                <button type="button" key={value} onClick={() => setDifficulty(value)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors border text-center"
                  style={difficulty === value
                    ? { backgroundColor: "#F4632A", color: "white", borderColor: "#F4632A" }
                    : { backgroundColor: "white", color: "#71717A", borderColor: "#E4E4E7" }}>
                  {emoji} {label}
                </button>
              ))}
            </div>
          </div>

          {/* Map URL */}
          <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-1">
              <span className="flex items-center gap-2"><LinkIcon size={15} /> Ссылка на маршрут</span>
            </label>
            <p className="text-xs text-[#71717A] mb-3">Вставь ссылку из MapMagic, Komoot или другого планировщика</p>
            <input type="url" placeholder="https://mapmagic.app/map?routes=..."
              value={mapUrl} onChange={(e) => setMapUrl(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors font-mono" />
          </div>

          {/* Details */}
          <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-3">Детали</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#71717A] mb-1 block flex items-center gap-1"><MapPin size={11} /> Регион</label>
                <input type="text" placeholder="Карелия" value={region} onChange={(e) => setRegion(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors" />
              </div>
              <div>
                <label className="text-xs text-[#71717A] mb-1 block">Дистанция, км</label>
                <input type="number" placeholder="98" value={distance} onChange={(e) => setDistance(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors" />
              </div>
              <div>
                <label className="text-xs text-[#71717A] mb-1 block">Набор высоты, м</label>
                <input type="number" placeholder="450" value={elevation} onChange={(e) => setElevation(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors" />
              </div>
              <div>
                <label className="text-xs text-[#71717A] mb-1 block">Время, мин</label>
                <input type="number" placeholder="240" value={duration} onChange={(e) => setDuration(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors" />
              </div>
            </div>
          </div>

          {/* Cover */}
          <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-1">Обложка</label>
            <p className="text-xs text-[#71717A] mb-3">Горизонтальное фото — отображается в карточке маршрута</p>
            <CoverUpload value={coverPreview} onChange={(preview, file) => { setCoverPreview(preview); setCoverFile(file); }} />
          </div>

          {/* Photos */}
          <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-1">Фотографии</label>
            <p className="text-xs text-[#71717A] mb-3">Покажи, как выглядит маршрут</p>
            <ImageUpload images={imagePreviews} onChange={handleImages} />
          </div>

          {/* Description */}
          <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-2">Описание</label>
            <textarea placeholder="Расскажи о маршруте: что увидит велосипедист, какое покрытие, особенности..."
              value={description} onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full px-4 py-2.5 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors resize-none" />
          </div>

          <button type="submit" disabled={!canSubmit}
            className="w-full py-3.5 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 transition-opacity"
            style={canSubmit
              ? { backgroundColor: "#1C1C1E", color: "white" }
              : { backgroundColor: "#E4E4E7", color: "#A1A1AA" }}>
            {submitting ? "Публикую..." : "Опубликовать маршрут"} {!submitting && <ChevronRight size={16} />}
          </button>
        </form>
      </main>
    </div>
  );
}
