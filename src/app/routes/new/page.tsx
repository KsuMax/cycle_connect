"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { MapPin, Link as LinkIcon, ChevronRight, AlertCircle, Shield, Download, Loader2, CheckCircle2, Sparkles } from "lucide-react";
import { ImageUpload } from "@/components/routes/ImageUpload";
import { CoverUpload } from "@/components/routes/CoverUpload";
import { GpxUpload } from "@/components/routes/GpxUpload";
import { ExitPointsEditor, type ExitPointDraft } from "@/components/routes/ExitPointsEditor";
import { RegionPicker, type RegionOption } from "@/components/routes/RegionPicker";
import { DayEditor } from "@/components/events/DayEditorLazy";
import { useAuth } from "@/lib/context/AuthContext";
import { useToast } from "@/lib/context/ToastContext";
import { useAchievements } from "@/lib/context/AchievementsContext";
import { supabase } from "@/lib/supabase";
import { toMapMagicEmbed } from "@/lib/mapmagic";
import { parseGpxFile, computeGpxStats, toWktPoint, toWktLinestring } from "@/lib/gpx";
import { ROUTE_TYPES, DIFFICULTIES, SURFACES, POI_TAGS, SEASONS } from "@/constants/routes";
import type { RouteType, Difficulty, Surface, ExitPointsStatus } from "@/types";
import Link from "next/link";

interface CaptainClub { id: string; name: string }

