"use client";

import { Plus, Trash2, Train, Bus, CarTaxiFront, Route as RouteIcon, MapPin } from "lucide-react";
import type { ExitPointKind, ExitPointsStatus } from "@/types";

export interface ExitPointDraft {
  id?: string;          // present for rows already persisted
  title: string;
  kind: ExitPointKind;
  distance_km_from_start: string; // kept as string for input
  note: string;
}

const KIND_OPTIONS: { value: ExitPointKind; label: string; icon: React.ReactNode }[] = [
  { value: "train", label: "Электричка", icon: <Train size={14} /> },
  { value: "bus",   label: "Автобус",     icon: <Bus size={14} /> },
  { value: "taxi",  label: "Такси",       icon: <CarTaxiFront size={14} /> },
  { value: "road",  label: "Трасса",      icon: <RouteIcon size={14} /> },
  { value: "other", label: "Другое",      icon: <MapPin size={14} /> },
];

const STATUS_OPTIONS: { value: ExitPointsStatus; label: string; hint: string }[] = [
  { value: "unknown", label: "Пока не знаю", hint: "Уточнишь позже" },
  { value: "has",     label: "Есть",         hint: "Добавь точки ниже" },
  { value: "none",    label: "Нет",          hint: "Маршрут автономный" },
];

interface ExitPointsEditorProps {
  status: ExitPointsStatus;
  onStatusChange: (status: ExitPointsStatus) => void;
  points: ExitPointDraft[];
  onPointsChange: (points: ExitPointDraft[]) => void;
}

export function ExitPointsEditor({ status, onStatusChange, points, onPointsChange }: ExitPointsEditorProps) {
  const addPoint = () =>
    onPointsChange([...points, { title: "", kind: "train", distance_km_from_start: "", note: "" }]);

  const removePoint = (idx: number) =>
    onPointsChange(points.filter((_, i) => i !== idx));

  const updatePoint = (idx: number, patch: Partial<ExitPointDraft>) =>
    onPointsChange(points.map((p, i) => (i === idx ? { ...p, ...patch } : p)));

  return (
    <div>
      <div className="flex gap-1 p-1 rounded-xl mb-1" style={{ backgroundColor: "#F5F4F1" }}>
        {STATUS_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => onStatusChange(value)}
            className="flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={status === value
              ? { backgroundColor: "white", color: "#1C1C1E", boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.07)" }
              : { color: "#71717A" }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="text-xs text-[#A1A1AA] mb-3 px-1">
        {STATUS_OPTIONS.find((o) => o.value === status)?.hint}
      </div>

      {status === "has" && (
        <div className="space-y-3">
          {points.map((p, idx) => (
            <div key={idx} className="p-3 rounded-xl border border-[#E4E4E7] bg-[#FAFAFA]">
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  placeholder="Название (например, ст. Радищево)"
                  value={p.title}
                  onChange={(e) => updatePoint(idx, { title: e.target.value })}
                  className="flex-1 px-3 py-2 rounded-lg border border-[#E4E4E7] bg-white text-sm outline-none focus:border-[#F4632A] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => removePoint(idx)}
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-[#A1A1AA] hover:text-red-500 hover:bg-red-50 transition-colors"
                  aria-label="Удалить точку"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {KIND_OPTIONS.map(({ value, label, icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => updatePoint(idx, { kind: value })}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border"
                    style={p.kind === value
                      ? { backgroundColor: "#1C1C1E", color: "white", borderColor: "#1C1C1E" }
                      : { backgroundColor: "white", color: "#71717A", borderColor: "#E4E4E7" }}
                  >
                    {icon} {label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-2">
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  placeholder="Км от старта"
                  value={p.distance_km_from_start}
                  onChange={(e) => updatePoint(idx, { distance_km_from_start: e.target.value })}
                  className="px-3 py-2 rounded-lg border border-[#E4E4E7] bg-white text-sm outline-none focus:border-[#F4632A] transition-colors"
                />
                <input
                  type="text"
                  placeholder="Заметка (опционально): электричка на Казанский, ~1ч"
                  value={p.note}
                  onChange={(e) => updatePoint(idx, { note: e.target.value })}
                  className="px-3 py-2 rounded-lg border border-[#E4E4E7] bg-white text-sm outline-none focus:border-[#F4632A] transition-colors"
                />
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addPoint}
            className="w-full py-2.5 rounded-xl border border-dashed border-[#E4E4E7] text-sm text-[#71717A] hover:border-[#F4632A] hover:text-[#F4632A] transition-colors flex items-center justify-center gap-1.5"
          >
            <Plus size={14} /> Добавить точку
          </button>
        </div>
      )}
    </div>
  );
}
