"use client";

import { ChevronRight, Loader2, Sparkles, AlertCircle } from "lucide-react";
import { CoverUpload } from "@/components/routes/CoverUpload";
import { DayEditor } from "@/components/events/DayEditorLazy";

interface StepPublishProps {
  description: string;
  onDescriptionChange: (html: string) => void;

  gpxPresent: boolean;
  aiState: "idle" | "loading" | "error";
  aiStage: string;
  aiWarnings: string[];
  onGenerateDescription: () => void;

  coverPreview: string | null;
  onCoverChange: (preview: string | null, file: File | null) => void;

  distance: string;
  elevation: string;
  region: string[];

  canSubmit: boolean;
  submitting: boolean;
  attempted: boolean;
  titleMissing: boolean;
  typeMissing: boolean;
}

export function StepPublish({
  description,
  onDescriptionChange,
  gpxPresent,
  aiState,
  aiStage,
  aiWarnings,
  onGenerateDescription,
  coverPreview,
  onCoverChange,
  distance,
  elevation,
  region,
  canSubmit,
  submitting,
  attempted,
  titleMissing,
  typeMissing,
}: StepPublishProps) {
  return (
    <div className="space-y-5">
      {/* Stats recap */}
      {(distance || elevation || region.length > 0) && (
        <div className="bg-white rounded-2xl p-4 border border-[#E4E4E7] flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#71717A]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
          {distance && <span>{distance} км</span>}
          {elevation && <span>{elevation} м набора</span>}
          {region.length > 0 && <span>{region.join(", ")}</span>}
        </div>
      )}

      {/* Description */}
      <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
        <div className="flex items-center justify-between mb-2 gap-2">
          <label className="block text-sm font-semibold text-[#1C1C1E]">Описание</label>
          <button
            type="button"
            onClick={onGenerateDescription}
            disabled={!gpxPresent || aiState === "loading"}
            title={!gpxPresent ? "Загрузи GPX, чтобы сгенерировать описание" : "Сгенерировать черновик описания на основе GPX"}
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
          onChange={onDescriptionChange}
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

      {/* Cover */}
      <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
        <label className="block text-sm font-semibold text-[#1C1C1E] mb-1">Обложка</label>
        <p className="text-xs text-[#71717A] mb-3">Фото обложки — отображается в карточке маршрута</p>
        <CoverUpload value={coverPreview} onChange={onCoverChange} />
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
            {titleMissing && typeMissing
              ? "Заполни название и выбери тип маршрута"
              : titleMissing
              ? "Заполни название маршрута"
              : "Выбери тип маршрута"}
          </p>
        )}
      </div>
    </div>
  );
}
