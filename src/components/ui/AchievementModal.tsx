"use client";

import { useAchievements } from "@/lib/context/AchievementsContext";
import { getLevelMeta } from "@/lib/achievement-levels";

export function AchievementModal() {
  const { newlyEarned, dismissNewlyEarned } = useAchievements();

  if (newlyEarned.length === 0) return null;

  const item = newlyEarned[0];
  const { achievement, level, isLevelUp } = item;
  const remaining = newlyEarned.length - 1;
  const levelMeta = achievement.max_level > 1 ? getLevelMeta(level) : null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className="bg-white rounded-2xl p-6 max-w-xs w-full shadow-xl text-center"
        style={{ animation: "achievement-pop 0.35s ease-out" }}
      >
        <div className="text-5xl mb-4" style={{ animation: "achievement-bounce 0.5s ease-out 0.15s both" }}>
          {achievement.icon}
        </div>

        <div
          className="text-xs font-semibold uppercase tracking-wider mb-1"
          style={{ color: levelMeta?.color ?? "#F4632A" }}
        >
          {isLevelUp
            ? "Уровень повышен!"
            : achievement.is_hidden
              ? "Редкое достижение!"
              : "Новое достижение"}
        </div>

        <h2 className="text-lg font-bold text-[#1C1C1E] mb-1">{achievement.title}</h2>

        {levelMeta && (
          <div className="flex items-center justify-center gap-1.5 mb-2">
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-md"
              style={{ backgroundColor: levelMeta.color + "20", color: levelMeta.color }}
            >
              {levelMeta.label}
            </span>
            <span className="text-xs text-[#A1A1AA]">
              {level}/{achievement.max_level}
            </span>
          </div>
        )}

        <p className="text-sm text-[#71717A] mb-5">{achievement.description}</p>

        <button
          onClick={dismissNewlyEarned}
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: levelMeta?.color ?? "#F4632A" }}
        >
          {remaining > 0 ? `Круто! (ещё ${remaining})` : "Круто!"}
        </button>
      </div>

      <style>{`
        @keyframes achievement-pop {
          from { opacity: 0; transform: scale(0.85); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes achievement-bounce {
          0% { transform: scale(0.5); opacity: 0; }
          60% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
