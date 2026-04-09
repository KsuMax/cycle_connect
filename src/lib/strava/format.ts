/**
 * Display formatters for Strava activity metrics. Pure functions, no
 * side effects, locale = ru.
 */

/** 12_345 → "12 345" */
function withSpaces(n: number): string {
  return n.toLocaleString("ru-RU");
}

/** Meters → human distance: "42.7 км" or "850 м". */
export function formatDistanceM(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} м`;
  const km = meters / 1000;
  // Below 100 km show 1 decimal; above, round to integer.
  if (km < 100) return `${km.toFixed(1).replace(".", ",")} км`;
  return `${withSpaces(Math.round(km))} км`;
}

/** Seconds → "1 ч 23 мин" or "47 мин" or "0 мин". */
export function formatDurationS(seconds: number): string {
  if (seconds <= 0) return "0 мин";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m} мин`;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
}

/** m/s → "27.4 км/ч". */
export function formatSpeedMs(ms: number | null | undefined): string | null {
  if (ms == null || ms <= 0) return null;
  const kmh = ms * 3.6;
  return `${kmh.toFixed(1).replace(".", ",")} км/ч`;
}

/** Meters → "+1 234 м". Returns null when no elevation data. */
export function formatElevationM(m: number | null | undefined): string | null {
  if (m == null || m <= 0) return null;
  return `+${withSpaces(Math.round(m))} м`;
}

/** ISO timestamp → "сегодня в 14:32" / "вчера в 09:00" / "5 апр в 14:32". */
export function formatActivityDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  const time = date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (date >= startOfToday) return `сегодня в ${time}`;
  if (date >= startOfYesterday) return `вчера в ${time}`;

  // Older — short day-month, plus year if not the current year.
  const sameYear = date.getFullYear() === now.getFullYear();
  const datePart = date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
  });
  return `${datePart} в ${time}`;
}

/** "Ride" / "GravelRide" → "Шоссе" / "Грэвел" etc. */
export function formatSportType(type: string): string {
  switch (type) {
    case "Ride":
      return "Шоссе";
    case "GravelRide":
      return "Грэвел";
    case "MountainBikeRide":
      return "MTB";
    case "EBikeRide":
      return "E-bike";
    case "VirtualRide":
      return "Зал";
    default:
      return type;
  }
}
