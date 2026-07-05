"use client";

import { Shield } from "lucide-react";
import { ROUTE_TYPES, DIFFICULTIES, SURFACES } from "@/constants/routes";
import type { RouteType, Difficulty, Surface } from "@/types";

export interface CaptainClub { id: string; name: string }

interface StepDetailsProps {
  title: string;
  onTitleChange: (value: string) => void;
  attempted: boolean;

  captainClubs: CaptainClub[];
  clubId: string | null;
  onClubIdChange: (id: string | null) => void;

  routeTypes: RouteType[];
  onToggleType: (type: RouteType) => void;

  difficulty: Difficulty;
  onDifficultyChange: (value: Difficulty) => void;

  surfaces: Surface[];
  onToggleSurface: (s: Surface) => void;
}

export function StepDetails({
  title,
  onTitleChange,
  attempted,
  captainClubs,
  clubId,
  onClubIdChange,
  routeTypes,
  onToggleType,
  difficulty,
  onDifficultyChange,
  surfaces,
  onToggleSurface,
}: StepDetailsProps) {
  return (
    <div className="space-y-5">
      {/* Title */}
      <div className={`bg-white rounded-2xl p-5 border ${attempted && !title.trim() ? "border-red-300" : "border-[#E4E4E7]"}`} style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
        <label className="block text-sm font-semibold text-[#1C1C1E] mb-2">Название маршрута *</label>
        <input type="text" placeholder="Например: Карельская тишина"
          value={title} onChange={(e) => onTitleChange(e.target.value)}
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
              onClick={() => onClubIdChange(null)}
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
                onClick={() => onClubIdChange(c.id)}
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
            <button type="button" key={value} onClick={() => onToggleType(value)}
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
            <button type="button" key={value} onClick={() => onDifficultyChange(value)}
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
            <button type="button" key={value} onClick={() => onToggleSurface(value)}
              className="px-4 py-2 rounded-xl text-sm font-medium transition-colors border"
              style={surfaces.includes(value)
                ? { backgroundColor: "#1C1C1E", color: "white", borderColor: "#1C1C1E" }
                : { backgroundColor: "white", color: "#71717A", borderColor: "#E4E4E7" }}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