export default function NewRoutePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, profile } = useAuth();
  const { showToast } = useToast();
  const { checkAndAward } = useAchievements();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mapUrl, setMapUrl] = useState("");
  const [region, setRegion] = useState("");
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
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [gpxFile, setGpxFile] = useState<File | null>(null);
  const [exitStatus, setExitStatus] = useState<ExitPointsStatus>("unknown");
  const [exitPoints, setExitPoints] = useState<ExitPointDraft[]>([]);
  const [clubId, setClubId] = useState<string | null>(null);
  const [captainClubs, setCaptainClubs] = useState<CaptainClub[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<"idle" | "success" | "error">("idle");
  const [importError, setImportError] = useState<string | null>(null);
  // AI description generator
  const [aiState, setAiState] = useState<"idle" | "loading" | "error">("idle");
  const [aiStage, setAiStage] = useState<string>("");
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);

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
    if (!user) return;
    supabase
      .from("club_members")
      .select("club_id, role, club:clubs!club_id(id, name)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .in("role", ["owner", "admin", "captain"])
      .then(({ data }) => {
        if (!data) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const clubs = (data as any[])
          .map((m) => m.club)
          .filter(Boolean) as CaptainClub[];
        setCaptainClubs(clubs);
        const preselect = searchParams.get("club");
        if (preselect && clubs.some((c) => c.id === preselect)) {
          setClubId(preselect);
        }
      });
  }, [user, searchParams]);

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

  /**
   * Convert plain-text LLM output (paragraphs separated by blank lines)
   * into the HTML the Tiptap editor expects.
   */
  const textToHtml = (text: string): string => {
    return text
      .split(/\n\s*\n/)
      .map((para) => para.trim())
      .filter(Boolean)
      .map((para) => `<p>${escapeHtml(para).replace(/\n/g, "<br>")}</p>`)
      .join("");
  };
  const escapeHtml = (s: string): string =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const generateDescription = async () => {
    if (!gpxFile) {
      showToast("Сначала загрузи GPX-файл маршрута", "error");
      return;
    }
    setAiState("loading");
    setAiWarnings([]);
    // Progress hints — purely informational, no streaming wire yet.
    setAiStage("Читаю трек…");
    const stageTimers: number[] = [];
    stageTimers.push(window.setTimeout(() => setAiStage("Анализирую рельеф…"), 1500));
    stageTimers.push(window.setTimeout(() => setAiStage("Ищу объекты по пути…"), 4000));
    stageTimers.push(window.setTimeout(() => setAiStage("Пишу описание…"), 15000));

    try {
      const gpxText = await gpxFile.text();
      const res = await fetch("/api/routes/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gpx: gpxText }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as {
        description?: string;
        guardrails?: { ok?: boolean; unknownQuoted?: string[]; unknownCapitalised?: string[] };
        model?: string;
      };
      if (!data.description) throw new Error("empty description from server");

      setDescription(textToHtml(data.description));

      const warnings: string[] = [];
      if (data.guardrails && data.guardrails.ok === false) {
        if (data.guardrails.unknownQuoted?.length) {
          warnings.push(`Имена в кавычках без проверки: ${data.guardrails.unknownQuoted.join(", ")}`);
        }
        if (data.guardrails.unknownCapitalised?.length) {
          warnings.push(`Подозрительные имена: ${data.guardrails.unknownCapitalised.slice(0, 5).join(", ")}`);
        }
      }
      setAiWarnings(warnings);
      showToast(
        warnings.length
          ? "Черновик сгенерирован — проверь подсвеченные имена"
          : "Черновик сгенерирован, можно править",
        warnings.length ? "info" : "success"
      );
      setAiState("idle");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[ai-description] failed:", msg);
      showToast(`Не получилось сгенерировать: ${msg}`, "error");
      setAiState("error");
    } finally {
      for (const t of stageTimers) window.clearTimeout(t);
      setAiStage("");
    }
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
      if (stats.durationMin > 0) {
        setDurationHours(String(Math.floor(stats.durationMin / 60)));
        setDurationMinutes(String(stats.durationMin % 60));
      }

      // Auto-detect region from the track midpoint when user hasn't picked one.
      if (!region && trackpoints.length > 0) {
        const mid = trackpoints[Math.floor(trackpoints.length / 2)];
        const { data } = await supabase.rpc("find_region_for_point", {
          lat: mid.lat,
          lng: mid.lng,
        });
        if (typeof data === "string" && data) setRegion(data);
      }
    } catch {
      // Non-critical — fields stay empty
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
      if (!title.trim() && data.name) setTitle(data.name);
      if (!description.trim() && data.description) setDescription(data.description);
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
        duration_min: durationMode === "single"
          ? ((parseInt(durationHours) || 0) * 60 + (parseInt(durationMinutes) || 0))
          : 0,
        duration_days: durationMode === "multi"
          ? (parseInt(durationDays) || null)
          : null,
        difficulty,
        surface: surfaces,
        route_types: routeTypes,
        tags: [],
        poi_tags: poiTags.length > 0 ? poiTags : null,
        season_months: seasonMonths.length > 0 ? seasonMonths : null,
        mapmagic_url: mapUrl || null,
        mapmagic_embed: toMapMagicEmbed(mapUrl, title.trim()),
        club_id: clubId || null,
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
      const gpxForm = new FormData();
      gpxForm.append("routeId", routeData.id);
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
    // Fire-and-forget: index for AI search (non-blocking).
    fetch("/api/routes/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: routeData.id }),
    }).catch(() => {});
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

          {/* Club selector — shown only to captains+ */}
          {captainClubs.length > 0 && (
            <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
              <label className="block text-sm font-semibold text-[#1C1C1E] mb-1 flex items-center gap-2">
                <Shield size={15} style={{ color: "#0BBFB5" }} />
                Опубликовать от клуба
              </label>
              <p className="text-xs text-[#71717A] mb-3">Маршрут появится в ленте клуба и будет виден его участникам</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setClubId(null)}
                  className="px-4 py-2 rounded-xl text-sm font-medium transition-colors border"
                  style={!clubId
                    ? { backgroundColor: "#1C1C1E", color: "white", borderColor: "#1C1C1E" }
                    : { backgroundColor: "white", color: "#71717A", borderColor: "#E4E4E7" }}
                >
                  От себя
                </button>
                {captainClubs.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setClubId(c.id)}
                    className="px-4 py-2 rounded-xl text-sm font-medium transition-colors border"
                    style={clubId === c.id
                      ? { backgroundColor: "#0BBFB5", color: "white", borderColor: "#0BBFB5" }
                      : { backgroundColor: "white", color: "#71717A", borderColor: "#E4E4E7" }}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}

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
                GPX загружен из MapMagic. Название и описание подставлены — поправь, если нужно.
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
            <p className="text-xs text-[#71717A] mb-3">Пользователи смогут скачать его одной кнопкой</p>
            <GpxUpload currentName={gpxFile?.name ?? null} onChange={handleGpxChange} />
            <p className="mt-3 text-xs text-[#A1A1AA] leading-relaxed">
              GPX делает поиск точнее — ИИ найдёт твой маршрут людям, которые ищут «вдоль реки» или «через лес», а не только по названию. Чем точнее трек, тем больше райдеров увидят маршрут в подборках.
            </p>
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

          {/* Photos */}
          <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-1">Фотографии</label>
            <p className="text-xs text-[#71717A] mb-3">Покажи, как выглядит маршрут</p>
            <ImageUpload images={imagePreviews} onChange={handleImages} />
          </div>

          {/* Description */}
          <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <div className="flex items-center justify-between mb-2 gap-2">
              <label className="block text-sm font-semibold text-[#1C1C1E]">Описание</label>
              <button
                type="button"
                onClick={generateDescription}
                disabled={!gpxFile || aiState === "loading"}
                title={!gpxFile ? "Загрузи GPX, чтобы сгенерировать описание" : "Сгенерировать черновик описания на основе GPX"}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: aiState === "loading" ? "#E4E4E7" : "#F4632A",
                  color: aiState === "loading" ? "#71717A" : "white",
                }}
              >
                {aiState === "loading" ? (
                  <><Loader2 size={13} className="animate-spin" /> {aiStage || "Готовлю…"}</>
                ) : (
                  <><Sparkles size={13} /> Сгенерировать ИИ</>
                )}
              </button>
            </div>
            <DayEditor
              placeholder="Расскажи о маршруте: что увидит велосипедист, какое покрытие, особенности..."
              value={description}
              onChange={(html) => setDescription(html)}
            />
            {aiWarnings.length > 0 && (
              <div className="mt-2 flex gap-2 items-start text-xs text-amber-700">
                <AlertCircle size={13} className="mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">Проверь подсвеченные имена — они не сверены с базой:</div>
                  <ul className="mt-0.5 list-disc pl-4">
                    {aiWarnings.map((w, i) => (<li key={i}>{w}</li>))}
                  </ul>
                </div>
              </div>
            )}
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
