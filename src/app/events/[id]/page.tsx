"use client";

import { useState, use, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Avatar, AvatarGroup } from "@/components/ui/Avatar";
import { DifficultyBadge, Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/context/AuthContext";
import { useEventLikes } from "@/lib/context/EventLikesContext";
import {
  ChevronLeft, Calendar, Bike, Heart,
  Share2, Users, MapPin, ExternalLink, Flag, ChevronRight, Pencil, Lock, Trash2,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useAuthModal } from "@/components/ui/AuthModal";
import { useToast } from "@/lib/context/ToastContext";
import { useAchievements } from "@/lib/context/AchievementsContext";
import type { User, Route, EventDay, RouteType } from "@/types";

interface EventData {
  id: string;
  title: string;
  description: string;
  start_date: string | null;
  end_date: string | null;
  max_participants: number | null;
  likes_count: number;
  is_private: boolean;
  cover_url: string | null;
  organizer_id: string;
  organizer: User;
  route: Route | null;
  days: EventDay[];
  participants: User[];
}

function dbToUser(p: Record<string, unknown>, color = "#7C5CFC"): User {
  const name = (p.name as string) ?? "Участник";
  return {
    id: p.id as string,
    name,
    initials: name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase(),
    color,
    avatar_url: (p.avatar_url as string | null) ?? null,
    km_total: (p.km_total as number) ?? 0,
    routes_count: (p.routes_count as number) ?? 0,
    events_count: (p.events_count as number) ?? 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToEvent(data: any): EventData {
  const days: EventDay[] = (data.event_days ?? [])
    .sort((a: any, b: any) => a.day_number - b.day_number)
    .map((d: any) => ({
      day: d.day_number,
      date: d.date ?? "",
      title: d.title ?? `День ${d.day_number}`,
      distance_km: d.distance_km ?? 0,
      start_point: d.start_point ?? "",
      end_point: d.end_point ?? "",
      description: d.description ?? "",
      surface_note: d.surface_note ?? undefined,
    }));

  const participants: User[] = (data.event_participants ?? [])
    .filter((p: any) => p.profile)
    .map((p: any) => dbToUser(p.profile, "#0BBFB5"));

  let route: Route | null = null;
  if (data.route) {
    const r = data.route;
    route = {
      id: r.id,
      title: r.title,
      description: r.description ?? "",
      region: r.region ?? "",
      distance_km: r.distance_km ?? 0,
      elevation_m: r.elevation_m ?? 0,
      duration_min: r.duration_min ?? 0,
      difficulty: r.difficulty ?? "medium",
      surface: r.surface ?? [],
      bike_types: r.bike_types ?? [],
      route_types: (r.route_types ?? []) as RouteType[],
      tags: r.tags ?? [],
      author: { id: r.author_id, name: "", initials: "", color: "#F4632A", km_total: 0, routes_count: 0, events_count: 0 },
      riders_today: r.riders_today ?? 0,
      likes: r.likes_count ?? 0,
      mapmagic_url: r.mapmagic_url ?? undefined,
      mapmagic_embed: r.mapmagic_embed ?? undefined,
      cover_url: r.cover_url ?? undefined,
      created_at: r.created_at,
    };
  }

  return {
    id: data.id,
    title: data.title,
    description: data.description ?? "",
    start_date: data.start_date,
    end_date: data.end_date,
    max_participants: data.max_participants,
    likes_count: data.likes_count ?? 0,
    is_private: data.is_private ?? false,
    cover_url: data.cover_url ?? null,
    organizer_id: data.organizer_id,
    organizer: data.organizer ? dbToUser(data.organizer) : { id: data.organizer_id, name: "Организатор", initials: "О", color: "#7C5CFC", km_total: 0, routes_count: 0, events_count: 0 },
    route,
    days,
    participants,
  };
}

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const { isLiked, toggleLike } = useEventLikes();
  const { requireAuth } = useAuthModal();
  const { showToast } = useToast();
  const { checkAndAward } = useAchievements();
  const router = useRouter();
  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [likeCount, setLikeCount] = useState(0);
  const [going, setGoing] = useState(false);
  const [activeDay, setActiveDay] = useState<number | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("events")
        .select(`
          *,
          organizer:profiles!organizer_id(*),
          route:routes!route_id(*, route_images(url)),
          event_days(*),
          event_participants(user_id, profile:profiles!user_id(*))
        `)
        .eq("id", id)
        .single();

      if (!error && data) {
        const ev = dbToEvent(data);
        setEvent(ev);
        setLikeCount(ev.likes_count);
        if (user) setGoing(ev.participants.some((p) => p.id === user.id));
      } else {
        setFetchError(error?.message ?? "Мероприятие не найдено");
      }
      setLoading(false);
    }
    load();
  }, [id, user]);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: event?.title ?? "Мероприятие", url }); } catch { /* dismissed */ }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      } catch { /* ignore */ }
    }
  };

  const handleGoingToggle = async () => {
    if (!requireAuth("записаться на поездку")) return;
    if (!event) return;
    const wasGoing = going;
    setGoing(!wasGoing);
    if (wasGoing) {
      await supabase.from("event_participants").delete().eq("event_id", event.id).eq("user_id", user!.id);
      setEvent((prev) => prev ? { ...prev, participants: prev.participants.filter((p) => p.id !== user!.id) } : prev);
      showToast("Вы отменили участие", "info");
    } else {
      await supabase.from("event_participants").insert({ event_id: event.id, user_id: user!.id });
      showToast("Вы записались на поездку!", "success");
      checkAndAward("event_joined", {});
    }
  };

  const handleDelete = async () => {
    if (!user || !event) return;
    setDeleting(true);
    await supabase.from("event_participants").delete().eq("event_id", event.id);
    await supabase.from("event_days").delete().eq("event_id", event.id);
    await supabase.from("event_likes").delete().eq("event_id", event.id);
    await supabase.from("events").delete().eq("id", event.id);
    const { data: profile } = await supabase.from("profiles").select("events_count").eq("id", user.id).single();
    await supabase.from("profiles").update({ events_count: Math.max(0, (profile?.events_count ?? 1) - 1) }).eq("id", user.id);
    showToast("Мероприятие удалено", "info");
    router.push("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F4F1]">
        <Header />
        <main className="max-w-6xl mx-auto px-4 py-8">
          <div className="h-96 bg-white rounded-2xl animate-pulse border border-[#E4E4E7]" />
        </main>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-[#F5F4F1]">
        <Header />
        <main className="max-w-6xl mx-auto px-4 py-8 text-center">
          <div className="text-4xl mb-3">🗺️</div>
          <h2 className="text-xl font-bold text-[#1C1C1E] mb-2">Мероприятие не найдено</h2>
          {fetchError && <p className="text-sm text-[#71717A] mb-2 font-mono">{fetchError}</p>}
          <Link href="/" className="text-sm text-[#F4632A] hover:underline">← На главную</Link>
        </main>
      </div>
    );
  }

  const totalKm = event.days.reduce((sum, d) => sum + (d.distance_km ?? 0), 0);
  const isMultiDay = event.days.length > 1;
  const isOrganizer = user?.id === event.organizer_id;

  return (
    <div className="min-h-screen bg-[#F5F4F1]">
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-5">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-[#71717A] hover:text-[#1C1C1E] transition-colors">
            <ChevronLeft size={16} /> Лента
          </Link>
          {isOrganizer && (
            <div className="flex items-center gap-2">
              <Link href={`/events/${event.id}/edit`}
                className="inline-flex items-center gap-1.5 text-sm text-[#71717A] hover:text-[#1C1C1E] border border-[#E4E4E7] px-3 py-1.5 rounded-lg hover:bg-[#F5F4F1] transition-colors">
                <Pencil size={14} /> Редактировать
              </Link>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="inline-flex items-center gap-1.5 text-sm text-[#EF4444] hover:text-[#DC2626] border border-[#FECACA] px-3 py-1.5 rounded-lg hover:bg-[#FEF2F2] transition-colors">
                <Trash2 size={14} /> Удалить
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          {/* Left */}
          <div className="space-y-5">
            {/* Hero */}
            <div className="rounded-2xl text-white relative overflow-hidden"
              style={{ background: event.cover_url ? undefined : "linear-gradient(135deg, #0BBFB5 0%, #7C5CFC 100%)" }}>
              {event.cover_url ? (
                <>
                  <img src={event.cover_url} alt={event.title} className="absolute inset-0 w-full h-full object-cover" />
                  <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.15) 60%, transparent 100%)" }} />
                </>
              ) : (
                <div className="absolute inset-0 opacity-10">
                  <svg viewBox="0 0 800 250" className="w-full h-full" preserveAspectRatio="none">
                    <path d="M0,125 Q100,60 200,110 Q300,160 400,80 Q500,20 600,90 Q700,140 800,60 L800,250 L0,250 Z" fill="white" />
                  </svg>
                </div>
              )}
              <div className="relative p-8">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  {isMultiDay && <Badge className="bg-white/20 text-white border-0">🏕️ {event.days.length}-дневный велопоход</Badge>}
                  {event.route?.region && <Badge className="bg-white/20 text-white border-0">📍 {event.route.region}</Badge>}
                  {event.is_private && (
                    <Badge className="bg-white/20 text-white border-0 flex items-center gap-1">
                      <Lock size={10} /> Закрытое
                    </Badge>
                  )}
                </div>
                <h1 className="text-3xl font-bold mb-2 leading-tight">{event.title}</h1>
                <div className="flex flex-wrap items-center gap-4 text-white/80 text-sm">
                  {event.start_date && (
                    <span className="flex items-center gap-1.5">
                      <Calendar size={14} />
                      {formatDate(event.start_date)}{isMultiDay && event.end_date ? ` — ${formatDate(event.end_date)}` : ""}
                    </span>
                  )}
                  {totalKm > 0 && <span className="flex items-center gap-1.5"><Bike size={14} /> {totalKm} км всего</span>}
                  <span className="flex items-center gap-1.5">
                    <Users size={14} />
                    {event.participants.length}{event.max_participants ? `/${event.max_participants}` : ""} участников
                  </span>
                </div>
              </div>
            </div>

            {/* Map embed */}
            {event.route?.mapmagic_embed && (
              <div className="bg-white rounded-2xl overflow-hidden border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
                <iframe src={event.route.mapmagic_embed} className="w-full" style={{ height: 380, border: "none" }} allowFullScreen title={event.route.title} />
                <div className="px-4 py-2.5 border-t border-[#F5F4F1] flex items-center justify-between">
                  <span className="text-xs text-[#71717A]">Маршрут: {event.route.title}</span>
                  {event.route.mapmagic_url && (
                    <a href={event.route.mapmagic_url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs hover:underline" style={{ color: "#F4632A" }}>
                      Открыть в MapMagic <ExternalLink size={11} />
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Description */}
            {event.description && (
              <div className="bg-white rounded-2xl p-6 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
                <h2 className="font-semibold text-[#1C1C1E] mb-3">О поездке</h2>
                <div className="prose prose-sm max-w-none text-[#71717A] leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: event.description }} />
              </div>
            )}

            {/* Days */}
            {event.days.length > 0 && (
              <div className="space-y-3">
                {isMultiDay && (
                  <h2 className="font-semibold text-[#1C1C1E] text-lg flex items-center gap-2">
                    <Flag size={18} style={{ color: "#F4632A" }} /> По дням
                  </h2>
                )}
                {event.days.map((day) => {
                  const isOpen = activeDay === day.day;
                  return (
                    <div key={day.day} className="bg-white rounded-2xl overflow-hidden border border-[#E4E4E7] transition-all"
                      style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
                      <button className="w-full text-left p-5 flex items-center gap-4 hover:bg-[#FAFAF9] transition-colors"
                        onClick={() => setActiveDay(isOpen ? null : day.day)}>
                        <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shrink-0"
                          style={{ backgroundColor: "#F4632A" }}>
                          {day.day}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-[#1C1C1E] text-sm mb-0.5">{day.title}</div>
                          <div className="flex items-center gap-3 text-xs text-[#71717A]">
                            {day.date && <span>{formatDate(day.date)}</span>}
                            {day.distance_km > 0 && <span className="flex items-center gap-1"><Bike size={11} /> {day.distance_km} км</span>}
                            {day.start_point && (
                              <span className="hidden sm:flex items-center gap-1">
                                <MapPin size={11} /> {day.start_point} → {day.end_point}
                              </span>
                            )}
                          </div>
                        </div>
                        {day.surface_note && <Badge variant="outline" className="hidden sm:inline-flex shrink-0">{day.surface_note}</Badge>}
                        <ChevronRight size={16} className="shrink-0 transition-transform duration-200 text-[#A1A1AA]"
                          style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }} />
                      </button>
                      {isOpen && day.description && (
                        <div className="px-5 pb-5 border-t border-[#F5F4F1]">
                          <div className="pt-4 prose prose-sm max-w-none text-[#71717A] leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: day.description }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Participants */}
            <div className="bg-white rounded-2xl p-6 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
              <h2 className="font-semibold text-[#1C1C1E] mb-4 flex items-center gap-2">
                <Users size={18} style={{ color: "#0BBFB5" }} />
                Участники ({event.participants.length}{event.max_participants ? `/${event.max_participants}` : ""})
              </h2>
              <div className="flex flex-wrap gap-3">
                {event.participants.map((p) => (
                  <Link key={p.id} href={`/users/${p.id}`} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                    <Avatar user={p} size="sm" />
                    <span className="text-sm text-[#1C1C1E]">{p.name}</span>
                  </Link>
                ))}
                {event.participants.length === 0 && (
                  <p className="text-sm text-[#A1A1AA]">Пока никто не записался</p>
                )}
              </div>
              {event.max_participants && event.participants.length > 0 && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-[#71717A] mb-1">
                    <span>Мест занято</span>
                    <span>{event.participants.length}/{event.max_participants}</span>
                  </div>
                  <div className="h-2 rounded-full bg-[#F5F4F1] overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${(event.participants.length / event.max_participants) * 100}%`, background: "linear-gradient(90deg, #0BBFB5, #7C5CFC)" }} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right */}
          <aside>
            <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7] sticky top-24"
              style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
              <Link href={`/users/${event.organizer.id}`} className="flex items-center gap-3 mb-4 pb-4 border-b border-[#F5F4F1] hover:opacity-80 transition-opacity">
                <Avatar user={event.organizer} size="md" />
                <div>
                  <div className="text-xs text-[#71717A]">Организатор</div>
                  <div className="font-medium text-[#1C1C1E]">{event.organizer.name}</div>
                </div>
              </Link>

              {event.is_private && (
                <div className="flex items-center gap-1.5 text-xs text-[#71717A] bg-[#F5F4F1] rounded-lg px-3 py-2 mb-4">
                  <Lock size={11} /> Доступно только по прямой ссылке
                </div>
              )}

              <div className="space-y-2.5 mb-5">
                {event.start_date && (
                  <div className="flex justify-between text-sm">
                    <span className="text-[#71717A]">Даты</span>
                    <span className="font-medium text-[#1C1C1E]">
                      {formatDate(event.start_date)}{isMultiDay && event.end_date ? ` — ${formatDate(event.end_date)}` : ""}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-[#71717A]">Дней</span>
                  <span className="font-medium text-[#1C1C1E]">{event.days.length}</span>
                </div>
                {totalKm > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-[#71717A]">Всего км</span>
                    <span className="font-medium text-[#1C1C1E]">{totalKm} км</span>
                  </div>
                )}
                {event.route && (
                  <div className="flex justify-between text-sm">
                    <span className="text-[#71717A]">Сложность</span>
                    <DifficultyBadge difficulty={event.route.difficulty} />
                  </div>
                )}
                {event.max_participants && (
                  <div className="flex justify-between text-sm">
                    <span className="text-[#71717A]">Мест</span>
                    <span className="font-medium" style={{ color: event.participants.length >= event.max_participants ? "#EF4444" : "#22C55E" }}>
                      {event.max_participants - event.participants.length} свободно
                    </span>
                  </div>
                )}
              </div>

              {event.participants.length > 0 && (
                <div className="mb-5">
                  <AvatarGroup users={event.participants} max={5} label={`${event.participants.length} едут`} />
                </div>
              )}

              <div className="mb-3">
                <Button variant={going ? "outline" : "secondary"} size="lg" className="w-full" onClick={handleGoingToggle}>
                  {going ? "✓ Ты едешь!" : "Я поеду →"}
                </Button>
              </div>

              {event.route && (
                <Link href={`/routes/${event.route.id}`}
                  className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-[#E4E4E7] text-sm text-[#71717A] hover:bg-[#F5F4F1] transition-colors mb-3">
                  <Bike size={14} /> Посмотреть маршрут
                </Link>
              )}

              <div className="flex gap-2">
                <div className="flex-1">
                  <button
                    onClick={async () => {
                      if (!requireAuth("поставить лайк")) return;
                      const wasLiked = isLiked(event.id);
                      setLikeCount((c) => wasLiked ? c - 1 : c + 1);
                      await toggleLike(event.id, likeCount);
                      showToast(wasLiked ? "Лайк убран" : "Мероприятие отмечено", "info");
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-[#E4E4E7] text-sm transition-colors hover:bg-[#F5F4F1]"
                    style={{ color: isLiked(event.id) ? "#F4632A" : "#71717A" }}>
                    <Heart size={14} fill={isLiked(event.id) ? "#F4632A" : "none"} /> {likeCount}
                  </button>
                </div>
                <div className="flex-1">
                  <button
                    onClick={handleShare}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-[#E4E4E7] text-sm text-[#71717A] hover:bg-[#F5F4F1] transition-colors">
                    <Share2 size={14} /> {shareCopied ? "Скопировано!" : "Поделиться"}
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-[#FEF2F2] flex items-center justify-center">
                <Trash2 size={18} className="text-[#EF4444]" />
              </div>
              <h2 className="font-bold text-[#1C1C1E] text-lg">Удалить мероприятие?</h2>
            </div>
            <p className="text-sm text-[#71717A] mb-5">
              Это действие нельзя отменить. Мероприятие «{event.title}» и все данные будут удалены.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl border border-[#E4E4E7] text-sm font-medium text-[#71717A] hover:bg-[#F5F4F1] transition-colors disabled:opacity-50">
                Отмена
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: deleting ? "#FCA5A5" : "#EF4444" }}>
                {deleting ? "Удаление..." : "Удалить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
