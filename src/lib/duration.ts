/** Format route duration for display.
 * Multi-day routes show "N дней"; single-day routes show "~N ч" (or "—" if unknown). */
export function formatRouteDuration(
  duration_min: number,
  duration_days?: number | null,
): string {
  if (duration_days && duration_days > 0) {
    const n = duration_days;
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return `${n} день`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} дня`;
    return `${n} дней`;
  }
  if (!duration_min || duration_min <= 0) return "—";
  if (duration_min < 60) return `${duration_min} мин`;
  return `~${Math.round(duration_min / 60)} ч`;
}
