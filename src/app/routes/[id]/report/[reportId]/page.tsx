"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { ChevronLeft, Pencil, Loader2 } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { useAuth } from "@/lib/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { sanitizeHtml } from "@/lib/sanitize";
import { formatDate } from "@/lib/utils";
import type { DbRideReport, RideReportVibe } from "@/lib/supabase";

const VIBE_CONFIG: Record<RideReportVibe, { emoji: string; label: string; color: string }> = {
  chill:   { emoji: "😌", label: "Кайф",     color: "#0BBFB5" },
  push:    { emoji: "💪", label: "Жарили",   color: "#F4632A" },
  epic:    { emoji: "🔥", label: "Эпик",     color: "#FF6B00" },
  suffer:  { emoji: "😵", label: "Страдали", color: "#7C5CFC" },
  explore: { emoji: "🧭", label: "Открытие", color: "#22A75B" },
};

interface Props {
  params: Promise<{ id: string; reportId: string }>;
}

export default function ReportDetailPage({ params }: Props) {
  const { id: routeId, reportId } = use(params);
  const { user } = useAuth();
  const [report, setReport] = useState<DbRideReport | null>(null);
  const [routeTitle, setRouteTitle] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("ride_reports")
        .select("id, route_id, user_id, ride_id, ridden_at, vibe, text, photos, created_at, author:profiles!user_id(name, avatar_url), route:routes!route_id(id, title, cover_url)")
        .eq("id", reportId)
        .maybeSingle();
      if (cancel) return;
      const r = (data as unknown as DbRideReport | null) ?? null;
      setReport(r);
      setRouteTitle(r?.route?.title ?? "");
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [reportId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F4F1]">
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-16 flex justify-center">
          <Loader2 size={20} className="animate-spin text-[#A1A1AA]" />
        </main>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-[#F5F4F1]">
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-16 text-center text-[#71717A]">
          Отчёт не найден
        </main>
      </div>
    );
  }

  const vibe = report.vibe ? VIBE_CONFIG[report.vibe] : null;
  const photos = report.photos ?? [];
  const isOwner = !!user && user.id === report.user_id;

  return (
    <div className="min-h-screen bg-[#F5F4F1]">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <Link
            href={`/routes/${routeId}`}
            className="inline-flex items-center gap-1.5 text-sm text-[#71717A] hover:text-[#1C1C1E] transition-colors"
          >
            <ChevronLeft size={16} /> {routeTitle ? `К маршруту «${routeTitle}»` : "К маршруту"}
          </Link>
          {isOwner && (
            <Link
              href={`/routes/${routeId}/report/${report.id}/edit`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#E4E4E7] text-[#3F3F46] hover:border-[#1C1C1E] hover:text-[#1C1C1E] transition-colors"
            >
              <Pencil size={14} /> Редактировать
            </Link>
          )}
        </div>

        <article className="bg-white rounded-2xl border border-[#E4E4E7] overflow-hidden" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
          <div className="p-5">
            <div className="flex items-start gap-3 mb-4">
              <div
                className="w-10 h-10 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-sm font-semibold text-white"
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
            </div>

            {report.text && (
              <div
                className="prose text-[15px] text-[#3F3F46] leading-relaxed"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(report.text) }}
              />
            )}
          </div>

          {photos.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 px-1 pb-1">
              {photos.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block aspect-[4/3] overflow-hidden rounded-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          )}
        </article>
      </main>
    </div>
  );
}
