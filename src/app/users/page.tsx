"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Avatar } from "@/components/ui/Avatar";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/context/AuthContext";
import { useFollow } from "@/lib/context/FollowContext";
import { Search, UserPlus, UserCheck, Map, Bike, ArrowUpDown, Users } from "lucide-react";
import type { DbProfile } from "@/lib/supabase";

type SortKey = "name" | "km_total" | "routes_count" | "created_at";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "name", label: "По имени" },
  { key: "km_total", label: "По километрам" },
  { key: "routes_count", label: "По маршрутам" },
  { key: "created_at", label: "По дате регистрации" },
];

export default function UsersPage() {
  const { user } = useAuth();
  const { isFollowing, follow, unfollow, loaded: followLoaded } = useFollow();

  const [profiles, setProfiles] = useState<DbProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("km_total");
  const [followBusy, setFollowBusy] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("*")
      .order("km_total", { ascending: false })
      .then(({ data }) => {
        if (data) setProfiles(data as DbProfile[]);
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    let result = profiles;

    if (q) {
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.username && p.username.toLowerCase().includes(q)) ||
          (p.bio && p.bio.toLowerCase().includes(q))
      );
    }

    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name, "ru");
        case "km_total":
          return b.km_total - a.km_total;
        case "routes_count":
          return b.routes_count - a.routes_count;
        case "created_at":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        default:
          return 0;
      }
    });

    return result;
  }, [profiles, search, sortBy]);

  const handleFollowToggle = async (profileId: string) => {
    if (!user || followBusy) return;
    setFollowBusy(profileId);
    if (isFollowing(profileId)) {
      await unfollow(profileId);
    } else {
      await follow(profileId);
    }
    setFollowBusy(null);
  };

  const makeInitials = (name: string) =>
    name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-[#F5F4F1]">
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Page header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#F0ECFF" }}>
            <Users size={20} style={{ color: "#7C5CFC" }} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#1C1C1E]">Участники</h1>
            <p className="text-sm text-[#71717A]">
              {loading ? "Загрузка..." : `${profiles.length} велосипедистов`}
            </p>
          </div>
        </div>

        {/* Search & sort */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1A1AA]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по имени или нику..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-[#E4E4E7] text-sm text-[#1C1C1E] placeholder:text-[#A1A1AA] focus:outline-none focus:border-[#7C5CFC] transition-colors"
            />
          </div>
          <div className="relative">
            <ArrowUpDown size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1A1AA] pointer-events-none" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="appearance-none pl-9 pr-8 py-2.5 rounded-xl bg-white border border-[#E4E4E7] text-sm text-[#1C1C1E] focus:outline-none focus:border-[#7C5CFC] transition-colors cursor-pointer"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Users grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-white rounded-2xl animate-pulse border border-[#E4E4E7]" />
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filtered.map((p) => {
              const isSelf = user?.id === p.id;
              const following = isFollowing(p.id);
              const userObj = {
                id: p.id,
                name: p.name,
                initials: makeInitials(p.name),
                color: "#7C5CFC",
                avatar_url: p.avatar_url,
                km_total: p.km_total,
                routes_count: p.routes_count,
                events_count: p.events_count,
              };

              return (
                <div
                  key={p.id}
                  className="bg-white rounded-2xl p-4 border border-[#E4E4E7] hover:border-[#7C5CFC]/40 transition-colors"
                  style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}
                >
                  <div className="flex items-start gap-3">
                    <Link href={isSelf ? "/profile" : `/users/${p.id}`}>
                      <Avatar user={userObj} size="lg" className="rounded-2xl w-12 h-12 shrink-0" />
                    </Link>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <Link href={isSelf ? "/profile" : `/users/${p.id}`} className="min-w-0">
                          <h3 className="font-semibold text-sm text-[#1C1C1E] truncate hover:underline">
                            {p.name}
                          </h3>
                          {p.username && (
                            <p className="text-xs font-medium truncate" style={{ color: "#F4632A" }}>
                              @{p.username}
                            </p>
                          )}
                        </Link>
                        {!isSelf && user && followLoaded && (
                          <button
                            onClick={() => handleFollowToggle(p.id)}
                            disabled={followBusy === p.id}
                            className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60 shrink-0"
                            style={
                              following
                                ? { backgroundColor: "#F5F4F1", color: "#71717A", border: "1px solid #E4E4E7" }
                                : { backgroundColor: "#F4632A", color: "white" }
                            }
                          >
                            {following ? (
                              <><UserCheck size={12} /> <span className="hidden sm:inline">Подписан</span></>
                            ) : (
                              <><UserPlus size={12} /> <span className="hidden sm:inline">Подписаться</span></>
                            )}
                          </button>
                        )}
                      </div>
                      {p.bio && (
                        <p className="text-xs text-[#71717A] mt-1 line-clamp-2">{p.bio}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2.5">
                        <div className="flex items-center gap-1 text-xs text-[#71717A]">
                          <Bike size={12} style={{ color: "#F4632A" }} />
                          <span className="font-medium" style={{ color: "#F4632A" }}>
                            {Math.round(p.km_total).toLocaleString()}
                          </span>
                          <span>км</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-[#71717A]">
                          <Map size={12} style={{ color: "#7C5CFC" }} />
                          <span className="font-medium" style={{ color: "#7C5CFC" }}>
                            {p.routes_count}
                          </span>
                          <span>маршрутов</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16 text-[#71717A]">
            <div className="flex justify-center mb-3 opacity-20">
              <Search size={40} />
            </div>
            <div className="font-medium text-[#1C1C1E]">Никого не найдено</div>
            <div className="text-sm mt-1">Попробуйте изменить поисковый запрос</div>
          </div>
        )}
      </main>
    </div>
  );
}
