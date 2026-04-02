"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { getLevelMeta } from "@/lib/achievement-levels";
import type { DbAchievement } from "@/lib/supabase";

/** Human-readable conditions for each achievement */
const ACHIEVEMENT_CONDITIONS: Record<string, string> = {
  first_ride:     "Отметь любой маршрут как проеханный",
  century:        "Проедь 100 км суммарно",
  cartographer:   "Создай свой первый маршрут",
  architect:      "Создай 5 маршрутов",
  first_event:    "Запишись на любое мероприятие",
  regular:        "Участвуй в 5 мероприятиях",
  organizer:      "Создай своё мероприятие",
  friendly:       "Подпишись на любого пользователя",
  omnivore:       "Проедь маршруты с 3 разными покрытиями",
  own_route:      "Это секрет ;)",
  explorer:       "Это секрет ;)",
  double_strike:  "Это секрет ;)",
  social_magnet:  "Это секрет ;)",
};

/** Level-specific condition text for progressive achievements */
const LEVEL_CONDITIONS: Record<string, Record<number, string>> = {
  century:  { 1: "Проедь 100 км", 2: "Проедь 500 км", 3: "Проедь 1 000 км", 4: "Проедь 5 000 км" },
  architect:{ 1: "Создай 5 маршрутов", 2: "Создай 10 маршрутов", 3: "Создай 25 маршрутов", 4: "Создай 50 маршрутов" },
  regular:  { 1: "Участвуй в 5 мероприятиях", 2: "Участвуй в 15 мероприятиях", 3: "Участвуй в 30 мероприятиях" },
  friendly: { 1: "Подпишись на 1 пользователя", 2: "Подпишись на 10", 3: "Подпишись на 25", 4: "Подпишись на 50" },
};

interface AchievementBadgeProps {
  achievement: DbAchievement;
  earned: boolean;
  earnedDate?: string;
  level?: number;
  hideIfHiddenAndNotEarned?: boolean;
  /** Compact mode for showcase display */
  compact?: boolean;
}

export function AchievementBadge({
  achievement,
  earned,
  earnedDate,
  level = 1,
  hideIfHiddenAndNotEarned,
  compact,
}: AchievementBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const isHiddenLocked = achievement.is_hidden && !earned;

  if (hideIfHiddenAndNotEarned && isHiddenLocked) return null;

  const hasLevels = achievement.max_level > 1;
  const levelMeta = hasLevels && earned ? getLevelMeta(level) : null;
  const nextLevel = hasLevels && earned && level < achievement.max_level ? level + 1 : null;

  const borderColor = earned
    ? (levelMeta?.color ?? "#F4632A")
    : "#E4E4E7";

  const condition = ACHIEVEMENT_CONDITIONS[achievement.id];
  const nextLevelCondition = nextLevel
    ? LEVEL_CONDITIONS[achievement.id]?.[nextLevel]
    : null;

  if (compact) {
    return (
      <div
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-sm"
        style={{
          borderColor,
          boxShadow: earned ? `0 0 0 1px ${borderColor}` : undefined,
        }}
      >
        <span className="text-lg">{achievement.icon}</span>
        <span className="font-medium text-[#1C1C1E] text-xs truncate">{achievement.title}</span>
        {levelMeta && (
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded-md ml-auto shrink-0"
            style={{ backgroundColor: levelMeta.color + "20", color: levelMeta.color }}
          >
            {levelMeta.label}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className="bg-white rounded-2xl p-3 border text-center transition-all relative select-none"
      style={{
        borderColor,
        boxShadow: earned
          ? `0 0 0 1px ${borderColor}, 0 1px 3px 0 rgb(0 0 0 / 0.07)`
          : "0 1px 3px 0 rgb(0 0 0 / 0.07)",
        opacity: earned ? 1 : 0.45,
        cursor: "pointer",
      }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={() => setShowTooltip((v) => !v)}
    >
      {/* Level indicator */}
      {levelMeta && (
        <div
          className="absolute -top-1.5 -right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md text-white z-10"
          style={{ backgroundColor: levelMeta.color }}
        >
          {levelMeta.label}
        </div>
      )}

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
            maxWidth: 240,
            animation: "tooltip-fade 0.15s ease-out",
          }}
        >
          {earned ? (
            <>
              <div className="font-semibold mb-0.5">{achievement.title}</div>
              <div className="text-white/70 mb-1">{achievement.description}</div>
              {levelMeta && (
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: levelMeta.color + "30", color: levelMeta.color }}>
                    {levelMeta.label}
                  </span>
                  <span className="text-white/50 text-[10px]">уровень {level}/{achievement.max_level}</span>
                </div>
              )}
              {nextLevelCondition && (
                <div className="text-white/50 text-[10px] border-t border-white/10 pt-1 mt-1">
                  До следующего: {nextLevelCondition}
                </div>
              )}
            </>
          ) : isHiddenLocked ? (
            <div className="text-white/70">Выполни секретное условие, чтобы открыть</div>
          ) : (
            <>
              <div className="font-semibold mb-0.5">Как получить:</div>
              <div className="text-white/70">{condition ?? achievement.description}</div>
            </>
          )}
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
