export const LEVEL_META: Record<number, { name: string; label: string; color: string }> = {
  1: { name: "bronze",  label: "Бронза",  color: "#CD7F32" },
  2: { name: "silver",  label: "Серебро", color: "#A0A0A0" },
  3: { name: "gold",    label: "Золото",  color: "#FFD700" },
  4: { name: "diamond", label: "Алмаз",   color: "#7DF9FF" },
};

export function getLevelMeta(level: number) {
  return LEVEL_META[level] ?? LEVEL_META[1];
}

/** Given an achievement's thresholds and a current value, return the qualifying level */
export function getQualifyingLevel(
  thresholds: Record<string, number> | null,
  maxLevel: number,
  currentValue: number,
): number {
  if (!thresholds || maxLevel <= 1) return 1;
  let level = 0;
  for (let l = 1; l <= maxLevel; l++) {
    const threshold = thresholds[String(l)];
    if (threshold !== undefined && currentValue >= threshold) {
      level = l;
    }
  }
  return level;
}
