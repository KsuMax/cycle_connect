"use client";

import { useState, use, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { MapPin, Link as LinkIcon, ChevronRight, AlertCircle, ChevronLeft, Shield, X, Download, Loader2, CheckCircle2 } from "lucide-react";
import { ImageUpload } from "@/components/routes/ImageUpload";
import { CoverUpload } from "@/components/routes/CoverUpload";
import { GpxUpload } from "@/components/routes/GpxUpload";
import { ExitPointsEditor, type ExitPointDraft } from "@/components/routes/ExitPointsEditor";
import { RegionPicker, type RegionOption } from "@/components/routes/RegionPicker";
import { DayEditor } from "@/components/events/DayEditorLazy";
import { useAuth } from "@/lib/context/AuthContext";
import { useToast } from "@/lib/context/ToastContext";
import { supabase, proxyImageUrl } from "@/lib/supabase";
import { toMapMagicEmbed } from "@/lib/mapmagic";
import { parseGpxFile, computeGpxStats, toWktPoint, toWktLinestring } from "@/lib/gpx";
import { ROUTE_TYPES, DIFFICULTIES, SURFACES, POI_TAGS, SEASONS } from "@/constants/routes";
import type { RouteType, Difficulty, Surface, ExitPointsStatus } from "@/types";
import Link from "next/link";

interface CaptainClub { id: string; name: string }

export default function EditRoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mapUrl, setMapUrl] = useState("");
  const [region, setRegion] = useState<string[]>([]);
  const [regions, setRegions] = useState<RegionOption[]>([]);
  const [distance, setDistance] = useState("");
  const [elevation, setElevation] = useState("");
  const [durationMode, setDurationMode] = useState<"single" | "multi">("single");
  const [durationHours, setDurationHours] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [durationDays, setDurationDays] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [routeTypes, setRouteTypes] = useState<RouteType[]>([]);
  const [surfaces, setSurfaces] = useState<Surface[]>([]);
  const [poiTags, setPoiTags] = useState<string[]>([]);
  const [seasonMonths, setSeasonMonths] = useState<number[]>([]);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [existingImages, setExistingImages] = useState<{ url: string; storage_path: string | null }[]>([]);
  const [removedImages, setRemovedImages] = useState<{ url: string; storage_path: string | null }[]>([]);
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
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<"idle" | "success" | "error">("idle");
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("regions")
      .select("name, aliases")
      .order("name")
      .then(({ data }) => {
        if (data) setRegions(data.map((r) => ({ name: r.name, aliases: r.aliases ?? [] })));
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
      setRegion((data.region ?? "").split(",").map((r: string) => r.trim()).filter(Boolean));
      setDistance(data.distance_km ? String(data.distance_km) : "");
      setElevation(data.elevation_m ? String(data.elevation_m) : "");
      if (data.duration_days) {
        setDurationMode("multi");
        setDurationDays(String(data.duration_days));
      } else {
        setDurationMode("single");
        const mins = data.duration_min ?? 0;
        if (mins > 0) {
          setDurationHours(String(Math.floor(mins / 60)));
          setDurationMinutes(String(mins % 60));
        }
      }
      setDifficulty(data.difficulty ?? "medium");
      setRouteTypes(data.route_types ?? []);
      setSurfaces(data.surface ?? []);
      setPoiTags(data.poi_tags ?? []);
      setSeasonMonths(data.season_months ?? []);
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

  const togglePoi = (tag: string) => {
    setPoiTags((prev) =>
      prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]
    );
  };

  const toggleSeason = (months: number[]) => {
    const allIn = months.every((m) => seasonMonths.includes(m));
    setSeasonMonths((prev) =>
      allIn ? prev.filter((m) => !months.includes(m)) : [...new Set([...prev, ...months])]
    );
  };

  const handleNewImages = (previews: string[], files: File[]) => {
    setNewImagePreviews(previews);
    setNewImageFiles(files);
  };

  const removeExistingImage = (img: { url: string; storage_path: string | null }) => {
    setExistingImages((prev) => prev.filter((i) => i.url !== img.url));
    setRemovedImages((prev) => [...prev, img]);
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
        if (stats.durationMin > 0) {
          setDurationMode("single");
          setDurationHours(String(Math.floor(stats.durationMin / 60)));
          setDurationMinutes(String(stats.durationMin % 60));
        }
      } catch {
        // Non-critical — fields stay as-is
      }
    }
  };


  const handleMapUrlChange = (value: string) => {
    setMapUrl(value);
    setImportStatus("idle");
    setImportError(null);
  };

  // Auto-import: trigger 800ms after user stops typing a MapMagic URL.
  useEffect(() => {
    if (!isMapMagicUrl(mapUrl) || importStatus !== "idle" || importing) return;
    const timer = setTimeout(() => { handleImport(); }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapUrl]);

  const isMapMagicUrl = (url: string) => {
    try { return new URL(url).hostname.endsWith("mapmagic.app"); } catch { return false; }
  };

  const handleImport = async () => {
    if (!mapUrl || importing) return;
    setImporting(true);
    setImportStatus("idle");
    setImportError(null);
    try {
      const res = await fetch("/api/routes/import-mapmagic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: mapUrl }),
      });
      const data = await res.json();
      if (!data.ok) {
        const messages: Record<string, string> = {
          invalid_url: "Это не похоже на ссылку MapMagic. Проверь адрес.",
          not_found: "Не нашли маршрут по этой ссылке. Возможно, он удалён или приватный.",
          fetch_failed: "Не удалось получить маршрут из MapMagic. Попробуй чуть позже.",
          no_geometry: "У этого маршрута нет геоданных в MapMagic.",
        };
        setImportError(messages[data.reason] ?? "Не удалось загрузить GPX. Добавь файл вручную ниже.");
        setImportStatus("error");
        return;
      }
      const blob = new Blob([data.gpx], { type: "application/gpx+xml" });
      const file = new File([blob], `mapmagic-${Date.now()}.gpx`, { type: "application/gpx+xml" });
      await handleGpxChange(file);
      // Страховка: если из GPX статистика не извлеклась (нет <ele> и т.п.) —
      // берём готовые значения из ответа API.
      if (data.distanceKm != null) setDistance((prev) => prev || String(data.distanceKm));
      if (data.elevationM != null) setElevation((prev) => prev || String(Math.round(data.elevationM)));
      setImportStatus("success");
    } catch {
      setImportError("Ошибка соединения. Попробуй ещё раз или добавь GPX вручную.");
      setImportStatus("error");
    } finally {
      setImporting(false);
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
        region: region.join(", ") || null,
        distance_km: parseFloat(distance) || 0,
        elevation_m: parseInt(elevation) || 0,
        duration_min: durationMode === "single"
          ? ((parseInt(durationHours) || 0) * 60 + (parseInt(durationMinutes) || 0))
          : 0,
        duration_days: durationMode === "multi"
          ? (parseInt(durationDays) || null)
          : null,
        difficulty,
        surface: surfaces,
        route_types: routeTypes,
        poi_tags: poiTags,
        season_months: seasonMonths.length > 0 ? seasonMonths : null,
        mapmagic_url: mapUrl || null,
        mapmagic_embed: toMapMagicEmbed(mapUrl, title.trim()),
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

    if (removedImages.length > 0) {
      const { error: deleteError } = await supabase
        .from("route_images")
        .delete()
        .eq("route_id", id)
        .in("url", removedImages.map((img) => img.url));
      if (deleteError) {
        showToast("Не удалось удалить фотографии. Попробуй ещё раз.", "error");
      } else {
        const paths = removedImages
          .map((img) => img.storage_path)
          .filter((p): p is string => Boolean(p));
        if (paths.length > 0) {
          // Best-effort: an orphaned file in storage is harmless
          await supabase.storage.from("route-images").remove(paths);
        }
      }
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
      const gpxForm = new FormData();
      gpxForm.append("routeId", id);
      gpxForm.append("file", gpxFile);
      const gpxRes = await fetch("/api/routes/upload-gpx", { method: "POST", body: gpxForm });
      if (!gpxRes.ok) {
        const err = await gpxRes.json().catch(() => ({ error: "unknown error" }));
        showToast(`GPX не сохранился: ${err.error ?? gpxRes.statusText}`, "error");
      } else {
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

    // Fire-and-forget: refresh AI-search embedding (non-blocking).
    fetch("/api/routes/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});

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
            <p className="text-xs text-[#71717A] mb-3">Выбери все, что встречается на маршруте</p>
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

          {/* POI tags */}
          <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-1">Места и природа</label>
            <p className="text-xs text-[#71717A] mb-3">Что встречается на маршруте? Помогает находить его в поиске</p>
            <div className="flex flex-wrap gap-2">
              {POI_TAGS.map(({ value, label, emoji }) => (
                <button type="button" key={value} onClick={() => togglePoi(value)}
                  className="px-3 py-1.5 rounded-xl text-sm font-medium transition-colors border"
                  style={poiTags.includes(value)
                    ? { backgroundColor: "#1C1C1E", color: "white", borderColor: "#1C1C1E" }
                    : { backgroundColor: "white", color: "#71717A", borderColor: "#E4E4E7" }}>
                  {emoji} {label}
                </button>
              ))}
            </div>
          </div>

          {/* Seasons */}
          <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-1">Лучший сезон</label>
            <p className="text-xs text-[#71717A] mb-3">Когда маршрут особенно хорош? Можно выбрать несколько</p>
            <div className="flex gap-2">
              {SEASONS.map(({ months, label, emoji }) => {
                const active = months.every((m) => seasonMonths.includes(m));
                return (
                  <button type="button" key={label} onClick={() => toggleSeason(months)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors border text-center"
                    style={active
                      ? { backgroundColor: "#1C1C1E", color: "white", borderColor: "#1C1C1E" }
                      : { backgroundColor: "white", color: "#71717A", borderColor: "#E4E4E7" }}>
                    {emoji} {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Map URL */}
          <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-1">
              <span className="flex items-center gap-2"><LinkIcon size={15} /> Ссылка на маршрут</span>
            </label>
            <p className="text-xs text-[#71717A] mb-3">Вставь ссылку из MapMagic, Komoot или другого планировщика</p>
            <div className="flex gap-2">
              <input type="url" placeholder="https://mapmagic.app/map?routes=..."
                value={mapUrl} onChange={(e) => handleMapUrlChange(e.target.value)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors font-mono min-w-0" />
              {isMapMagicUrl(mapUrl) && (
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={importing}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-colors shrink-0 disabled:opacity-60"
                  style={{ backgroundColor: "#0BBFB5" }}
                >
                  {importing
                    ? <><Loader2 size={14} className="animate-spin" /> Загружаю…</>
                    : <><Download size={14} /> Загрузить GPX</>}
                </button>
              )}
            </div>
            {importStatus === "success" && (
              <div className="mt-2 flex items-center gap-2 text-xs text-emerald-700">
                <CheckCircle2 size={13} />
                GPX загружен из MapMagic — он заменит текущий при сохранении.
              </div>
            )}
            {importStatus === "error" && importError && (
              <div className="mt-2 text-xs text-red-600">
                {importError} Загрузи GPX-файл вручную ниже.
              </div>
            )}
            {mapUrl && !isMapMagicUrl(mapUrl) && (
              <p className="mt-2 text-xs text-[#A1A1AA]">
                Из MapMagic GPX подтягивается автоматически. Для других сервисов — загрузи .gpx файл вручную ниже.
              </p>
            )}
          </div>

          {/* GPX file */}
          <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-1">GPX-файл</label>
            <p className="text-xs text-[#71717A] mb-3">Участники смогут скачать трек одной кнопкой</p>
            <GpxUpload
              currentName={gpxFile?.name ?? (existingGpxPath && !gpxCleared ? "route.gpx" : null)}
              onChange={handleGpxChange}
              onClear={() => setGpxCleared(true)}
            />
            <p className="mt-3 text-xs text-[#A1A1AA] leading-relaxed">
              GPX делает поиск точнее — ИИ найдёт твой маршрут людям, которые ищут «вдоль реки» или «через лес», а не только по названию. Чем точнее трек, тем больше райдеров увидят маршрут в подборках.
            </p>
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
                <RegionPicker value={region} onChange={setRegion} options={regions} />
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
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-[#71717A] block">Длительность</label>
                  <div className="inline-flex rounded-lg bg-[#F4F4F5] p-0.5 text-xs">
                    <button type="button" onClick={() => setDurationMode("single")}
                      className={`px-2.5 py-1 rounded-md transition-colors ${durationMode === "single" ? "bg-white text-[#1C1C1E] shadow-sm" : "text-[#71717A]"}`}>
                      Однодневный
                    </button>
                    <button type="button" onClick={() => setDurationMode("multi")}
                      className={`px-2.5 py-1 rounded-md transition-colors ${durationMode === "multi" ? "bg-white text-[#1C1C1E] shadow-sm" : "text-[#71717A]"}`}>
                      Многодневный
                    </button>
                  </div>
                </div>
                {durationMode === "single" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                      <input type="number" min="0" placeholder="4" value={durationHours} onChange={(e) => setDurationHours(e.target.value)}
                        className="w-full px-3 py-2 pr-10 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#A1A1AA]">ч</span>
                    </div>
                    <div className="relative">
                      <input type="number" min="0" max="59" placeholder="30" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)}
                        className="w-full px-3 py-2 pr-10 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#A1A1AA]">мин</span>
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    <input type="number" min="1" max="60" placeholder="4" value={durationDays} onChange={(e) => setDurationDays(e.target.value)}
                      className="w-full px-3 py-2 pr-12 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#A1A1AA]">дней</span>
                  </div>
                )}
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
              <label className="block text-sm font-semibold text-[#1C1C1E] mb-1">Текущие фотографии</label>
              <p className="text-xs text-[#71717A] mb-3">Нажми ×, чтобы убрать фото — оно удалится при сохранении</p>
              <div className="flex flex-wrap gap-2">
                {existingImages.map((img) => (
                  <div key={img.url} className="relative">
                    <Image src={proxyImageUrl(img.url) ?? img.url} alt="" width={96} height={96} className="object-cover rounded-xl border border-[#E4E4E7]" />
                    <button
                      type="button"
                      onClick={() => removeExistingImage(img)}
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
