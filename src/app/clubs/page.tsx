"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { useAuth } from "@/lib/context/AuthContext";
import { supabase, proxyImageUrl } from "@/lib/supabase";
import { CLUB_LIST_SELECT } from "@/lib/queries";
import { dbToClub } from "@/lib/transforms";
import type { Club } from "@/types";
import { Shield, Plus, Users, MapPin, Search, Lock, Globe, X, CheckCircle } from "lucide-react";

type Tab = "mine" | "open" | "all";

export default function ClubsPage() {
  const { user, loading: authLoading } = useAuth();

  const [myClubs, setMyClubs] = useState<Club[]>([]);
  const [allClubs, setAllClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("all");

  useEffect(() => {
    if (authLoading) return;
    loadClubs();
  }, [authLoading, user]);

  useEffect(() => {
    if (!loading && myClubs.length > 0 && tab === "all") setTab("mine");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  async function loadClubs() {
    setLoading(true);

    const allQ = supabase
      .from("clubs")
      .select(CLUB_LIST_SELECT)
      .order("members_count", { ascending: false });

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
      const clubs = (allData ?? []).map(dbToClub);

      setMyClubs(clubs.filter((c) => memberSet.has(c.id)));
      setAllClubs(clubs);
    } else {
      const { data } = await allQ;
      setAllClubs((data ?? []).map(dbToClub));
      setMyClubs([]);
    }

    setLoading(false);
  }

  const myIdSet = new Set(myClubs.map((c) => c.id));
  const baseList: Club[] =
    tab === "mine" ? myClubs
    : tab === "open" ? allClubs.filter((c) => c.visibility === "open" && !myIdSet.has(c.id))
    : allClubs;

  const q = search.trim().toLowerCase();
  const visibleList = q
    ? baseList.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.city?.toLowerCase().includes(q) ||
          c.description?.toLowerCase().includes(q),
      )
    : baseList;

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "mine", label: "Мои",      count: myClubs.length },
    { id: "open", label: "Открытые", count: allClubs.filter((c) => c.visibility === "open" && !myIdSet.has(c.id)).length },
    { id: "all",  label: "Все",      count: allClubs.length },
  ];

  return (
    <div className="min-h-screen bg-[#F5F4F1]">
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-8 pb-24">
        {/* Title row */}
        <div className="flex items-end justify-between gap-3 mb-6 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-[#1C1C1E]">Клубы</h1>
            <p className="text-sm text-[#71717A] mt-1">
              Сообщества велосипедистов вокруг общих маршрутов
            </p>
          </div>
          {user && (
            <Link
              href="/clubs/new"
              className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl text-white shrink-0"
              style={{ backgroundColor: "#0BBFB5" }}
            >
              <Plus size={16} />
              Создать клуб
            </Link>
          )}
        </div>

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
              <ClubCard key={club.id} club={club} isMember={myIdSet.has(club.id)} />
            ))}
          </div>
        ) : (
          <EmptyState
            tab={tab}
            search={search}
            isAuthed={!!user}
            onClearSearch={() => setSearch("")}
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

function ClubCard({ club, isMember }: { club: Club; isMember?: boolean }) {
  const visibilityLabel =
    club.visibility === "request" ? "По заявке"
    : club.visibility === "closed" ? "Закрытый"
    : null;

  return (
    <Link
      href={`/clubs/${club.slug}`}
      className="group flex flex-col bg-white rounded-2xl border border-[#E4E4E7] overflow-hidden hover:border-[#0BBFB5]/50 hover:-translate-y-0.5 transition-all"
      style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}
    >
      {/* Cover */}
      <div className="relative h-20 overflow-hidden shrink-0">
        {club.cover_url ? (
          <Image
            src={proxyImageUrl(club.cover_url) ?? club.cover_url}
            alt=""
            width={400}
            height={80}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full" style={{ background: "linear-gradient(135deg, #E8FAF9 0%, #F0ECFF 100%)" }} />
        )}
        {isMember && (
          <span
            className="absolute top-2 right-2 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full backdrop-blur"
            style={{ backgroundColor: "rgba(11,191,181,0.92)", color: "white" }}
          >
            <CheckCircle size={10} />
            Участник
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-4 pb-4 pt-0 flex-1 flex flex-col">
        {/* Avatar over cover */}
        <div className="-mt-7 mb-2">
          <div
            className="w-12 h-12 rounded-xl overflow-hidden border-2 border-white flex items-center justify-center text-white font-bold text-base shrink-0"
            style={{ backgroundColor: "#0BBFB5" }}
          >
            {club.avatar_url ? (
              <Image
                src={proxyImageUrl(club.avatar_url) ?? club.avatar_url}
                alt={club.name}
                width={48}
                height={48}
                className="w-full h-full object-cover"
              />
            ) : (
              club.name[0].toUpperCase()
            )}
          </div>
        </div>

        {/* Name + visibility */}
        <div className="flex items-start gap-2 mb-1.5">
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

        {/* Meta */}
        <div className="flex items-center gap-3 mb-2 flex-wrap">
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
          {!visibilityLabel && (
            <span className="flex items-center gap-1 text-xs text-[#A1A1AA]">
              <Globe size={11} />
              Открытый
            </span>
          )}
        </div>

        {/* Description */}
        {club.description && (
          <p className="text-xs text-[#71717A] line-clamp-2 mt-auto">{club.description}</p>
        )}
      </div>
    </Link>
  );
}

function EmptyState({
  tab,
  search,
  isAuthed,
  onClearSearch,
}: {
  tab: Tab;
  search: string;
  isAuthed: boolean;
  onClearSearch: () => void;
}) {
  if (search) {
    return (
      <div className="text-center py-16">
        <div
          className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4"
          style={{ backgroundColor: "#E8FAF9" }}
        >
          <Search size={28} style={{ color: "#0BBFB5" }} />
        </div>
        <div className="font-semibold text-[#1C1C1E] mb-1">Ничего не найдено</div>
        <div className="text-sm text-[#71717A] mb-4">Попробуй другое название или город</div>
        <button
          onClick={onClearSearch}
          className="text-sm font-medium text-[#0BBFB5] hover:underline"
        >
          Сбросить поиск
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
          Загляни во вкладку «Открытые» — туда можно вступить в один клик
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
