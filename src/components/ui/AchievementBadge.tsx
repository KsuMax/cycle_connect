"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import type { DbAchievement } from "@/lib/supabase";

/** Human-readable conditions for each achievement */
const ACHIEVEMENT_CONDITIONS: Record<string, string> = {
  first_ride:   "Отметь любой маршрут как проеханный",
  century:      "Проедь 100 км суммарно",
  cartographer: "Создай свой первый маршрут",
  architect:    "Создай 5 маршрутов",
  first_event:  "Запишись на любое мероприятие",
  regular:      "Участвуй в 5 мероприятиях",
  organizer:    "Создай своё мероприятие",
  friendly:     "Подпишись на любого пользователя",
  omnivore:     "Проедь маршруты с 3 разными покрытиями",
  own_route:    "Это секрет ;)",
};

interface AchievementBadgeProps {
  achievement: DbAchievement;
  earned: boolean;
  earnedDate?: string;
  /** On other user's profile — hide unearned hidden achievements entirely */
  hideIfHiddenAndNotEarned?: boolean;
}

export function AchievementBadge({ achievement, earned, earnedDate, hideIfHiddenAndNotEarned }: AchievementBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const isHiddenLocked = achievement.is_hidden && !earned;

  if (hideIfHiddenAndNotEarned && isHiddenLocked) return null;

  const condition = ACHIEVEMENT_CONDITIONS[achievement.id];

  return (
    <div
      className="bg-white rounded-2xl p-3 border text-center transition-all relative select-none"
      style={{
        borderColor: earned ? "#F4632A" : "#E4E4E7",
        boxShadow: earned
          ? "0 0 0 1px #F4632A, 0 1px 3px 0 rgb(0 0 0 / 0.07)"
          : "0 1px 3px 0 rgb(0 0 0 / 0.07)",
        opacity: earned ? 1 : 0.45,
        cursor: "pointer",
      }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={() => setShowTooltip((v) => !v)}
    >
      <div className="text-3xl mb-2">
        {isHiddenLocked ? <Lock size={28} className="mx-auto text-[#A1A1AA]" /> : achievement.icon}
      </div>
      <div className="text-xs font-semibold text-[#1C1C1E] leading-tight mb-0.5">
        {isHiddenLocked ? "???" : achievement.title}
      </div>
      <div className="text-[10px] text-[#A1A1AA] leading-tight">
        {earned
          ? new Date(earnedDate!).toLocaleDateString("ru")
          : isHiddenLocked
            ? "Скрытое достижение"
            : achievement.description}
      </div>

      {/* Tooltip */}
      {showTooltip && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-xl text-xs font-medium whitespace-normal z-20 pointer-events-none"
          style={{
            backgroundColor: "#1C1C1E",
            color: "white",
            minWidth: 160,
            maxWidth: 220,
            animation: "tooltip-fade 0.15s ease-out",
          }}
        >
          {earned ? (
            <>
              <div className="font-semibold mb-0.5">{achievement.title}</div>
              <div className="text-white/70">{achievement.description}</div>
            </>
          ) : isHiddenLocked ? (
            <div className="text-white/70">Выполни секретное условие, чтобы открыть</div>
          ) : (
            <>
              <div className="font-semibold mb-0.5">Как получить:</div>
              <div className="text-white/70">{condition ?? achievement.description}</div>
            </>
          )}
          {/* Arrow */}
          <div
            className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0"
            style={{
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              borderTop: "6px solid #1C1C1E",
            }}
          />
        </div>
      )}

      <style>{`
        @keyframes tooltip-fade {
          from { opacity: 0; transform: translate(-50%, 4px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </div>
  );
}
