"use client";

import { useState, use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { MapPin, Link as LinkIcon, ChevronRight, AlertCircle, ChevronLeft } from "lucide-react";
import { ImageUpload } from "@/components/routes/ImageUpload";
import { CoverUpload } from "@/components/routes/CoverUpload";
import { DayEditor } from "@/components/events/DayEditor";
import { useAuth } from "@/lib/context/AuthContext";
import { supabase, proxyImageUrl } from "@/lib/supabase";
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

export default function EditRoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mapUrl, setMapUrl] = useState("");
  const [region, setRegion] = useState("");
  const [distance, setDistance] = useState("");
  const [elevation, setElevation] = useState("");
  const [duration, setDuration] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [routeTypes, setRouteTypes] = useState<RouteType[]>([]);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [existingImages, setExistingImages] = useState<{ url: string; storage_path: string }[]>([]);
  const [newImageFiles, setNewImageFiles] = useState<File[]>([]);
  const [newImagePreviews, setNewImagePreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user === undefined) return;
    async function load() {
      const { data, error: fetchError } = await supabase
        .from("routes")
        .select("*, route_images(url, storage_path)")
        .eq("id", id)
        .single();

      if (fetchError || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      if (data.author_id !== user?.id) {
        setUnauthorized(true);
        setLoading(false);
        return;
      }

      setTitle(data.title ?? "");
      setDescription(data.description ?? "");
      setMapUrl(data.mapmagic_url ?? "");
      setRegion(data.region ?? "");
      setDistance(data.distance_km ? String(data.distance_km) : "");
      setElevation(data.elevation_m ? String(data.elevation_m) : "");
      setDuration(data.duration_min ? String(data.duration_min) : "");
      setDifficulty(data.difficulty ?? "medium");
      setRouteTypes(data.route_types ?? []);
      setCoverPreview(data.cover_url ?? null);
      setExistingImages(data.route_images ?? []);
      setLoading(false);
    }
    load();
  }, [id, user]);

  const toggleType = (type: RouteType) => {
    setRouteTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleNewImages = (previews: string[], files: File[]) => {
    setNewImagePreviews(previews);
    setNewImageFiles(files);
  };

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

  const canSubmit = title.trim() && routeTypes.length > 0 && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setError("");

    const { error: updateError } = await supabase
      .from("routes")
      .update({
        title: title.trim(),
        description: description.trim(),
        region: region.trim(),
        distance_km: parseFloat(distance) || 0,
        elevation_m: parseInt(elevation) || 0,
        duration_min: parseInt(duration) || 0,
        difficulty,
        route_types: routeTypes,
        mapmagic_url: mapUrl || null,
        mapmagic_embed: buildEmbedUrl(mapUrl),
      })
      .eq("id", id);

    if (updateError) {
      setError("Не удалось сохранить изменения. Попробуй ещё раз.");
      setSubmitting(false);
      return;
    }

    // Upload cover if changed
    if (coverFile) {
      const ext = coverFile.name.split(".").pop();
      const path = `${id}/cover.${ext}`;
      const { data: uploadData } = await supabase.storage
        .from("route-images")
        .upload(path, coverFile, { upsert: true });
      if (uploadData) {
        const { data: { publicUrl } } = supabase.storage.from("route-images").getPublicUrl(path);
        await supabase.from("routes").update({ cover_url: publicUrl }).eq("id", id);
      }
    } else if (coverPreview === null) {
      // Cover was removed
      await supabase.from("routes").update({ cover_url: null }).eq("id", id);
    }

    for (const file of newImageFiles) {
      const ext = file.name.split(".").pop();
      const path = `${id}/${Date.now()}.${ext}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("route-images")
        .upload(path, file, { upsert: false });

      if (!uploadError && uploadData) {
        const { data: { publicUrl } } = supabase.storage
          .from("route-images")
          .getPublicUrl(path);

        await supabase.from("route_images").insert({
          route_id: id,
          url: publicUrl,
          storage_path: path,
        });
      }
    }

    router.push(`/routes/${id}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F4F1]">
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-8">
          <div className="h-96 bg-white rounded-2xl animate-pulse border border-[#E4E4E7]" />
        </main>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#F5F4F1]">
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-20 text-center">
          <div className="text-4xl mb-3">🗺️</div>
          <h2 className="text-xl font-bold text-[#1C1C1E] mb-2">Маршрут не найден</h2>
          <Link href="/routes" className="text-sm text-[#F4632A] hover:underline">← Все маршруты</Link>
        </main>
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div className="min-h-screen bg-[#F5F4F1]">
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-20 text-center">
          <AlertCircle size={48} className="mx-auto mb-4 text-[#F4632A]" />
          <h2 className="text-xl font-bold text-[#1C1C1E] mb-2">Нет доступа</h2>
          <p className="text-[#71717A] mb-6">Редактировать можно только свои маршруты</p>
          <Link href={`/routes/${id}`} className="text-sm text-[#F4632A] hover:underline">← К маршруту</Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F4F1]">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-10">
        <Link href={`/routes/${id}`} className="inline-flex items-center gap-1.5 text-sm text-[#71717A] hover:text-[#1C1C1E] mb-6 transition-colors">
          <ChevronLeft size={16} /> К маршруту
        </Link>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#1C1C1E] mb-1">Редактировать маршрут</h1>
          <p className="text-[#71717A] text-sm">Измени данные и сохрани</p>
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
                <label className="text-xs text-[#71717A] mb-1 block"><MapPin size={11} className="inline mr-1" />Регион</label>
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
            <p className="text-xs text-[#71717A] mb-3">Фото обложки — отображается в карточке маршрута</p>
            <CoverUpload value={coverPreview} onChange={(preview, file) => { setCoverPreview(preview); setCoverFile(file); }} />
          </div>

          {/* Existing photos */}
          {existingImages.length > 0 && (
            <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
              <label className="block text-sm font-semibold text-[#1C1C1E] mb-3">Текущие фотографии</label>
              <div className="flex flex-wrap gap-2">
                {existingImages.map((img) => (
                  <img key={img.url} src={proxyImageUrl(img.url) ?? img.url} alt="" className="w-24 h-24 object-cover rounded-xl border border-[#E4E4E7]" />
                ))}
              </div>
            </div>
          )}

          {/* New photos */}
          <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-1">Добавить фотографии</label>
            <p className="text-xs text-[#71717A] mb-3">Новые фото добавятся к существующим</p>
            <ImageUpload images={newImagePreviews} onChange={handleNewImages} />
          </div>

          {/* Description */}
          <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-2">Описание</label>
            <DayEditor
              key="route-description"
              content={description}
              placeholder="Расскажи о маршруте: что увидит велосипедист, какое покрытие, особенности..."
              onChange={(html) => setDescription(html)}
            />
          </div>

          <button type="submit" disabled={!canSubmit}
            className="w-full py-3.5 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 transition-opacity"
            style={canSubmit
              ? { backgroundColor: "#1C1C1E", color: "white" }
              : { backgroundColor: "#E4E4E7", color: "#A1A1AA" }}>
            {submitting ? "Сохраняю..." : "Сохранить изменения"} {!submitting && <ChevronRight size={16} />}
          </button>
        </form>
      </main>
    </div>
  );
}
