"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { AlertCircle, ChevronLeft } from "lucide-react";
import { StepIndicator } from "@/components/routes/wizard/StepIndicator";
import { StepTrack, type DurationMode } from "@/components/routes/wizard/StepTrack";
import { StepDetails, type CaptainClub } from "@/components/routes/wizard/StepDetails";
import { StepPublish } from "@/components/routes/wizard/StepPublish";
import { type RegionOption } from "@/components/routes/RegionPicker";
import { useAuth } from "@/lib/context/AuthContext";
import { useToast } from "@/lib/context/ToastContext";
import { useAchievements } from "@/lib/context/AchievementsContext";
import { supabase } from "@/lib/supabase";
import { toMapMagicEmbed } from "@/lib/mapmagic";
import { parseGpxFile, computeGpxStats, toWktPoint, toWktLinestring } from "@/lib/gpx";
import type { RouteType, Difficulty, Surface } from "@/types";
import Link from "next/link";

const STEPS = [
  { step: 1, label: "Трек" },
  { step: 2, label: "Описание" },
  { step: 3, label: "Публикация" },
];

export default function NewRoutePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, profile } = useAuth();
  const { showToast } = useToast();
  const { checkAndAward } = useAchievements();

  const [step, setStep] = useState(1);
  const [skippedTrack, setSkippedTrack] = useState(false);

  // Prefilled from /admin/grabber "Импортировать" deep links (title/region/
  // description/mapUrl query params) — mapUrl only makes sense when the
  // grabber found an actual MapMagic link; other sources just prefill text.
  const [title, setTitle] = useState(() => searchParams.get("title") ?? "");
  const [description, setDescription] = useState(() => searchParams.get("description") ?? "");
  const [mapUrl, setMapUrl] = useState(() => searchParams.get("mapUrl") ?? "");
  const [region, setRegion] = useState(() => searchParams.get("region") ?? "");
  const [regions, setRegions] = useState<RegionOption[]>([]);
  const [distance, setDistance] = useState("");
  const [elevation, setElevation] = useState("");
  const [durationMode, setDurationMode] = useState<DurationMode>("single");
  const [durationHours, setDurationHours] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [durationDays, setDurationDays] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [routeTypes, setRouteTypes] = useState<RouteType[]>([]);
  const [surfaces, setSurfaces] = useState<Surface[]>([]);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [gpxFile, setGpxFile] = useState<File | null>(null);
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

  const hasTrack = !!gpxFile;
  const canProceedFromTrack = hasTrack || skippedTrack;
  const titleMissing = !title.trim();
  const typeMissing = routeTypes.length === 0;
  const canProceedFromDetails = !titleMissing && !typeMissing;
  const canSubmit = !titleMissing && !typeMissing && !submitting;

  const goNext = () => {
    if (step === 1 && !canProceedFromTrack) return;
    if (step === 2) {
      setAttempted(true);
      if (!canProceedFromDetails) return;
    }
    setStep((s) => Math.min(3, s + 1));
  };

  const goBack = () => setStep((s) => Math.max(1, s - 1));

  const handleSkipTrack = () => {
    setSkippedTrack(true);
    setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step !== 3) return;
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
        poi_tags: null,
        season_months: null,
        mapmagic_url: mapUrl || null,
        mapmagic_embed: toMapMagicEmbed(mapUrl, title.trim()),
        club_id: clubId || null,
        exit_points_status: "unknown",
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
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#1C1C1E] mb-1">Новый маршрут</h1>
          <p className="text-[#71717A] text-sm">Добавь маршрут и поделись им с сообществом</p>
        </div>

        <StepIndicator steps={STEPS} current={step} />

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          {step === 1 && (
            <StepTrack
              title={title}
              mapUrl={mapUrl}
              onMapUrlChange={handleMapUrlChange}
              isMapMagicUrl={isMapMagicUrl(mapUrl)}
              importing={importing}
              importStatus={importStatus}
              importError={importError}
              onImport={handleImport}
              gpxFileName={gpxFile?.name ?? null}
              onGpxChange={handleGpxChange}
              hasTrack={hasTrack}
              region={region}
              regions={regions}
              onRegionChange={setRegion}
              distance={distance}
              onDistanceChange={setDistance}
              elevation={elevation}
              onElevationChange={setElevation}
              durationMode={durationMode}
              onDurationModeChange={setDurationMode}
              durationHours={durationHours}
              onDurationHoursChange={setDurationHours}
              durationMinutes={durationMinutes}
              onDurationMinutesChange={setDurationMinutes}
              durationDays={durationDays}
              onDurationDaysChange={setDurationDays}
              onSkip={handleSkipTrack}
            />
          )}

          {step === 2 && (
            <StepDetails
              title={title}
              onTitleChange={setTitle}
              attempted={attempted}
              captainClubs={captainClubs}
              clubId={clubId}
              onClubIdChange={setClubId}
              routeTypes={routeTypes}
              onToggleType={toggleType}
              difficulty={difficulty}
              onDifficultyChange={setDifficulty}
              surfaces={surfaces}
              onToggleSurface={toggleSurface}
            />
          )}

          {step === 3 && (
            <StepPublish
              description={description}
              onDescriptionChange={setDescription}
              gpxPresent={!!gpxFile}
              aiState={aiState}
              aiStage={aiStage}
              aiWarnings={aiWarnings}
              onGenerateDescription={generateDescription}
              coverPreview={coverPreview}
              onCoverChange={(preview, file) => { setCoverPreview(preview); setCoverFile(file); }}
              distance={distance}
              elevation={elevation}
              region={region}
              canSubmit={canSubmit}
              submitting={submitting}
              attempted={attempted}
              titleMissing={titleMissing}
              typeMissing={typeMissing}
            />
          )}

          {/* Step navigation */}
          <div className="flex items-center justify-between gap-3 pt-1">
            {step > 1 ? (
              <button
                type="button"
                onClick={goBack}
                className="inline-flex items-center gap-1 px-4 py-2.5 rounded-xl text-sm font-medium text-[#71717A] hover:text-[#1C1C1E] transition-colors"
              >
                <ChevronLeft size={16} /> Назад
              </button>
            ) : <span />}

            {step < 3 && (
              <button
                type="button"
                onClick={goNext}
                disabled={step === 1 && !canProceedFromTrack}
                className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-50"
                style={{ backgroundColor: "#1C1C1E", color: "white" }}
              >
                Далее
              </button>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}
