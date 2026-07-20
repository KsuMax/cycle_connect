import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Pencil, Star, Smile, BicepsFlexed, Flame, Skull, Compass, type LucideIcon } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { createServerSupabase } from "@/lib/supabase-server";
import { sanitizeHtml } from "@/lib/sanitize";
import { metaDescription } from "@/lib/seo";
import { formatDate } from "@/lib/utils";
import type { DbRideReport, RideReportVibe } from "@/lib/supabase";

const BASE_URL = "https://cycleconnect.cc";

type DbRideReportWithRating = DbRideReport & { rating?: number | null };

const VIBE_CONFIG: Record<RideReportVibe, { icon: LucideIcon; label: string; color: string }> = {
  chill:   { icon: Smile,        label: "Кайф",     color: "#0BBFB5" },
  push:    { icon: BicepsFlexed, label: "Жарили",   color: "#F4632A" },
  epic:    { icon: Flame,        label: "Эпик",     color: "#FF6B00" },
  suffer:  { icon: Skull,        label: "Страдали", color: "#7C5CFC" },
  explore: { icon: Compass,      label: "Открытие", color: "#22A75B" },
};

const REPORT_SELECT =
  "id, route_id, user_id, ride_id, ridden_at, vibe, rating, text, photos, created_at, " +
  "author:profiles!user_id(name, avatar_url), " +
  "route:routes!route_id(id, title, cover_url)";

const REPORT_SELECT_NO_RATING =
  "id, route_id, user_id, ride_id, ridden_at, vibe, text, photos, created_at, " +
  "author:profiles!user_id(name, avatar_url), " +
  "route:routes!route_id(id, title, cover_url)";

async function fetchReport(reportId: string): Promise<DbRideReportWithRating | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("ride_reports")
    .select(REPORT_SELECT)
    .eq("id", reportId)
    .maybeSingle();
  if (error) {
    // Колонка rating может ещё не существовать в проде — тогда повторяем без неё
    const { data: fallbackData } = await supabase
      .from("ride_reports")
      .select(REPORT_SELECT_NO_RATING)
      .eq("id", reportId)
      .maybeSingle();
    return (fallbackData as unknown as DbRideReportWithRating | null) ?? null;
  }
  return (data as unknown as DbRideReportWithRating | null) ?? null;
}

function plainTextExcerpt(html: string | null, max = 160): string {
  return metaDescription(html, max);
}

interface Props {
  params: Promise<{ id: string; reportId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id: routeId, reportId } = await params;
  const report = await fetchReport(reportId);

  if (!report) {
    return { title: "Отчёт | CycleConnect" };
  }

  const author = report.author?.name ?? "Райдер";
  const routeTitle = report.route?.title ?? "маршруте";
  const title = `Отчёт ${author} о ${routeTitle} | CycleConnect`;
  const description =
    plainTextExcerpt(report.text) ||
    `Отчёт о велопоездке от ${formatDate(report.ridden_at)} на CycleConnect`;
  const ogImage = report.photos?.[0] ?? report.route?.cover_url ?? undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${BASE_URL}/routes/${routeId}/report/${reportId}`,
      siteName: "CycleConnect",
      type: "article",
      ...(ogImage ? { images: [{ url: ogImage, width: 1200, height: 630, alt: title }] } : {}),
    },
  };
}

export default async function ReportDetailPage({ params }: Props) {
  const { id: routeId, reportId } = await params;
  const supabase = await createServerSupabase();

  const [{ data: reportData, error: reportError }, { data: userData }] = await Promise.all([
    supabase.from("ride_reports").select(REPORT_SELECT).eq("id", reportId).maybeSingle(),
    supabase.auth.getUser(),
  ]);

  let finalReportData = reportData;
  if (reportError) {
    // Колонка rating может ещё не существовать в проде — тогда повторяем без неё
    const { data: fallbackData } = await supabase
      .from("ride_reports")
      .select(REPORT_SELECT_NO_RATING)
      .eq("id", reportId)
      .maybeSingle();
    finalReportData = fallbackData;
  }

  const report = (finalReportData as unknown as DbRideReportWithRating | null) ?? null;
  if (!report) notFound();

  const routeTitle = report.route?.title ?? "";
  const vibe = report.vibe ? VIBE_CONFIG[report.vibe] : null;
  const photos = report.photos ?? [];
  const isOwner = !!userData.user && userData.user.id === report.user_id;

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
                      <vibe.icon size={12} aria-hidden /> {vibe.label}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-[#A1A1AA] mt-0.5">
                  <span>{formatDate(report.ridden_at)} · отчёт о поездке</span>
                  {report.rating != null && (
                    <span className="inline-flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star
                          key={n}
                          size={12}
                          color="#F4632A"
                          fill={n <= report.rating! ? "#F4632A" : "none"}
                        />
                      ))}
                    </span>
                  )}
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
