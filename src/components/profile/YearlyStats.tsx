"use client";

import { CalendarRange } from "lucide-react";
import type { YearStat } from "@/lib/hooks/useYearlyRideStats";

interface Props {
  stats: YearStat[] | null;
}

function ridesWord(n: number): string {
  if (n === 1) return "поездка";
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "поездки";
  return "поездок";
}

/**
 * "По годам" — per-year breakdown of ridden routes (count + km) with a km bar.
 * Renders inline (no card chrome) — meant to sit inside the profile stats panel.
 */
export function YearlyStats({ stats }: Props) {
  if (!stats || stats.length === 0) return null;

  const maxKm = Math.max(...stats.map((s) => s.km), 1);

  return (
    <div>
      <h3 className="font-bold text-xs uppercase tracking-wide text-[#71717A] flex items-center gap-1.5 mb-3">
        <CalendarRange size={13} style={{ color: "#F4632A" }} />
        По годам
      </h3>
      <div className="flex flex-col gap-3">
        {stats.map((s) => (
          <div key={s.year}>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-sm font-semibold text-[#1C1C1E]">{s.year}</span>
              <span className="text-xs text-[#71717A]">
                {s.rides} {ridesWord(s.rides)}
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
