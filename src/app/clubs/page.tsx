"use client";

import React, { useState, useEffect, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { CommunityTabs } from "@/components/layout/CommunityTabs";
import { useAuth } from "@/lib/context/AuthContext";
import { useAuthModal } from "@/components/ui/AuthModal";
import { supabase, proxyImageUrl } from "@/lib/supabase";
import { CLUB_LIST_SELECT } from "@/lib/queries";
import { dbToClub } from "@/lib/transforms";
import type { Club } from "@/types";
import { Shield, Plus, Users, MapPin, Search, Lock, Globe, X, CheckCircle, ArrowUpDown, Calendar, Map as MapIcon } from "lucide-react";
import type { ClubVisibility } from "@/types";

type Tab = "mine" | "all";
type Sort = "activity" | "members" | "new" | "name";
type VisFilter = "any" | ClubVisibility;

type ClubExtra = { nextEvent?: { title: string; start_date: string }; routesCount: number };

const ACTIVE_WINDOW_DAYS = 21;

function timeAgo(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days < 1) return "сегодня";
  if (days === 1) return "вчера";
  if (days < 7) return `${days} дн. назад`;
  if (days < 30) return `${Math.floor(days / 7)} нед. назад`;
  if (days < 365) return `${Math.floor(days / 30)} мес. назад`;
  return `${Math.floor(days / 365)} г. назад`;
}

function formatEventDate(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (isToday) return `сегодня, ${d.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}`;
  if (d.toDateString() === tomorrow.toDateString()) return `завтра, ${d.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}`;
  return d.toLocaleDateString("ru", { day: "numeric", month: "short" });
}

const VIS_LABELS: Record<VisFilter, string> = {
  any:     "Все",
  open:    "Открытые",
  request: "По заявке",
  closed:  "Закрытые",
};

const SORT_LABELS: Record<Sort, string> = {
  activity: "По активности",
  members:  "По числу участников",
  new:      "Новые",
  name:     "По алфавиту",
};

function sortClubs(list: Club[], sort: Sort): Club[] {
  const arr = [...list];
  switch (sort) {
    case "activity":
      arr.sort((a, b) => {
        const ta = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0;
        const tb = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0;
        return tb - ta;
      });
      break;
    case "members":
      arr.sort((a, b) => b.members_count - a.members_count);
      break;
    case "new":
      arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      break;
    case "name":
      arr.sort((a, b) => a.name.localeCompare(b.name, "ru"));
      break;
  }
  return arr;
}

