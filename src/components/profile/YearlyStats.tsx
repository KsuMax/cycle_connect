"use client";

import { CalendarRange } from "lucide-react";
import type { YearStat } from "@/lib/hooks/useYearlyRideStats";

interface Props {
  stats: YearStat[] | null;
}

/** "По годам" — per-year breakdown of ridden routes (count + km) with a km bar. */
export function YearlyStats({ stats }: Props) {
  // Hide entirely while loading or when there's nothing to show.
  if (!stats || stats.length === 0) return null;

  const maxKm = Math.max(...stats.map((s) => s.km), 1);
  const totalKm = stats.reduce((sum, s) => sum + s.km, 0);

  return (
    <div
      className="bg-white rounded-2xl border border-[#E4E4E7] p-4 sm:p-5 mb-6"
      style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-sm text-[#1C1C1E] flex items-center gap-2">
          <CalendarRange size={16} style={{ color: "#F4632A" }} />
          По годам
        </h3>
        <span className="text-xs text-[#A1A1AA]">всего {totalKm.toLocaleString("ru-RU")} км</span>
      </div>

      <div className="flex flex-col gap-3.5">
        {stats.map((s) => (
          <div key={s.year}>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-sm font-semibold text-[#1C1C1E]">{s.year}</span>
              <span className="text-xs text-[#71717A]">
                {s.rides} {s.rides === 1 ? "поездка" : s.rides < 5 ? "поездки" : "поездок"}
                {" · "}
                <span className="font-semibold" style={{ color: "#F4632A" }}>
                  {s.km.toLocaleString("ru-RU")} км
                </span>
              </span>
            </div>
            <div className="h-[7px] rounded-full bg-[#F5F4F1] overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(4, Math.round((s.km / maxKm) * 100))}%`, backgroundColor: "#F4632A" }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
