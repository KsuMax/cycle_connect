"use client";

import { Pencil } from "lucide-react";
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
        className="text-left py-1.5 px-3 rounded-lg border border-dashed border-[#E4E4E7] text-xs text-[#A1A1AA] hover:border-[#F4632A] hover:text-[#F4632A] transition-colors whitespace-nowrap"
      >
        + Витрина достижений
      </button>
    );
  }

  const showcaseAchievements = showcaseIds
    .map((id) => achievements.find((a) => a.id === id))
    .filter(Boolean) as DbAchievement[];

  if (showcaseAchievements.length === 0) return null;

  return (
    <div className="flex items-start gap-1.5">
      <div className="flex-1 min-w-0 flex flex-wrap gap-1.5">
        {showcaseAchievements.map((ach) => (
          <div key={ach.id} className="min-w-0 max-w-full">
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
          className="w-7 h-7 flex items-center justify-center rounded-lg text-[#A1A1AA] hover:text-[#F4632A] hover:bg-[#F5F4F1] transition-colors shrink-0"
          title="Изменить витрину"
          aria-label="Изменить витрину"
        >
          <Pencil size={13} />
        </button>
      )}
    </div>
  );
}
