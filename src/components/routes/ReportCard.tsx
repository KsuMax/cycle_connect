"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { richTextToPlain } from "@/lib/richText";
import type { DbRideReport, RideReportVibe } from "@/lib/supabase";

const VIBE_CONFIG: Record<RideReportVibe, { emoji: string; label: string; color: string }> = {
  chill:   { emoji: "😌", label: "Кайф",     color: "#0BBFB5" },
  push:    { emoji: "💪", label: "Жарили",   color: "#F4632A" },
  epic:    { emoji: "🔥", label: "Эпик",     color: "#FF6B00" },
  suffer:  { emoji: "😵", label: "Страдали", color: "#7C5CFC" },
  explore: { emoji: "🧭", label: "Открытие", color: "#22A75B" },
};

interface Props {
  report: DbRideReport;
  showRoute?: boolean;
  currentUserId?: string | null;
}

export function ReportCard({ report, showRoute = false, currentUserId }: Props) {
  const vibe = report.vibe ? VIBE_CONFIG[report.vibe] : null;
  const photos = report.photos ?? [];
  const routeId = report.route_id ?? report.route?.id;
  const detailHref = routeId ? `/routes/${routeId}/report/${report.id}` : null;
  const editHref = routeId ? `/routes/${routeId}/report/${report.id}/edit` : null;
  const isOwner = !!currentUserId && currentUserId === report.user_id;

  const preview = richTextToPlain(report.text);
  const isTruncated = preview.length > 280;

  return (
    <article
      className="bg-white rounded-2xl overflow-hidden border border-[#E4E4E7]"
      style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}
    >
      {photos.length > 0 && (
        <div className={`grid gap-0.5 ${photos.length === 1 ? "grid-cols-1" : "grid-cols-[2fr_1fr]"}`}>
          <div className="relative aspect-[16/9] overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photos[0]} alt="" className="w-full h-full object-cover" />
          </div>
          {photos.length > 1 && (
            <div className="flex flex-col gap-0.5">
              {photos.slice(1, 3).map((url, i) => (
                <div key={i} className="relative flex-1 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  {i === 1 && photos.length > 3 && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <span className="text-white text-sm font-semibold">+{photos.length - 3}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start gap-3 mb-3">
          <div
            className="w-9 h-9 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-sm font-semibold text-white"
            style={{ backgroundColor: "#F4632A" }}
          >
            {report.author?.avatar_url
              /* eslint-disable-next-line @next/next/no-img-element */
              ? <img src={report.author.avatar_url} alt="" className="w-full h-full object-cover" />
              : (report.author?.name?.[0] ?? "?").toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-[#1C1C1E]">
                {report.author?.name ?? "Райдер"}
              </span>
              {vibe && (
                <span
                  className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: vibe.color + "1A", color: vibe.color }}
                >
                  {vibe.emoji} {vibe.label}
                </span>
              )}
            </div>
            <div className="text-xs text-[#A1A1AA] mt-0.5">
              {formatDate(report.ridden_at)} · отчёт о поездке
            </div>
          </div>
          {isOwner && editHref && (
            <Link
              href={editHref}
              className="shrink-0 p-1.5 rounded-lg text-[#A1A1AA] hover:text-[#1C1C1E] hover:bg-[#F5F4F1] transition-colors"
              title="Редактировать"
            >
              <Pencil size={14} />
            </Link>
          )}
        </div>

        {showRoute && report.route && (
          <Link
            href={`/routes/${report.route.id}`}
            className="inline-flex items-center gap-1 text-xs font-medium mb-2 hover:underline"
            style={{ color: "#F4632A" }}
          >
            📍 {report.route.title}
          </Link>
        )}

        {preview && (
          <p className="text-sm text-[#3F3F46] leading-relaxed line-clamp-4 mb-3">
            {preview}
          </p>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          {detailHref && (preview || photos.length > 0) && (
            <Link
              href={detailHref}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              style={{ backgroundColor: "#F4632A", color: "white" }}
            >
              {isTruncated ? "Читать целиком →" : "Открыть отчёт →"}
            </Link>
          )}
          {showRoute && report.route && (
            <Link
              href={`/routes/${report.route.id}`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              style={{ backgroundColor: "#F5F4F1", color: "#71717A" }}
            >
              Открыть маршрут →
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