function ClubsPageInner() {
  const { user, loading: authLoading } = useAuth();
  const { requireAuth } = useAuthModal();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabFromQuery = searchParams.get("tab") === "mine";

  const [myClubs, setMyClubs] = useState<Club[]>([]);
  const [allClubs, setAllClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>(tabFromQuery ? "mine" : "all");
  const [sort, setSort] = useState<Sort>("activity");
  const [vis, setVis] = useState<VisFilter>("any");
  const [city, setCity] = useState<string>("");
  const [extras, setExtras] = useState<Record<string, ClubExtra>>({});

  useEffect(() => {
    if (authLoading) return;
    loadClubs();
  }, [authLoading, user]);

  useEffect(() => {
    if (!loading && myClubs.length > 0 && tab === "all" && !tabFromQuery) setTab("mine");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  async function loadClubs() {
    setLoading(true);

    const allQ = supabase
      .from("clubs")
      .select(CLUB_LIST_SELECT)
      .order("last_activity_at", { ascending: false, nullsFirst: false });

    let clubs: Club[] = [];

    if (user) {
      const [{ data: allData }, { data: myIds }] = await Promise.all([
        allQ,
        supabase
          .from("club_members")
          .select("club_id")
          .eq("user_id", user.id)
          .eq("status", "active"),
      ]);

      const memberSet = new Set((myIds ?? []).map((r: { club_id: string }) => r.club_id));
      clubs = (allData ?? []).map(dbToClub);

      setMyClubs(clubs.filter((c) => memberSet.has(c.id)));
      setAllClubs(clubs);
    } else {
      const { data } = await allQ;
      clubs = (data ?? []).map(dbToClub);
      setAllClubs(clubs);
      setMyClubs([]);
    }

    setLoading(false);
    loadExtras(clubs.map((c) => c.id));
  }

  async function loadExtras(ids: string[]) {
    if (ids.length === 0) {
      setExtras({});
      return;
    }

    const [eventsRes, routesRes] = await Promise.all([
      supabase
        .from("events")
        .select("club_id, title, start_date")
        .in("club_id", ids)
        .gte("start_date", new Date().toISOString())
        .order("start_date", { ascending: true }),
      supabase.from("routes").select("club_id").in("club_id", ids),
    ]);

    const next: Record<string, ClubExtra> = {};
    for (const id of ids) next[id] = { routesCount: 0 };

    for (const r of (routesRes.data ?? []) as { club_id: string | null }[]) {
      if (r.club_id && next[r.club_id]) next[r.club_id].routesCount += 1;
    }
    for (const e of (eventsRes.data ?? []) as { club_id: string | null; title: string; start_date: string }[]) {
      if (e.club_id && next[e.club_id] && !next[e.club_id].nextEvent) {
        next[e.club_id].nextEvent = { title: e.title, start_date: e.start_date };
      }
    }

    setExtras(next);
  }

  const myIdSet = new Set(myClubs.map((c) => c.id));
  const baseList: Club[] = tab === "mine" ? myClubs : allClubs;

  const q = search.trim().toLowerCase();
  const filtered = baseList.filter((c) => {
    if (vis !== "any" && c.visibility !== vis) return false;
    if (city && c.city !== city) return false;
    if (q) {
      const hit =
        c.name.toLowerCase().includes(q) ||
        c.city?.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });
  const visibleList = sortClubs(filtered, sort);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "mine", label: "Мои", count: myClubs.length },
    { id: "all",  label: "Все", count: allClubs.length },
  ];

  // City options derived from the pool we currently look at (so "Мои" tab shows only cities of joined clubs).
  const cityOptions = Array.from(
    new Set(baseList.map((c) => c.city).filter((s): s is string => !!s)),
  ).sort((a, b) => a.localeCompare(b, "ru"));

  // Visibility counts for chip badges (reflect tab + city, ignore vis itself).
  const visCounts = baseList.reduce(
    (acc, c) => {
      if (city && c.city !== city) return acc;
      acc.any += 1;
      acc[c.visibility] = (acc[c.visibility] ?? 0) + 1;
      return acc;
    },
    { any: 0, open: 0, request: 0, closed: 0 } as Record<VisFilter, number>,
  );

  const hasActiveFilters = vis !== "any" || !!city || !!search;

  const showOrganizerHero = !loading && myClubs.length === 0;

  const registerClub = () => {
    if (!requireAuth("зарегистрировать клуб")) return;
    router.push("/clubs/new");
  };

  return (
    <div className="min-h-screen bg-[#F5F4F1]">
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-8 pb-24">
        <CommunityTabs />
        {/* Title row */}
        <div className="flex items-end justify-between gap-3 mb-6 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-[#1C1C1E]">Клубы</h1>
            <p className="text-sm text-[#71717A] mt-1">
              Сообщества велосипедистов вокруг общих маршрутов
            </p>
          </div>
          {!showOrganizerHero && (
            <button
              onClick={registerClub}
              className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl text-white shrink-0"
              style={{ backgroundColor: "#0BBFB5" }}
            >
              <Plus size={16} />
              Зарегистрировать клуб
            </button>
          )}
        </div>

        {/* Organizer showcase hero: shown to guests and users without a club */}
        {showOrganizerHero && (
          <div
            className="rounded-2xl p-5 sm:p-6 mb-6"
            style={{ backgroundColor: "#FFF0EB" }}
          >
            <h2 className="text-lg sm:text-xl font-bold text-[#1C1C1E] leading-snug">
              Ваш клуб уже катается в Telegram?
            </h2>
            <p className="text-sm text-[#71717A] mt-2 max-w-2xl">
              Дайте ему витрину: страница клуба, библиотека маршрутов, календарь заездов и заявки на вступление — в одном месте.
            </p>

            <div className="flex flex-wrap gap-2 mt-4">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-white/60 text-[#7A3A22]">
                <MapIcon size={12} />
                маршруты клуба
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-white/60 text-[#7A3A22]">
                <Calendar size={12} />
                заезды
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-white/60 text-[#7A3A22]">
                <Users size={12} />
                заявки
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mt-4">
              <button
                onClick={registerClub}
                className="inline-flex items-center justify-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl text-white shrink-0"
                style={{ backgroundColor: "#F4632A" }}
              >
                <Plus size={16} />
                Зарегистрировать клуб
              </button>
              <span className="text-xs text-[#71717A]">Две минуты, бесплатно</span>
            </div>
          </div>
        )}

        {/* Tabs + search */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <div
            className="flex gap-1 bg-white rounded-xl p-1 border border-[#E4E4E7]"
            style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.05)" }}
          >
            {tabs.map((t) => {
              const disabled = t.id === "mine" && t.count === 0;
              return (
                <button
                  key={t.id}
                  onClick={() => !disabled && setTab(t.id)}
                  disabled={disabled}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={
                    tab === t.id
                      ? { backgroundColor: "#1C1C1E", color: "white" }
                      : { color: "#71717A" }
                  }
                >
                  {t.label}
                  {t.count > 0 && (
                    <span
                      className="text-[11px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center"
                      style={
                        tab === t.id
                          ? { backgroundColor: "rgba(255,255,255,0.2)", color: "white" }
                          : { backgroundColor: "#F5F4F1", color: "#71717A" }
                      }
                    >
                      {t.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A1A1AA]" />
            <input
              type="text"
              placeholder="Название, город, описание…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-9 py-2.5 bg-white border border-[#E4E4E7] rounded-xl text-sm text-[#1C1C1E] placeholder-[#A1A1AA] focus:outline-none focus:border-[#0BBFB5] focus:ring-2 focus:ring-[#0BBFB5]/20 transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full text-[#A1A1AA] hover:text-[#1C1C1E] hover:bg-[#F5F4F1] transition-colors"
                aria-label="Очистить"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <SelectControl
            icon={<ArrowUpDown size={14} />}
            value={sort}
            onChange={(v) => setSort(v as Sort)}
            options={(Object.keys(SORT_LABELS) as Sort[]).map((s) => ({ value: s, label: SORT_LABELS[s] }))}
          />
        </div>

        {/* Filter row: visibility chips + city */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <div className="flex gap-1.5 flex-wrap">
            {(Object.keys(VIS_LABELS) as VisFilter[]).map((v) => {
              const active = vis === v;
              const count = visCounts[v];
              const disabled = count === 0 && v !== "any";
              return (
                <button
                  key={v}
                  onClick={() => !disabled && setVis(v)}
                  disabled={disabled}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={
                    active
                      ? { backgroundColor: "#1C1C1E", color: "white", borderColor: "#1C1C1E" }
                      : { backgroundColor: "white", color: "#71717A", borderColor: "#E4E4E7" }
                  }
                >
                  {VIS_LABELS[v]}
                  {count > 0 && (
                    <span
                      className="text-[10px] font-bold px-1 rounded"
                      style={
                        active
                          ? { backgroundColor: "rgba(255,255,255,0.2)", color: "white" }
                          : { color: "#A1A1AA" }
                      }
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {cityOptions.length > 0 && (
            <SelectControl
              compact
              icon={<MapPin size={12} />}
              value={city}
              onChange={setCity}
              options={[
                { value: "", label: "Все города" },
                ...cityOptions.map((c) => ({ value: c, label: c })),
              ]}
            />
          )}

          {hasActiveFilters && (
            <button
              onClick={() => { setSearch(""); setVis("any"); setCity(""); }}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#A1A1AA] hover:text-[#1C1C1E] transition-colors ml-auto"
            >
              <X size={12} />
              Сбросить фильтры
            </button>
          )}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-44 bg-white rounded-2xl animate-pulse border border-[#E4E4E7]" />
            ))}
          </div>
        ) : visibleList.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleList.map((club) => (
              <ClubCard
                key={club.id}
                club={club}
                isMember={myIdSet.has(club.id)}
                extra={extras[club.id]}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            tab={tab}
            hasFilters={hasActiveFilters}
            isAuthed={!!user}
            onReset={() => { setSearch(""); setVis("any"); setCity(""); }}
          />
        )}

        {!user && !loading && (
          <div
            className="mt-8 rounded-2xl p-5 border border-[#E4E4E7] flex items-center justify-between gap-4 flex-wrap"
            style={{ backgroundColor: "#F0FFFE", boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}
          >
            <p className="text-sm text-[#71717A]">
              Войди, чтобы вступить в существующий клуб или создать свой
            </p>
            <Link
              href="/auth/login"
              className="inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl text-white shrink-0"
              style={{ backgroundColor: "#0BBFB5" }}
            >
              Войти
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}

export default function ClubsPage() {
  return (
    <Suspense>
      <ClubsPageInner />
    </Suspense>
  );
}

function SelectControl({
  icon,
  value,
  onChange,
  options,
  compact = false,
}: {
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  compact?: boolean;
}) {
  const padY = compact ? "py-1.5" : "py-2.5";
  const radius = compact ? "rounded-lg" : "rounded-xl";
  const textSize = compact ? "text-xs font-medium" : "text-sm";
  const padL = compact ? "pl-7" : "pl-9";
  const padR = compact ? "pr-6" : "pr-8";
  const iconL = compact ? "left-2" : "left-3";
  const iconR = compact ? "right-1.5" : "right-2.5";
  const maxW = compact ? "max-w-[160px]" : "max-w-[180px]";

  return (
    <div className="relative">
      <span className={`absolute ${iconL} top-1/2 -translate-y-1/2 text-[#A1A1AA] pointer-events-none`}>
        {icon}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`appearance-none ${padL} ${padR} ${padY} bg-white border border-[#E4E4E7] ${radius} ${textSize} text-[#1C1C1E] focus:outline-none focus:border-[#0BBFB5] focus:ring-2 focus:ring-[#0BBFB5]/20 transition-all cursor-pointer ${maxW} truncate`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <svg
        className={`absolute ${iconR} top-1/2 -translate-y-1/2 text-[#A1A1AA] pointer-events-none`}
        width="10" height="10" viewBox="0 0 10 10" fill="none"
      >
        <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  );
}

function ClubCard({
  club,
  isMember,
  extra,
}: {
  club: Club;
  isMember?: boolean;
  extra?: ClubExtra;
}) {
  const visibilityLabel =
    club.visibility === "request" ? "По заявке"
    : club.visibility === "closed" ? "Закрытый"
    : null;

  const isActive =
    !!club.last_activity_at &&
    Date.now() - new Date(club.last_activity_at).getTime() < ACTIVE_WINDOW_DAYS * 86400000;
  const dimmed = !extra?.nextEvent && !isActive;

  return (
    <Link
      href={`/clubs/${club.slug}`}
      className="group flex flex-col bg-white rounded-2xl border border-[#E4E4E7] overflow-hidden hover:border-[#0BBFB5]/50 hover:-translate-y-0.5 transition-all"
      style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)", opacity: dimmed ? 0.7 : 1 }}
    >
      {/* Header: avatar + name + visibility */}
      <div className="flex items-start gap-3 p-4 pb-3">
        <div
          className="relative w-11 h-11 rounded-xl overflow-hidden flex items-center justify-center text-white font-bold text-base shrink-0"
          style={{ backgroundColor: "#0BBFB5" }}
        >
          {club.avatar_url ? (
            <Image
              src={proxyImageUrl(club.avatar_url) ?? club.avatar_url}
              alt={club.name}
              width={44}
              height={44}
              className="w-full h-full object-cover"
            />
          ) : (
            club.name[0].toUpperCase()
          )}
          {isMember && (
            <span
              className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center border-2 border-white"
              style={{ backgroundColor: "#0BBFB5" }}
              title="Ты участник"
            >
              <CheckCircle size={9} color="white" />
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <h3 className="font-semibold text-sm text-[#1C1C1E] leading-snug line-clamp-2 flex-1">
              {club.name}
            </h3>
            {visibilityLabel && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-[#F5F4F1] text-[#71717A] shrink-0 mt-0.5"
                title={visibilityLabel}
              >
                <Lock size={9} />
                {visibilityLabel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2.5 mt-1 flex-wrap">
            <span className="flex items-center gap-1 text-xs text-[#A1A1AA]">
              <Users size={11} />
              {club.members_count}
            </span>
            {club.city && (
              <span className="flex items-center gap-1 text-xs text-[#A1A1AA]">
                <MapPin size={11} />
                {club.city}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Activity signal */}
      <div className="px-4 mb-3">
        {extra?.nextEvent ? (
          <div
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5"
            style={{ backgroundColor: "#E8FAF9" }}
          >
            <Calendar size={12} style={{ color: "#0BBFB5" }} className="shrink-0" />
            <span className="text-xs font-medium truncate" style={{ color: "#085041" }}>
              Заезд {formatEventDate(extra.nextEvent.start_date)}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-[#A1A1AA]">
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: isActive ? "#0BBFB5" : "#D4D4D8" }}
            />
            {club.last_activity_at ? `Активность ${timeAgo(club.last_activity_at)}` : "Пока тихо"}
          </div>
        )}
      </div>

      {/* Description */}
      {club.description && (
        <p className="px-4 text-xs text-[#71717A] line-clamp-2 mb-3">{club.description}</p>
      )}

      {/* Footer stats */}
      <div className="mt-auto px-4 py-2.5 border-t border-[#F0F0EE] flex items-center justify-between text-xs text-[#A1A1AA]">
        <span className="flex items-center gap-1">
          <MapIcon size={11} />
          {extra ? `${extra.routesCount} маршрутов` : "…"}
        </span>
        <span className="flex items-center gap-1">
          {visibilityLabel ? <Lock size={11} /> : <Globe size={11} />}
          {visibilityLabel ?? "Открытый"}
        </span>
      </div>
    </Link>
  );
}

function EmptyState({
  tab,
  hasFilters,
  isAuthed,
  onReset,
}: {
  tab: Tab;
  hasFilters: boolean;
  isAuthed: boolean;
  onReset: () => void;
}) {
  if (hasFilters) {
    return (
      <div className="text-center py-16">
        <div
          className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4"
          style={{ backgroundColor: "#E8FAF9" }}
        >
          <Search size={28} style={{ color: "#0BBFB5" }} />
        </div>
        <div className="font-semibold text-[#1C1C1E] mb-1">Ничего не найдено</div>
        <div className="text-sm text-[#71717A] mb-4">Попробуй ослабить фильтры</div>
        <button
          onClick={onReset}
          className="text-sm font-medium text-[#0BBFB5] hover:underline"
        >
          Сбросить
        </button>
      </div>
    );
  }

  if (tab === "mine") {
    return (
      <div className="text-center py-16">
        <div
          className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4"
          style={{ backgroundColor: "#E8FAF9" }}
        >
          <Users size={28} style={{ color: "#0BBFB5" }} />
        </div>
        <div className="font-semibold text-[#1C1C1E] mb-1">Ты пока не в клубах</div>
        <div className="text-sm text-[#71717A]">
          Переключись на «Все» и выбери клуб, в который хочется
        </div>
      </div>
    );
  }

  return (
    <div className="text-center py-16">
      <div
        className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4"
        style={{ backgroundColor: "#E8FAF9" }}
      >
        <Shield size={28} style={{ color: "#0BBFB5" }} />
      </div>
      <div className="font-semibold text-[#1C1C1E] mb-1">Клубов пока нет</div>
      <div className="text-sm text-[#71717A] mb-4">Стань первым — создай велоклуб</div>
      {isAuthed && (
        <Link
          href="/clubs/new"
          className="inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl text-white"
          style={{ backgroundColor: "#0BBFB5" }}
        >
          <Plus size={16} />
          Создать клуб
        </Link>
      )}
    </div>
  );
}
