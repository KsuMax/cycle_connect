"use client";

import { AchievementBadge } from "./AchievementBadge";
import type { DbAchievement } from "@/lib/supabase";

interface ProfileShowcaseProps {
  /** The 3 showcase achievement IDs */
  showcaseIds: string[];
  /** Full achievements catalog */
  achievements: DbAchievement[];
  /** User's earned levels map */
  earnedLevels: Record<string, number>;
  /** Show edit button (own profile only) */
  onEdit?: () => void;
}

export function ProfileShowcase({ showcaseIds, achievements, earnedLevels, onEdit }: ProfileShowcaseProps) {
  if (showcaseIds.length === 0) {
    if (!onEdit) return null;
    return (
      <button
        onClick={onEdit}
        className="w-full text-center py-3 px-4 rounded-xl border border-dashed border-[#E4E4E7] text-xs text-[#A1A1AA] hover:border-[#F4632A] hover:text-[#F4632A] transition-colors"
      >
        + Выбери до 3 достижений для витрины
      </button>
    );
  }

  const showcaseAchievements = showcaseIds
    .map((id) => achievements.find((a) => a.id === id))
    .filter(Boolean) as DbAchievement[];

  if (showcaseAchievements.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 flex gap-2">
        {showcaseAchievements.map((ach) => (
          <div key={ach.id} className="flex-1">
            <AchievementBadge
              achievement={ach}
              earned
              level={earnedLevels[ach.id] ?? 1}
              compact
            />
          </div>
        ))}
      </div>
      {onEdit && (
        <button
          onClick={onEdit}
          className="text-[10px] text-[#A1A1AA] hover:text-[#F4632A] transition-colors shrink-0 px-1"
          title="Изменить витрину"
        >
          изм.
        </button>
      )}
    </div>
  );
}
