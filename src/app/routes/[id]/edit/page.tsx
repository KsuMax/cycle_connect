"use client";

import { useState, use, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { MapPin, Link as LinkIcon, ChevronRight, AlertCircle, ChevronLeft, Shield, X } from "lucide-react";
import { ImageUpload } from "@/components/routes/ImageUpload";
import { CoverUpload } from "@/components/routes/CoverUpload";
import { GpxUpload } from "@/components/routes/GpxUpload";
import { ExitPointsEditor, type ExitPointDraft } from "@/components/routes/ExitPointsEditor";
import { DayEditor } from "@/components/events/DayEditorLazy";
import { useAuth } from "@/lib/context/AuthContext";
import { supabase, proxyImageUrl } from "@/lib/supabase";
import { parseGpxFile, computeGpxStats, toWktPoint, toWktLinestring } from "@/lib/gpx";
import { ROUTE_TYPES, DIFFICULTIES, SURFACES, BIKE_TYPES } from "@/constants/routes";
import type { RouteType, Difficulty, Surface, BikeType, ExitPointsStatus } from "@/types";
import Link from "next/link";

interface CaptainClub { id: string; name: string }

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
  const [regions, setRegions] = useState<string[]>([]);
  const [distance, setDistance] = useState("");
  const [elevation, setElevation] = useState("");
  const [duration, setDuration] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [routeTypes, setRouteTypes] = useState<RouteType[]>([]);
  const [surfaces, setSurfaces] = useState<Surface[]>([]);
  const [bikeTypes, setBikeTypes] = useState<BikeType[]>([]);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [existingImages, setExistingImages] = useState<{ url: string; storage_path: string }[]>([]);
  const [newImageFiles, setNewImageFiles] = useState<File[]>([]);
  const [newImagePreviews, setNewImagePreviews] = useState<string[]>([]);
  const [existingGpxPath, setExistingGpxPath] = useState<string | null>(null);
  const [gpxFile, setGpxFile] = useState<File | null>(null);
  const [gpxCleared, setGpxCleared] = useState(false);
  const [exitStatus, setExitStatus] = useState<ExitPointsStatus>("unknown");
  const [exitPoints, setExitPoints] = useState<ExitPointDraft[]>([]);
  const [clubId, setClubId] = useState<string | null>(null);
  const [captainClubs, setCaptainClubs] = useState<CaptainClub[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase
      .from("regions")
      .select("name")
      .order("name")
      .then(({ data }) => {
        if (data) setRegions(data.map((r) => r.name));
      });
  }, []);

  useEffect(() => {
    if (user === undefined) return;
    async function load() {
      const { data, error: fetchError } = await supabase
        .from("routes")
        .select("*, club_id, route_images(url, storage_path), route_exit_points(*)")
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
      setSurfaces(data.surface ?? []);
      setBikeTypes(data.bike_types ?? []);
      setCoverPreview(data.cover_url ?? null);
      setExistingImages(data.route_images ?? []);
      setExistingGpxPath(data.gpx_path ?? null);
      setExitStatus(data.exit_points_status ?? "unknown");
      const pts = (data.route_exit_points ?? []) as Array<{
        id: string;
        title: string;
        kind: "train" | "bus" | "taxi" | "road" | "other";
        distance_km_from_start: number | null;
        note: string | null;
        order_idx: number;
      }>;
      setExitPoints(
        pts
          .slice()
          .sort((a, b) => a.order_idx - b.order_idx)
          .map((p) => ({
            id: p.id,
            title: p.title,
            kind: p.kind,
            distance_km_from_start: p.distance_km_from_start != null ? String(p.distance_km_from_start) : "",
            note: p.note ?? "",
          }))
      );
      setClubId((data as { club_id?: string | null }).club_id ?? null);

      // Load clubs where user is owner/admin/captain
      const { data: memberships } = await supabase
        .from("club_members")
        .select("club:clubs!club_id(id, name)")
        .eq("user_id", user!.id)
        .eq("status", "active")
        .in("role", ["owner", "admin", "captain"]);
      if (memberships) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setCaptainClubs((memberships as any[]).map((m) => m.club).filter(Boolean) as CaptainClub[]);
      }

      setLoading(false);
    }
    load();
  }, [id, user]);

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

  const handleNewImages = (previews: string[], files: File[]) => {
    setNewImagePreviews(previews);
    setNewImageFiles(files);
  };

  const handleGpxChange = async (f: File | null) => {
    setGpxFile(f);
    if (f) {
      setGpxCleared(false);
      try {
        const { trackpoints } = await parseGpxFile(f);
        const stats = computeGpxStats(trackpoints);
        if (stats.distanceKm > 0) setDistance(String(stats.distanceKm));
        if (stats.elevationM > 0) setElevation(String(stats.elevationM));
        if (stats.durationMin > 0) setDuration(String(stats.durationMin));
      } catch {
        // Non-critical — fields stay as-is
      }
    }
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
        region: region || null,
        distance_km: parseFloat(distance) || 0,
        elevation_m: parseInt(elevation) || 0,
        duration_min: parseInt(duration) || 0,
        difficulty,
        surface: surfaces,
        bike_types: bikeTypes,
        route_types: routeTypes,
        mapmagic_url: mapUrl || null,
        mapmagic_embed: buildEmbedUrl(mapUrl),
        exit_points_status: exitStatus,
        club_id: clubId,
      })
      .eq("id", id);

    if (updateError) {
      setError("Не удалось сохранить изменения. Попробуй ещё раз.");
      setSubmitting(false);
      return;
    }

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

    // GPX: upload new file, or clear existing
    if (gpxFile) {
      const path = `${id}/route.gpx`;
      const { error: gpxError } = await supabase.storage
        .from("route-gpx")
        .upload(path, gpxFile, { upsert: true, contentType: "application/gpx+xml" });
      if (!gpxError) {
        // Force gpx_updated_at refresh even if path is unchanged
        await supabase.from("routes").update({ gpx_path: path, gpx_updated_at: new Date().toISOString() }).eq("id", id);
        try {
          const { startPoint, trackpoints } = await parseGpxFile(gpxFile);
          if (startPoint) {
            await supabase.rpc("update_route_geometry", {
              route_id: id,
              start_wkt: toWktPoint(startPoint.lat, startPoint.lng),
              line_wkt: toWktLinestring(trackpoints) ?? undefined,
            });
          }
        } catch {
          // Non-critical
        }
      }
    } else if (gpxCleared && existingGpxPath) {
      await supabase.storage.from("route-gpx").remove([existingGpxPath]);
      await supabase.from("routes").update({ gpx_path: null, gpx_updated_at: null }).eq("id", id);
      await supabase.rpc("clear_route_geometry", { route_id: id });
    }

    // Exit points: replace-all strategy (simpler than diffing)
    await supabase.from("route_exit_points").delete().eq("route_id", id);
    if (exitStatus === "has" && exitPoints.length > 0) {
      const rows = exitPoints
        .filter((p) => p.title.trim().length > 0)
        .map((p, idx) => ({
          route_id: id,
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

    router.refresh();
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
            <p className="text-xs text-[#71717A] mb-3">Экспортируй из MapMagic — участники смогут скачать свежий трек</p>
            <GpxUpload
              currentName={gpxFile?.name ?? (existingGpxPath && !gpxCleared ? "route.gpx" : null)}
              onChange={handleGpxChange}
              onClear={() => setGpxCleared(true)}
            />
          </div>

          {/* Exit points */}
          <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-1">Точки схода с маршрута</label>
            <p className="text-xs text-[#71717A] mb-3">Места, где можно сойти с маршрута — электричка, автобус, такси</p>
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
                <label className="text-xs text-[#71717A] mb-1 block"><MapPin size={11} className="inline mr-1" />Регион</label>
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

          {/* Existing photos */}
          {existingImages.length > 0 && (
            <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
              <label className="block text-sm font-semibold text-[#1C1C1E] mb-3">Текущие фотографии</label>
              <div className="flex flex-wrap gap-2">
                {existingImages.map((img) => (
                  <Image key={img.url} src={proxyImageUrl(img.url) ?? img.url} alt="" width={96} height={96} className="object-cover rounded-xl border border-[#E4E4E7]" />
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

          {/* Club publication */}
          {captainClubs.length > 0 && (
            <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
              <div className="flex items-center gap-2 mb-1">
                <Shield size={15} className="text-[#7C5CFC]" />
                <label className="text-sm font-semibold text-[#1C1C1E]">Опубликовать от клуба</label>
              </div>
              <p className="text-xs text-[#71717A] mb-3">Маршрут появится в разделе маршрутов клуба</p>
              <div className="flex flex-wrap gap-2">
                {captainClubs.map((club) => {
                  const active = clubId === club.id;
                  return (
                    <button
                      key={club.id}
                      type="button"
                      onClick={() => setClubId(active ? null : club.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors"
                      style={active
                        ? { backgroundColor: "#7C5CFC", color: "white", borderColor: "#7C5CFC" }
                        : { backgroundColor: "white", color: "#71717A", borderColor: "#E4E4E7" }}>
                      <Shield size={13} />
                      {club.name}
                      {active && <X size={13} />}
                    </button>
                  );
                })}
              </div>
              {clubId && (
                <p className="text-xs text-[#7C5CFC] mt-2">
                  ✓ Маршрут будет опубликован от имени клуба
                </p>
              )}
            </div>
          )}

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
