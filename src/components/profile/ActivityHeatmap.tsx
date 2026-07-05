"use client";

import { useMemo } from "react";
import type { RideEntry } from "@/lib/hooks/useYearlyRideStats";

interface Props {
  entries: RideEntry[];
  /** Year to render; defaults to the current year. */
  year?: number;
}

/** km/day → cell color. Active days with unknown km still get the lightest step. */
function cellColor(km: number, active: boolean): string {
  if (!active) return "#EFEEEA";
  if (km < 30) return "#FFDCCB";
  if (km < 60) return "#FCAF8B";
  if (km < 100) return "#F4632A";
  return "#C24A1B";
}

const MONTH_LABELS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

/**
 * GitHub-style activity heatmap: one cell per day, one column per ISO week.
 * Renders inline (no card chrome) — meant to sit inside the profile stats panel.
 * Horizontally scrollable on narrow screens.
 */
export function ActivityHeatmap({ entries, year = new Date().getFullYear() }: Props) {
  const { weeks, monthTicks } = useMemo(() => {
    // Sum km per calendar day of the target year.
    const kmByDay = new Map<string, number>();
    for (const e of entries) {
      const day = e.date.slice(0, 10);
      if (day.slice(0, 4) !== String(year)) continue;
      kmByDay.set(day, (kmByDay.get(day) ?? 0) + e.km);
    }

    // Build week columns from Jan 1 to Dec 31, Monday-first.
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year, 11, 31));
    // Rewind to Monday of the first week.
    const dow = (start.getUTCDay() + 6) % 7; // 0 = Monday
    const cursor = new Date(start);
    cursor.setUTCDate(cursor.getUTCDate() - dow);

    const weeks: { day: string | null; km: number; active: boolean }[][] = [];
    const monthTicks: { weekIndex: number; label: string }[] = [];
    let lastMonth = -1;

    while (cursor <= end) {
      const col: { day: string | null; km: number; active: boolean }[] = [];
      for (let d = 0; d < 7; d++) {
        const inYear = cursor.getUTCFullYear() === year;
        const iso = cursor.toISOString().slice(0, 10);
        col.push(inYear
          ? { day: iso, km: kmByDay.get(iso) ?? 0, active: kmByDay.has(iso) }
          : { day: null, km: 0, active: false });
        if (inYear && cursor.getUTCDate() <= 7 && cursor.getUTCMonth() !== lastMonth) {
          lastMonth = cursor.getUTCMonth();
          monthTicks.push({ weekIndex: weeks.length, label: MONTH_LABELS[lastMonth] });
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      weeks.push(col);
    }
    return { weeks, monthTicks };
  }, [entries, year]);

  const tickByWeek = new Map(monthTicks.map((t) => [t.weekIndex, t.label]));

  return (
    <div className="overflow-x-auto pb-1">
      <div className="inline-flex flex-col gap-1 min-w-max">
        <div className="flex gap-[2px]">
          {weeks.map((col, w) => (
            <div key={w} className="flex flex-col gap-[2px]">
              {col.map((cell, d) =>
                cell.day ? (
                  <div
                    key={d}
                    className="w-[9px] h-[9px] rounded-[2px]"
                    style={{ backgroundColor: cellColor(cell.km, cell.active) }}
                    title={`${cell.day.split("-").reverse().join(".")}${cell.km > 0 ? ` · ${Math.round(cell.km)} км` : cell.active ? " · заезд" : ""}`}
                  />
                ) : (
                  <div key={d} className="w-[9px] h-[9px]" />
                ),
              )}
            </div>
          ))}
        </div>
        <div className="relative h-4 text-[10px] text-[#A1A1AA]">
          {monthTicks.map((t) => (
            <span key={t.label} className="absolute" style={{ left: `${t.weekIndex * 11}px` }}>
              {tickByWeek.get(t.weekIndex)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
