"use client";

import { useEffect, useMemo, useState } from "react";
import { Wind, RotateCw, Info } from "lucide-react";
import {
  scoreWind,
  bandOf,
  BAND_COLORS,
  type BearingProfile,
  type HourlyWind,
  type WindScore,
} from "@/lib/wind";

interface WindWidgetProps {
  routeId: string;
}

interface ApiResponse {
  profile: BearingProfile;
  centroid: { lat: number; lng: number };
  forecast: HourlyWind[];
}

interface Slot {
  ts: string;          // ISO hour
  date: Date;
  hour: number;        // local hour in user's timezone
  wind: HourlyWind;
  score: WindScore;
}

// Slots we surface in the heatmap. Cyclists rarely pick 03:00, and morning
// vs. evening wind characters differ enough that 6 representative hours
// across the day is a useful resolution for a small widget.
const HOUR_SLOTS = [6, 9, 12, 15, 18, 21];
const RU_DAYS_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

function formatDayHeader(d: Date) {
  const day = RU_DAYS_SHORT[d.getDay()];
  const dm = `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
  return { day, dm };
}

function formatScoreSummary(s: WindScore): string {
  const ms = Math.abs(s.tailwindMs).toFixed(1);
  if (s.score > 0.2) return `Попутный ${ms} м/с`;
  if (s.score < -0.2) return `Встречный ${ms} м/с`;
  return `Боковой`;
}

export function WindWidget({ routeId }: WindWidgetProps) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null); // slot ts
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    let abort = false;
    setLoading(true);
    setError(null);
    fetch(`/api/wind/${routeId}`)
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 404) throw new Error("noprofile");
          throw new Error(`api_${res.status}`);
        }
        return (await res.json()) as ApiResponse;
      })
      .then((j) => { if (!abort) setData(j); })
      .catch((e: Error) => { if (!abort) setError(e.message); })
      .finally(() => { if (!abort) setLoading(false); });
    return () => { abort = true; };
  }, [routeId]);

  // Build a map ISO-hour → forecast for O(1) lookups, then build slot grid
  // anchored to the user's local timezone (forecast hours are UTC).
  const slots: Slot[][] = useMemo(() => {
    if (!data) return [];
    const byHour = new Map<string, HourlyWind>();
    for (const w of data.forecast) {
      const d = new Date(w.ts);
      d.setMinutes(0, 0, 0);
      byHour.set(d.toISOString(), w);
    }
    const out: Slot[][] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const dayDate = new Date(today);
      dayDate.setDate(today.getDate() + dayOffset);
      const dayRow: Slot[] = [];
      for (const h of HOUR_SLOTS) {
        const slotLocal = new Date(dayDate);
        slotLocal.setHours(h, 0, 0, 0);
        if (slotLocal.getTime() < Date.now() - 30 * 60 * 1000) {
          continue; // skip past hours
        }
        // Forecast keys are UTC-aligned hours.
        const utc = new Date(slotLocal);
        utc.setMinutes(0, 0, 0);
        const utcKey = new Date(Date.UTC(
          utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(), utc.getUTCHours(),
        )).toISOString();
        const wind = byHour.get(utcKey);
        if (!wind) continue;
        const score = scoreWind(data.profile, wind);
        dayRow.push({ ts: slotLocal.toISOString(), date: slotLocal, hour: h, wind, score });
      }
      if (dayRow.length > 0) out.push(dayRow);
    }
    return out;
  }, [data]);

  const selectedSlot = useMemo(() => {
    if (!selected) return null;
    for (const row of slots) for (const s of row) if (s.ts === selected) return s;
    return null;
  }, [slots, selected]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-4 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
        <div className="h-4 w-24 bg-[#F4F4F5] rounded mb-3 animate-pulse" />
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 7 * 6 }).map((_, i) => (
            <div key={i} className="h-5 rounded bg-[#F4F4F5] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error === "noprofile" || (data && data.profile.total_m === 0)) {
    // Don't render anything if the route has no geometry — nothing to score.
    return null;
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl p-4 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
        <div className="flex items-center gap-2 text-sm text-[#71717A]">
          <Wind size={14} /> Прогноз ветра недоступен
        </div>
      </div>
    );
  }

  if (!data || slots.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl p-4 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-[#71717A] uppercase tracking-wide flex items-center gap-1.5">
          <Wind size={12} /> Ветер на 7 дней
        </h3>
        <button
          onClick={() => setShowInfo((v) => !v)}
          className="text-[#A1A1AA] hover:text-[#1C1C1E] transition-colors"
          aria-label="Как считается"
        >
          <Info size={13} />
        </button>
      </div>

      {showInfo && (
        <div className="text-[11px] leading-relaxed text-[#71717A] bg-[#FAFAFA] rounded-lg p-2.5 mb-3 border border-[#F4F4F5]">
          Считаем направление каждого участка маршрута и сравниваем с прогнозом ветра.
          Зелёный — ветер по ходу, красный — в лоб. Стрелка ↺ — на этой петле выгоднее ехать
          в обратную сторону.
        </div>
      )}

      <div className="space-y-1.5">
        {slots.map((row) => {
          const head = formatDayHeader(row[0].date);
          return (
            <div key={head.dm} className="flex items-center gap-2">
              <div className="w-12 shrink-0 text-[11px] text-[#71717A]">
                <span className="font-medium text-[#1C1C1E]">{head.day}</span>
                <span className="ml-1 text-[#A1A1AA]">{head.dm}</span>
              </div>
              <div className="flex-1 grid grid-cols-6 gap-1">
                {HOUR_SLOTS.map((h) => {
                  const slot = row.find((s) => s.hour === h);
                  if (!slot) return <div key={h} className="h-7 rounded bg-[#FAFAFA] border border-[#F4F4F5]" />;
                  const band = bandOf(slot.score.score);
                  const colors = BAND_COLORS[band];
                  const isSelected = selected === slot.ts;
                  return (
                    <button
                      key={h}
                      onClick={() => setSelected(slot.ts)}
                      className="h-7 rounded text-[10px] font-semibold flex items-center justify-center gap-0.5 transition-all"
                      style={{
                        backgroundColor: colors.bg,
                        color: colors.fg,
                        outline: isSelected ? `2px solid ${colors.fg}` : "none",
                        outlineOffset: isSelected ? "1px" : "0",
                      }}
                      title={`${h}:00 · ${formatScoreSummary(slot.score)} · ${slot.wind.speed_ms.toFixed(1)} м/с`}
                    >
                      {h}
                      {slot.score.reverseBetter && <RotateCw size={8} />}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {selectedSlot && (
        <div className="mt-3 pt-3 border-t border-[#F4F4F5]">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-[#1C1C1E]">
                {formatDayHeader(selectedSlot.date).day} {formatDayHeader(selectedSlot.date).dm} · {selectedSlot.hour}:00
              </div>
              <div className="text-xs text-[#71717A] mt-0.5">
                {formatScoreSummary(selectedSlot.score)} · ветер {selectedSlot.wind.speed_ms.toFixed(1)} м/с
              </div>
              {selectedSlot.score.reverseBetter && (
                <div className="text-xs text-[#F4632A] mt-1 inline-flex items-center gap-1">
                  <RotateCw size={11} /> Лучше ехать в обратную сторону
                </div>
              )}
            </div>
            {selectedSlot.score.tailwindShare > 0.5 && !selectedSlot.score.reverseBetter && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap"
                style={{ backgroundColor: BAND_COLORS.tailwind.bg, color: BAND_COLORS.tailwind.fg }}>
                {Math.round(selectedSlot.score.tailwindShare * 100)}% по ветру
              </span>
            )}
          </div>
        </div>
      )}

      <div className="mt-3 text-[10px] text-[#A1A1AA] leading-relaxed">
        Прогноз Open-Meteo, обновляется раз в 2 часа. Точность ≈ 9 км.
      </div>
    </div>
  );
}
