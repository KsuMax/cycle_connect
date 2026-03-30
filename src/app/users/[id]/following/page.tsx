"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Avatar } from "@/components/ui/Avatar";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/context/AuthContext";
import { useFollow } from "@/lib/context/FollowContext";
import { ChevronLeft, UserPlus, UserCheck, Users } from "lucide-react";
import type { DbProfile } from "@/lib/supabase";

interface FollowingUser extends DbProfile {}

export default function FollowingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const { isFollowing, follow, unfollow } = useFollow();

  const [profileName, setProfileName] = useState<string>("");
  const [following, setFollowing] = useState<FollowingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Load profile name
    supabase
      .from("profiles")
      .select("name")
      .eq("id", id)
      .single()
      .then(({ data }) => { if (data) setProfileName(data.name); });

    // Load following: people this user follows
    supabase
      .from("user_follows")
      .select("following:profiles!following_id(*)")
      .eq("follower_id", id)
      .then(({ data }) => {
        if (data) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setFollowing((data as any[]).map((row) => row.following).filter(Boolean) as FollowingUser[]);
        }
        setLoading(false);
      });
  }, [id]);

  const handleToggle = async (targetId: string) => {
    if (!user || busyIds.has(targetId)) return;
    setBusyIds((prev) => new Set([...prev, targetId]));
    if (isFollowing(targetId)) {
      await unfollow(targetId);
    } else {
      await follow(targetId);
    }
    setBusyIds((prev) => { const next = new Set(prev); next.delete(targetId); return next; });
  };

  const isOwnProfile = user?.id === id;

  return (
    <div className="min-h-screen bg-[#F5F4F1]">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href={`/users/${id}`}
            className="inline-flex items-center gap-1.5 text-sm text-[#71717A] hover:text-[#1C1C1E] transition-colors">
            <ChevronLeft size={16} />
            {profileName || "Профиль"}
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
          <div className="px-6 py-4 border-b border-[#F5F4F1] flex items-center gap-2">
            <Users size={16} style={{ color: "#7C5CFC" }} />
            <h1 className="font-semibold text-[#1C1C1E]">
              Подписки{profileName ? ` ${profileName}` : ""}
            </h1>
            {!loading && (
              <span className="text-xs text-[#A1A1AA] bg-[#F5F4F1] px-2 py-0.5 rounded-full font-medium">
                {following.length}
              </span>
            )}
          </div>

          {loading ? (
            <div className="divide-y divide-[#F5F4F1]">
              {[1, 2, 3].map((i) => (
                <div key={i} className="px-6 py-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#F5F4F1] animate-pulse shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-[#F5F4F1] rounded animate-pulse w-32" />
                    <div className="h-3 bg-[#F5F4F1] rounded animate-pulse w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : following.length === 0 ? (
            <div className="py-16 text-center text-[#A1A1AA]">
              <div className="flex justify-center mb-3 opacity-30"><Users size={40} /></div>
              <div className="font-medium text-[#1C1C1E]">Нет подписок</div>
              <div className="text-sm mt-1">
                {isOwnProfile ? "Ты пока ни на кого не подписан" : "Пользователь пока ни на кого не подписан"}
              </div>
            </div>
          ) : (
            <div className="divide-y divide-[#F5F4F1]">
              {following.map((f) => {
                const initials = f.name
                  ? f.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
                  : "?";
                const userObj = {
                  id: f.id,
                  name: f.name,
                  initials,
                  color: "#7C5CFC",
                  avatar_url: f.avatar_url,
                  km_total: f.km_total,
                  routes_count: f.routes_count,
                  events_count: f.events_count,
                };
                const isMe = user?.id === f.id;
                const iAmFollowing = isFollowing(f.id);
                const busy = busyIds.has(f.id);

                return (
                  <div key={f.id} className="px-6 py-4 flex items-center gap-3">
                    <Link href={`/users/${f.id}`} className="shrink-0 hover:opacity-80 transition-opacity">
                      <Avatar user={userObj} size="md" className="rounded-xl" />
                    </Link>
                    <div className="flex-1 min-w-0">
                      <Link href={`/users/${f.id}`} className="font-medium text-sm text-[#1C1C1E] hover:text-[#F4632A] transition-colors block truncate">
                        {f.name}
                      </Link>
                      {f.username && (
                        <div className="text-xs mt-0.5" style={{ color: "#F4632A" }}>@{f.username}</div>
                      )}
                      <div className="text-xs text-[#A1A1AA] mt-0.5">
                        {Math.round(f.km_total).toLocaleString()} км · {f.routes_count} маршрутов
                      </div>
                    </div>
                    {!isMe && user && (
                      <button
                        onClick={() => handleToggle(f.id)}
                        disabled={busy}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors shrink-0 disabled:opacity-60"
                        style={iAmFollowing
                          ? { backgroundColor: "#F5F4F1", color: "#71717A", border: "1px solid #E4E4E7" }
                          : { backgroundColor: "#F4632A", color: "white" }}>
                        {iAmFollowing ? <><UserCheck size={13} /> Подписан</> : <><UserPlus size={13} /> Подписаться</>}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
