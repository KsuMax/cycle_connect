"use client";

import { useState, useEffect, use } from "react";
import Image from "next/image";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { RouteCard } from "@/components/routes/RouteCard";
import { EventCard } from "@/components/events/EventCard";
import { useAuth } from "@/lib/context/AuthContext";
import { supabase, proxyImageUrl } from "@/lib/supabase";
import { CLUB_LIST_SELECT, CLUB_MEMBERS_SELECT, ROUTE_LIST_SELECT, EVENT_LIST_SELECT } from "@/lib/queries";
import { dbToClub, dbToClubMember, dbToRoute, dbToEvent } from "@/lib/transforms";
import type { Club, ClubMember, Route, CycleEvent } from "@/types";
import {
  ArrowLeft, Users, MapPin, Lock, Globe, UserPlus, UserMinus,
  Clock, Map, Calendar, CheckCircle, Shield, Settings, Check, X,
} from "lucide-react";

type Tab = "feed" | "routes" | "members" | "requests";

export default function ClubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { user } = useAuth();

  const [club, setClub] = useState<Club | null>(null);
  const [myMembership, setMyMembership] = useState<ClubMember | null>(null);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [pendingMembers, setPendingMembers] = useState<ClubMember[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [events, setEvents] = useState<CycleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("feed");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    loadClub();
  }, [slug, user]);

  async function loadClub() {
    setLoading(true);

    const { data: clubData } = await supabase
      .from("clubs")
      .select(CLUB_LIST_SELECT)
      .eq("slug", slug)
      .single();

    if (!clubData) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const c = dbToClub(clubData);
    setClub(c);

    const [membersRes, routesRes, eventsRes] = await Promise.all([
      supabase.from("club_members").select(CLUB_MEMBERS_SELECT).eq("club_id", c.id).eq("status", "active").order("joined_at", { ascending: true }),
      supabase.from("routes").select(ROUTE_LIST_SELECT).eq("club_id", c.id).order("created_at", { ascending: false }),
      supabase.from("events").select(EVENT_LIST_SELECT).eq("club_id", c.id).order("created_at", { ascending: false }),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const membersRaw = (membersRes.data ?? []) as any[];
    setMembers(membersRaw.map(dbToClubMember));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setRoutes(((routesRes.data ?? []) as any[]).map(dbToRoute));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setEvents(((eventsRes.data ?? []) as any[]).map(dbToEvent));

    let resolvedMembership: ClubMember | null = null;

    if (user) {
      // Try to find current user in the already-fetched members list (active only).
      const mine = membersRaw.find(
        (m: { user_id: string }) => m.user_id === user.id,
      );
      if (mine) {
        resolvedMembership = dbToClubMember(mine);
      } else {
        // Fallback: direct query without the complex profile join.
        const { data: myRow } = await supabase
          .from("club_members")
          .select("club_id, user_id, role, status, joined_at")
          .eq("club_id", c.id)
          .eq("user_id", user.id)
          .maybeSingle();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolvedMembership = myRow ? dbToClubMember({ ...(myRow as any), profile: null }) : null;
      }
      setMyMembership(resolvedMembership);

      // Load pending requests — only for admins
      const isAdminResolved =
        resolvedMembership?.role === "owner" || resolvedMembership?.role === "admin";
      if (isAdminResolved) {
        const { data: pendingRaw } = await supabase
          .from("club_members")
          .select(CLUB_MEMBERS_SELECT)
          .eq("club_id", c.id)
          .eq("status", "pending")
          .order("joined_at", { ascending: true });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setPendingMembers(((pendingRaw ?? []) as any[]).map(dbToClubMember));
      } else {
        setPendingMembers([]);
      }
    }

    setLoading(false);
  }

  async function handleJoin() {
    if (!user || !club) return;
    setJoining(true);
    const status = club.visibility === "open" ? "active" : "pending";
    await supabase.from("club_members").insert({ club_id: club.id, user_id: user.id, status });
    await loadClub();
    setJoining(false);
  }

  async function handleLeave() {
    if (!user || !club) return;
    setJoining(true);
    await supabase.from("club_members").delete().eq("club_id", club.id).eq("user_id", user.id);
    setMyMembership(null);
    setClub((prev) => prev ? { ...prev, members_count: Math.max(0, prev.members_count - 1) } : prev);
    setMembers((prev) => prev.filter((m) => m.user_id !== user.id));
    setJoining(false);
  }

  async function handleApprove(userId: string) {
    if (!club) return;
    await supabase
      .from("club_members")
      .update({ status: "active" })
      .eq("club_id", club.id)
      .eq("user_id", userId);
    setPendingMembers((prev) => prev.filter((m) => m.user_id !== userId));
    setClub((prev) => prev ? { ...prev, members_count: prev.members_count + 1 } : prev);
    // Refresh members list to show the newly approved member
    const { data } = await supabase
      .from("club_members")
      .select(CLUB_MEMBERS_SELECT)
      .eq("club_id", club.id)
      .eq("status", "active")
      .order("joined_at", { ascending: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (data) setMembers(((data) as any[]).map(dbToClubMember));
  }

  async function handleReject(userId: string) {
    if (!club) return;
    await supabase
      .from("club_members")
      .delete()
      .eq("club_id", club.id)
      .eq("user_id", userId);
    setPendingMembers((prev) => prev.filter((m) => m.user_id !== userId));
  }

  const isAdmin = myMembership?.role === "owner" || myMembership?.role === "admin";
  const isCaptain = isAdmin || myMembership?.role === "captain";

  // Feed = merged events + routes sorted by created_at desc
  const feedItems: ({ type: "event"; data: CycleEvent } | { type: "route"; data: Route })[] = [
    ...events.map((e) => ({ type: "event" as const, data: e })),
    ...routes.map((r) => ({ type: "route" as const, data: r })),
  ].sort((a, b) => new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime());

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F4F1]">
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-8">
          <div className="h-48 bg-white rounded-2xl animate-pulse border border-[#E4E4E7] mb-4" />
          <div className="h-10 bg-white rounded-2xl animate-pulse border border-[#E4E4E7]" />
        </main>
      </div>
    );
  }

  if (notFound || !club) {
    return (
      <div className="min-h-screen bg-[#F5F4F1]">
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-16 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: "#E8FAF9" }}>
            <Shield size={28} style={{ color: "#0BBFB5" }} />
          </div>
          <div className="font-semibold text-[#1C1C1E] mb-1">Клуб не найден</div>
          <div className="text-sm text-[#71717A] mb-4">Возможно, ссылка устарела или клуб был удалён</div>
          <Link href="/clubs" className="text-sm text-[#0BBFB5] hover:underline">← Все клубы</Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F4F1]">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-8 pb-24">
        <Link
          href="/clubs"
          className="inline-flex items-center gap-1.5 text-sm text-[#71717A] hover:text-[#1C1C1E] transition-colors mb-4"
        >
          <ArrowLeft size={14} />
          Клубы
        </Link>

        {/* Club header card */}
        <div
          className="bg-white rounded-2xl border border-[#E4E4E7] overflow-hidden mb-4"
          style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}
        >
          {/* Cover */}
          {club.cover_url ? (
            <div className="h-28 overflow-hidden">
              <Image
                src={proxyImageUrl(club.cover_url) ?? club.cover_url}
                alt="Обложка клуба"
                width={640}
                height={112}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="h-28" style={{ background: "linear-gradient(135deg, #E8FAF9 0%, #F0ECFF 100%)" }} />
          )}

          <div className="px-5 pb-5">
            {/* Avatar */}
            <div className="flex items-end justify-between -mt-7 mb-3">
              <div
                className="w-14 h-14 rounded-xl overflow-hidden border-2 border-white flex items-center justify-center text-white font-bold text-xl shrink-0"
                style={{ backgroundColor: "#0BBFB5" }}
              >
                {club.avatar_url ? (
                  <Image
                    src={proxyImageUrl(club.avatar_url) ?? club.avatar_url}
                    alt={club.name}
                    width={56}
                    height={56}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  club.name[0].toUpperCase()
                )}
              </div>

              {/* Action buttons */}
              {user && (
                <div className="flex items-center gap-2 flex-wrap">
                  {!myMembership && (
                    <button
                      onClick={handleJoin}
                      disabled={joining}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl text-white disabled:opacity-50"
                      style={{ backgroundColor: "#0BBFB5" }}
                    >
                      <UserPlus size={15} />
                      {club.visibility === "open" ? "Вступить" : "Подать заявку"}
                    </button>
                  )}
                  {myMembership?.status === "pending" && (
                    <>
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl" style={{ backgroundColor: "#FFF9E6", color: "#B45309" }}>
                        <Clock size={13} />
                        Заявка на рассмотрении
                      </span>
                      <button onClick={handleLeave} disabled={joining} className="text-xs text-[#71717A] hover:text-red-500 transition-colors px-2 py-1.5">
                        Отменить
                      </button>
                    </>
                  )}
                  {myMembership?.status === "active" && myMembership.role === "owner" && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl" style={{ backgroundColor: "#E8FAF9", color: "#0BBFB5" }}>
                      <CheckCircle size={13} />
                      Владелец
                    </span>
                  )}
                  {myMembership?.status === "active" && !["owner"].includes(myMembership.role) && (
                    <button
                      onClick={handleLeave}
                      disabled={joining}
                      className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl border border-[#E4E4E7] text-[#71717A] hover:text-red-500 hover:border-red-200 transition-colors disabled:opacity-50"
                    >
                      <UserMinus size={15} />
                      Выйти
                    </button>
                  )}
                  {isAdmin && (
                    <Link
                      href={`/clubs/${club.slug}/edit`}
                      className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-xl border border-[#E4E4E7] text-[#71717A] hover:text-[#1C1C1E] hover:bg-[#F5F4F1] transition-colors"
                    >
                      <Settings size={14} />
                      Изменить
                    </Link>
                  )}
                </div>
              )}
            </div>

            {/* Name & meta */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <h1 className="text-xl font-bold text-[#1C1C1E]">{club.name}</h1>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="flex items-center gap-1 text-sm text-[#71717A]">
                    <Users size={14} />
                    {club.members_count} участников
                  </span>
                  {club.city && (
                    <span className="flex items-center gap-1 text-sm text-[#71717A]">
                      <MapPin size={14} />
                      {club.city}
                    </span>
                  )}
                  {club.visibility !== "open" && (
                    <span className="flex items-center gap-1 text-sm text-[#71717A]">
                      <Lock size={14} />
                      {club.visibility === "request" ? "По заявке" : "Закрытый"}
                    </span>
                  )}
                  {club.visibility === "open" && (
                    <span className="flex items-center gap-1 text-sm text-[#71717A]">
                      <Globe size={14} />
                      Открытый
                    </span>
                  )}
                </div>
              </div>
            </div>

            {club.description && (
              <p className="text-sm text-[#71717A] mt-2">{club.description}</p>
            )}

            {/* Quick actions for admins */}
            {isCaptain && (
              <div className="flex gap-2 mt-4 flex-wrap">
                <Link
                  href={`/events/new?club=${club.id}`}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#E4E4E7] text-[#1C1C1E] hover:bg-[#F5F4F1] transition-colors"
                >
                  <Calendar size={13} />
                  Создать событие
                </Link>
                <Link
                  href={`/routes/new?club=${club.id}`}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#E4E4E7] text-[#1C1C1E] hover:bg-[#F5F4F1] transition-colors"
                >
                  <Map size={13} />
                  Добавить маршрут
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white rounded-2xl p-1.5 border border-[#E4E4E7] mb-6" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
          {(
            [
              { id: "feed",     label: "Лента",     icon: <Calendar size={15} />, count: feedItems.length },
              { id: "routes",   label: "Маршруты",  icon: <Map size={15} />,      count: routes.length },
              { id: "members",  label: "Участники", icon: <Users size={15} />,    count: members.length },
              ...(isAdmin && pendingMembers.length > 0
                ? [{ id: "requests" as const, label: "Заявки", icon: <Clock size={15} />, count: pendingMembers.length }]
                : []),
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-medium transition-all"
              style={
                activeTab === tab.id
                  ? { backgroundColor: "#1C1C1E", color: "white" }
                  : { color: "#71717A" }
              }
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
              {tab.count > 0 && (
                <span
                  className="text-[11px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center"
                  style={
                    activeTab === tab.id
                      ? { backgroundColor: "rgba(255,255,255,0.2)", color: "white" }
                      : tab.id === "requests"
                      ? { backgroundColor: "#FFF0EB", color: "#F4632A" }
                      : { backgroundColor: "#F5F4F1", color: "#71717A" }
                  }
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Feed tab */}
        {activeTab === "feed" && (
          <section>
            {feedItems.length === 0 ? (
              <EmptyState
                icon={<Calendar size={28} />}
                title="Лента пуста"
                text="Здесь будут появляться события и маршруты клуба"
              />
            ) : (
              <div className="space-y-4">
                {feedItems.map((item) =>
                  item.type === "event" ? (
                    <EventCard key={`e-${item.data.id}`} event={item.data} />
                  ) : (
                    <RouteCard key={`r-${item.data.id}`} route={item.data} />
                  ),
                )}
              </div>
            )}
          </section>
        )}

        {/* Routes tab */}
        {activeTab === "routes" && (
          <section>
            {routes.length === 0 ? (
              <EmptyState
                icon={<Map size={28} />}
                title="Маршрутов пока нет"
                text="Капитаны клуба добавят маршруты, которые вы проверили вместе"
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {routes.map((r) => (
                  <RouteCard key={r.id} route={r} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Members tab */}
        {activeTab === "members" && (
          <section>
            {members.length === 0 ? (
              <EmptyState icon={<Users size={28} />} title="Нет участников" text="" />
            ) : (
              <div className="space-y-2">
                {members.map((m) => (
                  <MemberRow key={m.user_id} member={m} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Requests tab — admin only */}
        {activeTab === "requests" && isAdmin && (
          <section>
            {pendingMembers.length === 0 ? (
              <EmptyState icon={<CheckCircle size={28} />} title="Новых заявок нет" text="" />
            ) : (
              <div className="space-y-2">
                {pendingMembers.map((m) => (
                  <PendingMemberRow
                    key={m.user_id}
                    member={m}
                    onApprove={() => handleApprove(m.user_id)}
                    onReject={() => handleReject(m.user_id)}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function MemberRow({ member }: { member: ClubMember }) {
  const p = member.profile;
  const name = p?.name ?? "Участник";
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const roleLabel: Record<ClubMember["role"], string | null> = {
    owner:   "Владелец",
    admin:   "Админ",
    captain: "Капитан",
    member:  null,
  };

  return (
    <Link
      href={`/users/${member.user_id}`}
      className="flex items-center gap-3 bg-white rounded-2xl p-4 border border-[#E4E4E7] hover:border-[#0BBFB5]/40 transition-colors"
      style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}
    >
      <div
        className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center text-sm font-bold text-white shrink-0"
        style={{ backgroundColor: "#7C5CFC" }}
      >
        {p?.avatar_url ? (
          <Image
            src={proxyImageUrl(p.avatar_url) ?? p.avatar_url}
            alt={name}
            width={40}
            height={40}
            className="w-full h-full object-cover"
          />
        ) : (
          initials
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[#1C1C1E] truncate">{name}</span>
          {roleLabel[member.role] && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0"
              style={{ backgroundColor: "#E8FAF9", color: "#0BBFB5" }}
            >
              {roleLabel[member.role]}
            </span>
          )}
        </div>
        {p && (
          <div className="text-xs text-[#A1A1AA] mt-0.5">
            {Math.round(p.km_total).toLocaleString()} км · {p.routes_count} маршрутов
          </div>
        )}
      </div>
    </Link>
  );
}

function PendingMemberRow({
  member,
  onApprove,
  onReject,
}: {
  member: ClubMember;
  onApprove: () => void;
  onReject: () => void;
}) {
  const p = member.profile;
  const name = p?.name ?? "Участник";
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div
      className="flex items-center gap-3 bg-white rounded-2xl p-4 border border-[#E4E4E7]"
      style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}
    >
      <div
        className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center text-sm font-bold text-white shrink-0"
        style={{ backgroundColor: "#7C5CFC" }}
      >
        {p?.avatar_url ? (
          <Image
            src={proxyImageUrl(p.avatar_url) ?? p.avatar_url}
            alt={name}
            width={40}
            height={40}
            className="w-full h-full object-cover"
          />
        ) : (
          initials
        )}
      </div>

      <div className="flex-1 min-w-0">
        <Link href={`/users/${member.user_id}`} className="text-sm font-medium text-[#1C1C1E] hover:underline truncate block">
          {name}
        </Link>
        {p && (
          <div className="text-xs text-[#A1A1AA] mt-0.5">
            {Math.round(p.km_total).toLocaleString()} км · {p.routes_count} маршрутов
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onReject}
          className="w-9 h-9 flex items-center justify-center rounded-xl border border-[#E4E4E7] text-[#71717A] hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors"
          title="Отклонить"
        >
          <X size={16} />
        </button>
        <button
          onClick={onApprove}
          className="w-9 h-9 flex items-center justify-center rounded-xl text-white transition-colors"
          style={{ backgroundColor: "#0BBFB5" }}
          title="Принять"
        >
          <Check size={16} />
        </button>
      </div>
    </div>
  );
}

function EmptyState({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="text-center py-12 px-4">
      <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: "#E8FAF9" }}>
        <div style={{ color: "#0BBFB5" }}>{icon}</div>
      </div>
      <div className="font-semibold text-[#1C1C1E] mb-1">{title}</div>
      {text && <div className="text-sm text-[#71717A] max-w-xs mx-auto">{text}</div>}
    </div>
  );
}
