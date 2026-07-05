"use client";

import { useState } from "react";
import {
  MapPin,
  Link as LinkIcon,
  Download,
  Loader2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { GpxUpload } from "@/components/routes/GpxUpload";
import { RegionPicker, type RegionOption } from "@/components/routes/RegionPicker";
import { toMapMagicEmbed } from "@/lib/mapmagic";

export type DurationMode = "single" | "multi";

interface StepTrackProps {
  title: string;
  mapUrl: string;
  onMapUrlChange: (value: string) => void;
  isMapMagicUrl: boolean;
  importing: boolean;
  importStatus: "idle" | "success" | "error";
  importError: string | null;
  onImport: () => void;

  gpxFileName: string | null;
  onGpxChange: (file: File | null) => void;
  hasTrack: boolean;

  region: string;
  regions: RegionOption[];
  onRegionChange: (value: string) => void;

  distance: string;
  onDistanceChange: (value: string) => void;
  elevation: string;
  onElevationChange: (value: string) => void;
  durationMode: DurationMode;
  onDurationModeChange: (mode: DurationMode) => void;
  durationHours: string;
  onDurationHoursChange: (value: string) => void;
  durationMinutes: string;
  onDurationMinutesChange: (value: string) => void;
  durationDays: string;
  onDurationDaysChange: (value: string) => void;

  onSkip: () => void;
}

export function StepTrack({
  title,
  mapUrl,
  onMapUrlChange,
  isMapMagicUrl,
  importing,
  importStatus,
  importError,
  onImport,
  gpxFileName,
  onGpxChange,
  hasTrack,
  region,
  regions,
  onRegionChange,
  distance,
  onDistanceChange,
  elevation,
  onElevationChange,
  durationMode,
  onDurationModeChange,
  durationHours,
  onDurationHoursChange,
  durationMinutes,
  onDurationMinutesChange,
  durationDays,
  onDurationDaysChange,
  onSkip,
}: StepTrackProps) {
  const [manualOpen, setManualOpen] = useState(false);

  const embedSrc = isMapMagicUrl ? toMapMagicEmbed(mapUrl, title || undefined) : null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* GPX upload */}
        <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
          <label className="block text-sm font-semibold text-[#1C1C1E] mb-1">GPX-файл</label>
          <p className="text-xs text-[#71717A] mb-3">Экспортируй из любого планировщика</p>
          <GpxUpload currentName={gpxFileName} onChange={onGpxChange} />
        </div>

        {/* MapMagic link */}
        <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
          <label className="block text-sm font-semibold text-[#1C1C1E] mb-1">
            <span className="flex items-center gap-2"><LinkIcon size={15} /> Ссылка на маршрут</span>
          </label>
          <p className="text-xs text-[#71717A] mb-3">MapMagic, Komoot или другой планировщик</p>
          <div className="flex gap-2">
            <input type="url" placeholder="https://mapmagic.app/map?routes=..."
              value={mapUrl} onChange={(e) => onMapUrlChange(e.target.value)}
              className="flex-1 px-4 py-2.5 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors font-mono min-w-0" />
          </div>
          {isMapMagicUrl && (
            <button
              type="button"
              onClick={onImport}
              disabled={importing}
              className="mt-2 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-colors w-full disabled:opacity-60"
              style={{ backgroundColor: "#0BBFB5" }}
            >
              {importing
                ? <><Loader2 size={14} className="animate-spin" /> Загружаю…</>
                : <><Download size={14} /> Загрузить GPX</>}
            </button>
          )}
          {importStatus === "success" && (
            <div className="mt-2 flex items-center gap-2 text-xs text-emerald-700">
              <CheckCircle2 size={13} />
              GPX загружен из MapMagic.
            </div>
          )}
          {importStatus === "error" && importError && (
            <div className="mt-2 text-xs text-red-600">
              {importError} Загрузи GPX-файл вручную рядом.
            </div>
          )}
          {mapUrl && !isMapMagicUrl && (
            <p className="mt-2 text-xs text-[#A1A1AA]">
              Из MapMagic GPX подтягивается автоматически. Для других сервисов — загрузи .gpx файл вручную.
            </p>
          )}
        </div>
      </div>

      {/* Confirmation panel */}
      {hasTrack && (
        <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
          <label className="block text-sm font-semibold text-[#1C1C1E] mb-3 flex items-center gap-2">
            <CheckCircle2 size={15} style={{ color: "#0BBFB5" }} />
            Трек распознан
          </label>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center p-3 rounded-xl bg-[#F5F4F1]">
              <div className="text-lg font-bold text-[#1C1C1E]">{distance || "—"}</div>
              <div className="text-xs text-[#71717A]">км</div>
            </div>
            <div className="text-center p-3 rounded-xl bg-[#F5F4F1]">
              <div className="text-lg font-bold text-[#1C1C1E]">{elevation || "—"}</div>
              <div className="text-xs text-[#71717A]">м набора</div>
            </div>
            <div className="text-center p-3 rounded-xl bg-[#F5F4F1]">
              <div className="text-lg font-bold text-[#1C1C1E]">
                {durationMode === "single"
                  ? (durationHours || durationMinutes ? `${durationHours || 0}ч ${durationMinutes || 0}м` : "—")
                  : (durationDays ? `${durationDays} дн` : "—")}
              </div>
              <div className="text-xs text-[#71717A]">время</div>
            </div>
          </div>

          <div className="mb-1">
            <label className="text-xs text-[#71717A] mb-1 block flex items-center gap-1"><MapPin size={11} /> Регион</label>
            <RegionPicker value={region} onChange={onRegionChange} options={regions} />
          </div>

          {embedSrc && (
            <div className="mt-4 rounded-xl overflow-hidden border border-[#E4E4E7]" style={{ height: 220 }}>
              <iframe src={embedSrc} className="w-full h-full" style={{ border: 0 }} title="Предпросмотр маршрута" />
            </div>
          )}

          {/* Manual correction disclosure */}
          <div className="mt-4 border-t border-[#E4E4E7] pt-3">
            <button
              type="button"
              onClick={() => setManualOpen((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-[#71717A] hover:text-[#1C1C1E] transition-colors"
            >
              {manualOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              Поправить вручную
            </button>
            {manualOpen && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="text-xs text-[#71717A] mb-1 block">Дистанция, км</label>
                  <input type="number" placeholder="98" value={distance} onChange={(e) => onDistanceChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors" />
                </div>
                <div>
                  <label className="text-xs text-[#71717A] mb-1 block">Набор высоты, м</label>
                  <input type="number" placeholder="450" value={elevation} onChange={(e) => onElevationChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors" />
                </div>
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-[#71717A] block">Длительность</label>
                    <div className="inline-flex rounded-lg bg-[#F4F4F5] p-0.5 text-xs">
                      <button type="button" onClick={() => onDurationModeChange("single")}
                        className={`px-2.5 py-1 rounded-md transition-colors ${durationMode === "single" ? "bg-white text-[#1C1C1E] shadow-sm" : "text-[#71717A]"}`}>
                        Однодневный
                      </button>
                      <button type="button" onClick={() => onDurationModeChange("multi")}
                        className={`px-2.5 py-1 rounded-md transition-colors ${durationMode === "multi" ? "bg-white text-[#1C1C1E] shadow-sm" : "text-[#71717A]"}`}>
                        Многодневный
                      </button>
                    </div>
                  </div>
                  {durationMode === "single" ? (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="relative">
                        <input type="number" min="0" placeholder="4" value={durationHours} onChange={(e) => onDurationHoursChange(e.target.value)}
                          className="w-full px-3 py-2 pr-10 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#A1A1AA]">ч</span>
                      </div>
                      <div className="relative">
                        <input type="number" min="0" max="59" placeholder="30" value={durationMinutes} onChange={(e) => onDurationMinutesChange(e.target.value)}
                          className="w-full px-3 py-2 pr-10 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#A1A1AA]">мин</span>
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      <input type="number" min="1" max="60" placeholder="4" value={durationDays} onChange={(e) => onDurationDaysChange(e.target.value)}
                        className="w-full px-3 py-2 pr-12 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#A1A1AA]">дней</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {!hasTrack && (
        <div className="text-center">
          <button type="button" onClick={onSkip} className="text-xs text-[#A1A1AA] hover:text-[#71717A] underline transition-colors">
            Создать без трека
          </button>
        </div>
      )}
    </div>
  );
}
