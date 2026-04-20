"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { MapPin, Link as LinkIcon, ChevronRight, AlertCircle } from "lucide-react";
import { ImageUpload } from "@/components/routes/ImageUpload";
import { CoverUpload } from "@/components/routes/CoverUpload";
import { GpxUpload } from "@/components/routes/GpxUpload";
import { ExitPointsEditor, type ExitPointDraft } from "@/components/routes/ExitPointsEditor";
import { DayEditor } from "@/components/events/DayEditorLazy";
import { useAuth } from "@/lib/context/AuthContext";
import { useToast } from "@/lib/context/ToastContext";
import { useAchievements } from "@/lib/context/AchievementsContext";
import { supabase } from "@/lib/supabase";
import { parseGpxFile, computeGpxStats, toWktPoint, toWktLinestring } from "@/lib/gpx";
import { ROUTE_TYPES, DIFFICULTIES, SURFACES, BIKE_TYPES } from "@/constants/routes";
import type { RouteType, Difficulty, Surface, BikeType, ExitPointsStatus } from "@/types";
import Link from "next/link";

export default function NewRoutePage() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const { showToast } = useToast();
  const { checkAndAward } = useAchievements();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mapUrl, setMapUrl] = useState("");
  const [region, setRegion] = useState("");
  const [regions, setRegions] = useState<string[]>([]);
  const [distance, setDistance] = useState("");
  const [elevation, setElevation] = useState("");
  const [duration, setDuration] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [routeTypes, setRouteTypes] = useState<RouteType[]>([]);
  const [surfaces, setSurfaces] = useState<Surface[]>([]);
  const [bikeTypes, setBikeTypes] = useState<BikeType[]>([]);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [gpxFile, setGpxFile] = useState<File | null>(null);
  const [exitStatus, setExitStatus] = useState<ExitPointsStatus>("unknown");
  const [exitPoints, setExitPoints] = useState<ExitPointDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    supabase
      .from("regions")
      .select("name")
      .order("name")
      .then(({ data }) => {
        if (data) setRegions(data.map((r) => r.name));
      });
  }, []);

  const toggleType = (type: RouteType) => {
    setRouteTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const toggleSurface = (s: Surface) => {
    setSurfaces((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  };

  const toggleBikeType = (b: BikeType) => {
    setBikeTypes((prev) =>
      prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]
    );
  };

  const handleImages = (previews: string[], files: File[]) => {
    setImagePreviews(previews);
    setImageFiles(files);
  };

  const handleGpxChange = async (file: File | null) => {
    setGpxFile(file);
    if (!file) return;
    try {
      const { trackpoints } = await parseGpxFile(file);
      const stats = computeGpxStats(trackpoints);
      if (stats.distanceKm > 0) setDistance(String(stats.distanceKm));
      if (stats.elevationM > 0) setElevation(String(stats.elevationM));
      if (stats.durationMin > 0) setDuration(String(stats.durationMin));
    } catch {
      // Non-critical — fields stay empty
    }
  };

  const canSubmit = title.trim() && routeTypes.length > 0 && !submitting;

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
    setAttempted(true);
    if (!canSubmit) return;
    if (!user) return;
    setSubmitting(true);
    setError("");

    const { data: routeData, error: routeError } = await supabase
      .from("routes")
      .insert({
        author_id: user.id,
        title: title.trim(),
        description: description.trim(),
        region: region || null,
        distance_km: parseFloat(distance) || 0,
        elevation_m: parseInt(elevation) || 0,
        duration_min: parseInt(duration) || 0,
        difficulty,
        surface: surfaces,
        bike_types: bikeTypes,
        route_types: routeTypes,
        tags: [],
        mapmagic_url: mapUrl || null,
        mapmagic_embed: buildEmbedUrl(mapUrl),
        exit_points_status: exitStatus,
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

    // GPX upload (optional)
    if (gpxFile) {
      const path = `${routeData.id}/route.gpx`;
      const { error: gpxError } = await supabase.storage
        .from("route-gpx")
        .upload(path, gpxFile, { upsert: true, contentType: "application/gpx+xml" });
      if (!gpxError) {
        await supabase.from("routes").update({ gpx_path: path }).eq("id", routeData.id);
        try {
          const { startPoint, trackpoints } = await parseGpxFile(gpxFile);
          if (startPoint) {
            await supabase.rpc("update_route_geometry", {
              route_id: routeData.id,
              start_wkt: toWktPoint(startPoint.lat, startPoint.lng),
              line_wkt: toWktLinestring(trackpoints) ?? undefined,
            });
          }
        } catch {
          // Non-critical — geometry extraction failed, proximity search won't work for this route
        }
      }
    }

    // Exit points (optional)
    if (exitStatus === "has" && exitPoints.length > 0) {
      const rows = exitPoints
        .filter((p) => p.title.trim().length > 0)
        .map((p, idx) => ({
          route_id: routeData.id,
          order_idx: idx,
          title: p.title.trim(),
          kind: p.kind,
          distance_km_from_start: p.distance_km_from_start === "" ? null : Number(p.distance_km_from_start),
          note: p.note.trim() || null,
        }));
      if (rows.length > 0) {
        await supabase.from("route_exit_points").insert(rows);
      }
    }

    await supabase
      .from("profiles")
      .update({ routes_count: (profile?.routes_count ?? 0) + 1 })
      .eq("id", user.id);

    showToast("Маршрут опубликован!", "success");
    checkAndAward("route_created", { routesCount: (profile?.routes_count ?? 0) + 1 });
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
          <div className={`bg-white rounded-2xl p-5 border ${attempted && !title.trim() ? "border-red-300" : "border-[#E4E4E7]"}`} style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-2">Название маршрута *</label>
            <input type="text" placeholder="Например: Карельская тишина"
              value={title} onChange={(e) => setTitle(e.target.value)}
              className={`w-full px-4 py-2.5 rounded-xl border text-sm outline-none focus:border-[#F4632A] transition-colors ${attempted && !title.trim() ? "border-red-300" : "border-[#E4E4E7]"}`} />
            {attempted && !title.trim() && (
              <p className="text-xs text-red-500 mt-1.5">Введи название маршрута</p>
            )}
          </div>

          {/* Route type */}
          <div className={`bg-white rounded-2xl p-5 border ${attempted && routeTypes.length === 0 ? "border-red-300" : "border-[#E4E4E7]"}`} style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
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
            {attempted && routeTypes.length === 0 && (
              <p className="text-xs text-red-500 mt-2">Выбери хотя бы один тип маршрута</p>
            )}
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

          {/* Surface */}
          <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-1">Покрытие</label>
            <p className="text-xs text-[#71717A] mb-3">Можно выбрать несколько</p>
            <div className="flex flex-wrap gap-2">
              {SURFACES.map(({ value, label }) => (
                <button type="button" key={value} onClick={() => toggleSurface(value)}
                  className="px-4 py-2 rounded-xl text-sm font-medium transition-colors border"
                  style={surfaces.includes(value)
                    ? { backgroundColor: "#1C1C1E", color: "white", borderColor: "#1C1C1E" }
                    : { backgroundColor: "white", color: "#71717A", borderColor: "#E4E4E7" }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Bike types */}
          <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-1">Тип велосипеда</label>
            <p className="text-xs text-[#71717A] mb-3">Для каких велосипедов подходит маршрут</p>
            <div className="flex flex-wrap gap-2">
              {BIKE_TYPES.map(({ value, label }) => (
                <button type="button" key={value} onClick={() => toggleBikeType(value)}
                  className="px-4 py-2 rounded-xl text-sm font-medium transition-colors border"
                  style={bikeTypes.includes(value)
                    ? { backgroundColor: "#1C1C1E", color: "white", borderColor: "#1C1C1E" }
                    : { backgroundColor: "white", color: "#71717A", borderColor: "#E4E4E7" }}>
                  {label}
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

          {/* GPX file */}
          <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-1">GPX-файл</label>
            <p className="text-xs text-[#71717A] mb-3">Экспортируй из MapMagic и загрузи — пользователи смогут скачать его одной кнопкой</p>
            <GpxUpload currentName={gpxFile?.name ?? null} onChange={handleGpxChange} />
          </div>

          {/* Exit points */}
          <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-1">Точки схода с маршрута</label>
            <p className="text-xs text-[#71717A] mb-3">Где можно сойти при поломке, плохой погоде или усталости</p>
            <ExitPointsEditor
              status={exitStatus}
              onStatusChange={setExitStatus}
              points={exitPoints}
              onPointsChange={setExitPoints}
            />
          </div>

          {/* Details */}
          <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-3">Детали</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="text-xs text-[#71717A] mb-1 block flex items-center gap-1"><MapPin size={11} /> Регион</label>
                <select value={region} onChange={(e) => setRegion(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E4E4E7] bg-white text-sm outline-none focus:border-[#F4632A] transition-colors appearance-none cursor-pointer"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23A1A1AA' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 12px center",
                  }}>
                  <option value="">Не указан</option>
                  {regions.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
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

          {/* Photos */}
          <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-1">Фотографии</label>
            <p className="text-xs text-[#71717A] mb-3">Покажи, как выглядит маршрут</p>
            <ImageUpload images={imagePreviews} onChange={handleImages} />
          </div>

          {/* Description */}
          <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-2">Описание</label>
            <DayEditor
              placeholder="Расскажи о маршруте: что увидит велосипедист, какое покрытие, особенности..."
              onChange={(html) => setDescription(html)}
            />
          </div>

          <div>
            <button type="submit"
              className="w-full py-3.5 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 transition-opacity"
              style={canSubmit
                ? { backgroundColor: "#1C1C1E", color: "white" }
                : { backgroundColor: "#E4E4E7", color: "#A1A1AA" }}>
              {submitting ? "Публикую..." : "Опубликовать маршрут"} {!submitting && <ChevronRight size={16} />}
            </button>
            {attempted && !canSubmit && (
              <p className="text-xs text-[#71717A] text-center mt-2">
                {!title.trim() && !routeTypes.length
                  ? "Заполни название и выбери тип маршрута"
                  : !title.trim()
                  ? "Заполни название маршрута"
                  : "Выбери тип маршрута"}
              </p>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}
