"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { useAuth } from "@/lib/context/AuthContext";
import { supabase, proxyImageUrl } from "@/lib/supabase";
import { CLUB_LIST_SELECT } from "@/lib/queries";
import { dbToClub } from "@/lib/transforms";
import type { Club } from "@/types";
import { Shield, Plus, Users, MapPin, ChevronRight, Search, Lock, ArrowLeft } from "lucide-react";

export default function ClubsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [myClubs, setMyClubs] = useState<Club[]>([]);
  const [allClubs, setAllClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (authLoading) return;
    loadClubs();
  }, [authLoading, user]);

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
      setAllClubs(clubs.filter((c) => !memberSet.has(c.id)));
    } else {
      const { data } = await allQ;
      setAllClubs((data ?? []).map(dbToClub));
      setMyClubs([]);
    }

    setLoading(false);
  }

  const filteredAll = allClubs.filter(
    (c) =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.city?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-[#F5F4F1]">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-8 pb-24">
        <Link
          href="/profile"
          className="inline-flex items-center gap-1.5 text-sm text-[#71717A] hover:text-[#1C1C1E] transition-colors mb-6"
        >
          <ArrowLeft size={14} />
          Профиль
        </Link>

        {/* Header row */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-[#1C1C1E]">Клубы</h1>
          {user && (
            <Link
              href="/clubs/new"
              className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl text-white"
              style={{ backgroundColor: "#0BBFB5" }}
            >
              <Plus size={16} />
              Создать клуб
            </Link>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-white rounded-2xl animate-pulse border border-[#E4E4E7]" />
            ))}
          </div>
        ) : (
          <>
            {/* My clubs */}
            {myClubs.length > 0 && (
              <section className="mb-8">
                <h2 className="text-sm font-semibold text-[#71717A] uppercase tracking-wide mb-3">
                  Мои клубы
                </h2>
                <div className="space-y-2">
                  {myClubs.map((club) => (
                    <ClubCard key={club.id} club={club} isMember />
                  ))}
                </div>
              </section>
            )}

            {/* Search */}
            <div className="relative mb-4">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A1A1AA]" />
              <input
                type="text"
                placeholder="Поиск по названию или городу…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-white border border-[#E4E4E7] rounded-xl text-sm text-[#1C1C1E] placeholder-[#A1A1AA] focus:outline-none focus:border-[#0BBFB5]"
              />
            </div>

            {/* All clubs */}
            {filteredAll.length > 0 ? (
              <section>
                <h2 className="text-sm font-semibold text-[#71717A] uppercase tracking-wide mb-3">
                  {search ? "Результаты поиска" : "Все клубы"}
                </h2>
                <div className="space-y-2">
                  {filteredAll.map((club) => (
                    <ClubCard key={club.id} club={club} />
                  ))}
                </div>
              </section>
            ) : (
              <div className="text-center py-16">
                <div
                  className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: "#E8FAF9" }}
                >
                  <Shield size={28} style={{ color: "#0BBFB5" }} />
                </div>
                {search ? (
                  <>
                    <div className="font-semibold text-[#1C1C1E] mb-1">Ничего не найдено</div>
                    <div className="text-sm text-[#71717A]">Попробуй другое название или город</div>
                  </>
                ) : (
                  <>
                    <div className="font-semibold text-[#1C1C1E] mb-1">Клубов пока нет</div>
                    <div className="text-sm text-[#71717A] mb-4">Стань первым — создай велоклуб</div>
                    {user && (
                      <Link
                        href="/clubs/new"
                        className="inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl text-white"
                        style={{ backgroundColor: "#0BBFB5" }}
                      >
                        <Plus size={16} />
                        Создать клуб
                      </Link>
                    )}
                  </>
                )}
              </div>
            )}

            {!user && (
              <div
                className="mt-8 rounded-2xl p-5 border border-[#E4E4E7] text-center"
                style={{ backgroundColor: "#F0FFFE", boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}
              >
                <p className="text-sm text-[#71717A] mb-3">
                  Войди, чтобы создать клуб или вступить в существующий
                </p>
                <Link
                  href="/auth/login"
                  className="inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl text-white"
                  style={{ backgroundColor: "#0BBFB5" }}
                >
                  Войти
                </Link>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function ClubCard({ club, isMember }: { club: Club; isMember?: boolean }) {
  const visibilityLabel =
    club.visibility === "request" ? "По заявке" : club.visibility === "closed" ? "Закрытый" : null;

  return (
    <Link
      href={`/clubs/${club.slug}`}
      className="flex items-center gap-3 bg-white rounded-2xl p-4 border border-[#E4E4E7] hover:border-[#0BBFB5]/50 transition-colors"
      style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}
    >
      {/* Avatar */}
      <div
        className="w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center shrink-0 text-white font-bold text-lg"
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

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-[#1C1C1E] truncate">{club.name}</span>
          {visibilityLabel && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-[#F5F4F1] text-[#71717A] shrink-0">
              <Lock size={9} />
              {visibilityLabel}
            </span>
          )}
          {isMember && (
            <span className="inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded-md shrink-0" style={{ backgroundColor: "#E8FAF9", color: "#0BBFB5" }}>
              Участник
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
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
        {club.description && (
          <p className="text-xs text-[#71717A] mt-0.5 truncate">{club.description}</p>
        )}
      </div>

      <ChevronRight size={16} className="text-[#A1A1AA] shrink-0" />
    </Link>
  );
}
