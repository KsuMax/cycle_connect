"use client";

import { useState } from "react";
import { X, Check } from "lucide-react";
import { getLevelMeta } from "@/lib/achievement-levels";
import type { DbAchievement } from "@/lib/supabase";

interface ShowcasePickerProps {
  achievements: DbAchievement[];
  earnedLevels: Record<string, number>;
  selected: string[];
  onSave: (ids: string[]) => void;
  onClose: () => void;
}

export function ShowcasePicker({ achievements, earnedLevels, selected, onSave, onClose }: ShowcasePickerProps) {
  const [picked, setPicked] = useState<string[]>(selected);

  const earnedAchievements = achievements.filter((a) => a.id in earnedLevels);

  const toggle = (id: string) => {
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className="bg-white rounded-2xl max-w-sm w-full shadow-xl overflow-hidden"
        style={{ animation: "achievement-pop 0.25s ease-out" }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E4E4E7]">
          <h3 className="text-sm font-semibold text-[#1C1C1E]">Витрина достижений</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-[#F5F4F1] transition-colors">
            <X size={16} className="text-[#71717A]" />
          </button>
        </div>

        <div className="px-4 py-2">
          <p className="text-xs text-[#A1A1AA]">Выбери до 3 достижений ({picked.length}/3)</p>
        </div>

        <div className="max-h-80 overflow-y-auto px-4 pb-4 space-y-1.5">
          {earnedAchievements.length === 0 ? (
            <div className="text-center py-8 text-sm text-[#A1A1AA]">
              У тебя пока нет достижений
            </div>
          ) : (
            earnedAchievements.map((ach) => {
              const isSelected = picked.includes(ach.id);
              const level = earnedLevels[ach.id] ?? 1;
              const levelMeta = ach.max_level > 1 ? getLevelMeta(level) : null;
              const disabled = !isSelected && picked.length >= 3;

              return (
                <button
                  key={ach.id}
                  onClick={() => toggle(ach.id)}
                  disabled={disabled}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all disabled:opacity-40"
                  style={{
                    borderColor: isSelected ? "#F4632A" : "#E4E4E7",
                    backgroundColor: isSelected ? "#FFF8F5" : "white",
                  }}
                >
                  <span className="text-2xl shrink-0">{ach.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#1C1C1E] truncate">{ach.title}</div>
                    {levelMeta && (
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-md inline-block mt-0.5"
                        style={{ backgroundColor: levelMeta.color + "20", color: levelMeta.color }}
                      >
                        {levelMeta.label}
                      </span>
                    )}
                  </div>
                  <div
                    className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors"
                    style={{
                      borderColor: isSelected ? "#F4632A" : "#D4D4D8",
                      backgroundColor: isSelected ? "#F4632A" : "transparent",
                    }}
                  >
                    {isSelected && <Check size={12} className="text-white" />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="px-4 py-3 border-t border-[#E4E4E7] flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-[#E4E4E7] text-[#71717A] hover:bg-[#F5F4F1] transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={() => onSave(picked)}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#F4632A" }}
          >
            Сохранить
          </button>
        </div>

        <style>{`
          @keyframes achievement-pop {
            from { opacity: 0; transform: scale(0.9); }
            to { opacity: 1; transform: scale(1); }
          }
        `}</style>
      </div>
    </div>
  );
}
