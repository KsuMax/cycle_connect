"use client";

import React, { useState, useEffect, use, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { RouteCard } from "@/components/routes/RouteCard";
import { EventCard } from "@/components/events/EventCard";
import { NextRideCard } from "@/components/clubs/NextRideCard";
import { ClubChecklist } from "@/components/clubs/ClubChecklist";
import { useAuth } from "@/lib/context/AuthContext";
import { useAuthModal } from "@/components/ui/AuthModal";
import { useToast } from "@/lib/context/ToastContext";
import { supabase, proxyImageUrl } from "@/lib/supabase";
import { CLUB_LIST_SELECT, CLUB_MEMBERS_SELECT, ROUTE_LIST_SELECT, EVENT_LIST_SELECT } from "@/lib/queries";
import { dbToClub, dbToClubMember, dbToRoute, dbToEvent } from "@/lib/transforms";
import type { Club, ClubMember, Route, CycleEvent, ClubPoll, ClubPollOption } from "@/types";
import {
  ArrowLeft, Users, MapPin, Lock, Globe, UserPlus, UserMinus,
  Clock, Map, Calendar, CheckCircle, Settings, Check, X, Trophy, Pin, PinOff,
  Vote, Plus, Trash2, Archive, ChevronDown, Link2,
} from "lucide-react";

type Tab = "feed" | "routes" | "members" | "leaderboard" | "requests";

async function handleCopyInviteLink(club: Club, showToast: (message: string, type?: "success" | "error" | "info") => void) {
  const text = `Наш велоклуб «${club.name}» теперь на CycleConnect — маршруты, заезды и отчёты в одном месте. Вступай: ${window.location.origin}/clubs/${club.slug}`;
  try {
    await navigator.clipboard.writeText(text);
    showToast("Приглашение скопировано", "success");
  } catch {
    showToast("Не удалось скопировать", "error");
  }
}

export default function ClubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { user } = useAuth();
  const { requireAuth } = useAuthModal();
  const { showToast } = useToast();

  const [club, setClub] = useState<Club | null>(null);
  const [myMembership, setMyMembership] = useState<ClubMember | null>(null);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [pendingMembers, setPendingMembers] = useState<ClubMember[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [events, setEvents] = useState<CycleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("feed");
  const [joining, setJoining] = useState(false);
  const [showArchive, setShowArchive] = useState(false);

  // Poll state
  const [activePoll, setActivePoll] = useState<ClubPoll | null>(null);
  const [pollVoteCounts, setPollVoteCounts] = useState<Record<string, number>>({});
  const [myVote, setMyVote] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("За какой маршрут едем дальше?");
  const [pollOptions, setPollOptions] = useState<{ id: string; label: string; route_id: string | null }[]>([
    { id: crypto.randomUUID(), label: "", route_id: null },
    { id: crypto.randomUUID(), label: "", route_id: null },
  ]);
  const [creatingPoll, setCreatingPoll] = useState(false);

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
      setMissing(true);
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

    // Load active poll (closed_at IS NULL)
    const { data: pollData } = await supabase
      .from("club_polls")
      .select("*")
      .eq("club_id", c.id)
      .is("closed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pollData) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const poll = pollData as any;
      setActivePoll({
        id: poll.id,
        club_id: poll.club_id,
        question: poll.question,
        options: poll.options as ClubPollOption[],
        created_by: poll.created_by,
        created_at: poll.created_at,
        closed_at: poll.closed_at,
      });
      // Load vote counts
      const { data: votes } = await supabase
        .from("club_poll_votes")
        .select("option_id")
        .eq("poll_id", poll.id);
      const counts: Record<string, number> = {};
      for (const v of votes ?? []) counts[v.option_id] = (counts[v.option_id] ?? 0) + 1;
      setPollVoteCounts(counts);
      // Check if logged-in user already voted
      if (user) {
        const { data: myVoteRow } = await supabase
          .from("club_poll_votes")
          .select("option_id")
          .eq("poll_id", poll.id)
          .eq("user_id", user.id)
          .maybeSingle();
        setMyVote(myVoteRow?.option_id ?? null);
      }
    } else {
      setActivePoll(null);
      setPollVoteCounts({});
      setMyVote(null);
    }

    setLoading(false);
  }

  async function handleJoin() {
    if (!club) return;
    if (!requireAuth(club.visibility === "open" ? "вступить в клуб" : "подать заявку в клуб")) return;
    if (!user) return;
    setJoining(true);
    const status = club.visibility === "open" ? "active" : "pending";
    await supabase.from("club_members").insert({ club_id: club.id, user_id: user.id, status });
    // Если клуб с заявками — уведомляем owner/admin по email (fire-and-forget)
    if (status === "pending") {
      supabase.functions.invoke("email-notify", { body: { mode: "club_join_request", clubId: club.id } });
    }
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
    // Email одобренному (fire-and-forget)
    supabase.functions.invoke("email-notify", { body: { mode: "club_join_approved", clubId: club.id, memberId: userId } });
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
    // Email отклонённому — шлём до удаления, пока userId ещё валиден
    supabase.functions.invoke("email-notify", { body: { mode: "club_join_rejected", clubId: club.id, memberId: userId } });
    await supabase
      .from("club_members")
      .delete()
      .eq("club_id", club.id)
      .eq("user_id", userId);
    setPendingMembers((prev) => prev.filter((m) => m.user_id !== userId));
  }

  function handleNextRideParticipationChange(eventId: string, delta: number) {
    if (!user) return;
    setEvents((prev) => prev.map((e) => {
      if (e.id !== eventId) return e;
      const participants = delta > 0
        ? [...e.participants, { id: user.id, name: "Ты", initials: "Т", color: "#0BBFB5", avatar_url: null, km_total: 0, routes_count: 0, events_count: 0 }]
        : e.participants.filter((p) => p.id !== user.id);
      return { ...e, participants };
    }));
  }

  async function handleToggleFeatured(routeId: string, current: boolean) {
    // Optimistic update
    setRoutes((prev) => prev.map((r) => r.id === routeId ? { ...r, is_club_featured: !current } : r));
    const { error } = await supabase
      .from("routes")
      .update({ is_club_featured: !current })
      .eq("id", routeId);
    if (error) {
      // Rollback on failure
      setRoutes((prev) => prev.map((r) => r.id === routeId ? { ...r, is_club_featured: current } : r));
    }
  }

  const handleVote = useCallback(async (optionId: string) => {
    if (!user || !activePoll || voting) return;
    setVoting(true);
    if (myVote) {
      // Change vote: delete old, insert new
      await supabase.from("club_poll_votes").delete().eq("poll_id", activePoll.id).eq("user_id", user.id);
      setPollVoteCounts((prev) => ({ ...prev, [myVote]: Math.max(0, (prev[myVote] ?? 1) - 1) }));
    }
    await supabase.from("club_poll_votes").insert({ poll_id: activePoll.id, user_id: user.id, option_id: optionId });
    setPollVoteCounts((prev) => ({ ...prev, [optionId]: (prev[optionId] ?? 0) + 1 }));
    setMyVote(optionId);
    setVoting(false);
  }, [user, activePoll, myVote, voting]);

  const handleClosePoll = useCallback(async () => {
    if (!activePoll) return;
    await supabase.from("club_polls").update({ closed_at: new Date().toISOString() }).eq("id", activePoll.id);
    setActivePoll(null);
    setPollVoteCounts({});
    setMyVote(null);
  }, [activePoll]);

  const handleCreatePoll = useCallback(async () => {
    if (!club || !user || creatingPoll) return;
    const validOptions = pollOptions.filter((o) => o.label.trim());
    if (validOptions.length < 2) return;
    setCreatingPoll(true);
    const { data: newPoll } = await supabase
      .from("club_polls")
      .insert({
        club_id: club.id,
        question: pollQuestion.trim() || "За какой маршрут едем дальше?",
        options: validOptions.map((o) => ({ id: o.id, label: o.label.trim(), route_id: o.route_id })),
        created_by: user.id,
      })
      .select()
      .single();
    if (newPoll) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = newPoll as any;
      setActivePoll({ id: p.id, club_id: p.club_id, question: p.question, options: p.options, created_by: p.created_by, created_at: p.created_at, closed_at: null });
      setPollVoteCounts({});
      setMyVote(null);
    }
    setShowPollModal(false);
    setPollQuestion("За какой маршрут едем дальше?");
    setPollOptions([{ id: crypto.randomUUID(), label: "", route_id: null }, { id: crypto.randomUUID(), label: "", route_id: null }]);
    setCreatingPoll(false);
  }, [club, user, pollQuestion, pollOptions, creatingPoll]);

  const isAdmin = myMembership?.role === "owner" || myMembership?.role === "admin";
  const isCaptain = isAdmin || myMembership?.role === "captain";

  const upcomingEvents = events.filter((e) => new Date(e.start_date).getTime() >= Date.now());
  const pastEvents = events
    .filter((e) => new Date(e.start_date).getTime() < Date.now())
    .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());

  const nextEvent = [...upcomingEvents].sort(
    (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime(),
  )[0];

  const lastPastEventId = pastEvents[0]?.id ?? null;

  // Feed = upcoming events + routes sorted by created_at desc; past events live in the archive below
  const feedItems: ({ type: "event"; data: CycleEvent } | { type: "route"; data: Route })[] = [
    ...upcomingEvents.map((e) => ({ type: "event" as const, data: e })),
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

  if (missing || !club) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-[#F5F4F1]">
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-8 pb-24">
        <Link
          href="/clubs"
          className="inline-flex items-center gap-1.5 text-sm text-[#71717A] hover:text-[#1C1C1E] transition-colors mb-4"
        >
          <ArrowLeft size={14} />
          Клубы
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5">
          {/* Sidebar */}
          <aside className="lg:sticky lg:top-8 lg:self-start space-y-4">
            <div
              className="bg-white rounded-2xl border border-[#E4E4E7] p-5"
              style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}
            >
              <div
                className="w-14 h-14 rounded-xl overflow-hidden flex items-center justify-center text-white font-bold text-xl shrink-0 mb-3"
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

              <h1 className="text-lg font-bold text-[#1C1C1E] leading-snug">{club.name}</h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {club.city && (
                  <span className="flex items-center gap-1 text-xs text-[#71717A]">
                    <MapPin size={12} />
                    {club.city}
                  </span>
                )}
                <span className="flex items-center gap-1 text-xs text-[#71717A]">
                  {club.visibility === "open" ? <Globe size={12} /> : <Lock size={12} />}
                  {club.visibility === "open" ? "Открытый" : club.visibility === "request" ? "По заявке" : "Закрытый"}
                </span>
              </div>

              {club.description && (
                <p className="text-xs text-[#71717A] mt-3">{club.description}</p>
              )}

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-[#F0F0EE]">
                <div>
                  <div className="text-sm font-bold text-[#1C1C1E]">{club.members_count}</div>
                  <div className="text-[10px] text-[#A1A1AA]">участников</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-[#1C1C1E]">{routes.length}</div>
                  <div className="text-[10px] text-[#A1A1AA]">маршрутов</div>
                </div>
                <div>
                  <div className="text-sm font-bold text-[#1C1C1E]">{events.length}</div>
                  <div className="text-[10px] text-[#A1A1AA]">заездов</div>
                </div>
              </div>

              {/* Next event */}
              {nextEvent && (
                <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 mt-4" style={{ backgroundColor: "#E8FAF9" }}>
                  <Calendar size={13} style={{ color: "#0BBFB5" }} className="shrink-0" />
                  <span className="text-xs font-medium" style={{ color: "#085041" }}>
                    {new Date(nextEvent.start_date).toLocaleDateString("ru", { day: "numeric", month: "short" })} · {nextEvent.title}
                  </span>
                </div>
              )}

              {/* Action buttons */}
              {!user && (
                <div className="flex flex-col gap-2 mt-4">
                  <button
                    onClick={handleJoin}
                    disabled={joining}
                    className="w-full inline-flex items-center justify-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl text-white disabled:opacity-50"
                    style={{ backgroundColor: "#0BBFB5" }}
                  >
                    <UserPlus size={15} />
                    {club.visibility === "open" ? "Вступить" : "Подать заявку"}
                  </button>
                </div>
              )}
              {user && (
                <div className="flex flex-col gap-2 mt-4">
                  {!myMembership && (
                    <button
                      onClick={handleJoin}
                      disabled={joining}
                      className="w-full inline-flex items-center justify-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl text-white disabled:opacity-50"
                      style={{ backgroundColor: "#0BBFB5" }}
                    >
                      <UserPlus size={15} />
                      {club.visibility === "open" ? "Вступить" : "Подать заявку"}
                    </button>
                  )}
                  {myMembership?.status === "pending" && (
                    <>
                      <span className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl" style={{ backgroundColor: "#FFF9E6", color: "#B45309" }}>
                        <Clock size={13} />
                        Заявка на рассмотрении
                      </span>
                      <button onClick={handleLeave} disabled={joining} className="text-xs text-[#71717A] hover:text-red-500 transition-colors py-1">
                        Отменить
                      </button>
                    </>
                  )}
                  {myMembership?.status === "active" && myMembership.role === "owner" && (
                    <span className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl" style={{ backgroundColor: "#E8FAF9", color: "#0BBFB5" }}>
                      <CheckCircle size={13} />
                      Владелец
                    </span>
                  )}
                  {myMembership?.status === "active" && !["owner"].includes(myMembership.role) && (
                    <button
                      onClick={handleLeave}
                      disabled={joining}
                      className="w-full inline-flex items-center justify-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl border border-[#E4E4E7] text-[#71717A] hover:text-red-500 hover:border-red-200 transition-colors disabled:opacity-50"
                    >
                      <UserMinus size={15} />
                      Выйти
                    </button>
                  )}
                  {isAdmin && (
                    <Link
                      href={`/clubs/${club.slug}/edit`}
                      className="w-full inline-flex items-center justify-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-xl border border-[#E4E4E7] text-[#71717A] hover:text-[#1C1C1E] hover:bg-[#F5F4F1] transition-colors"
                    >
                      <Settings size={14} />
                      Изменить
                    </Link>
                  )}
                </div>
              )}

              {/* Quick actions for admins */}
              {isCaptain && (
                <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-[#F0F0EE]">
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

              {/* Invite link — any active member, incl. owner/admin */}
              {myMembership?.status === "active" && (
                <button
                  onClick={() => handleCopyInviteLink(club, showToast)}
                  className="w-full flex items-center gap-1.5 text-xs font-medium text-[#71717A] hover:text-[#0BBFB5] transition-colors mt-4 pt-4 border-t border-[#F0F0EE]"
                >
                  <Link2 size={13} />
                  Ссылка-приглашение для чата клуба
                </button>
              )}
            </div>
          </aside>

          {/* Main content */}
          <div className="min-w-0">

        {/* Pinned next ride — visible to everyone */}
        <NextRideCard
          event={nextEvent ?? null}
          isAdmin={isAdmin}
          lastPastEventId={lastPastEventId}
          clubId={club.id}
          onParticipationChange={handleNextRideParticipationChange}
        />

        {/* Organizer checklist — owner/admin only, hidden once complete */}
        {isAdmin && (
          <ClubChecklist
            clubId={club.id}
            clubName={club.name}
            clubSlug={club.slug}
            routesCount={routes.length}
            eventsCount={events.length}
            membersCount={club.members_count}
          />
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-white rounded-2xl p-1.5 border border-[#E4E4E7] mb-6 overflow-x-auto" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
          {(
            [
              { id: "feed",        label: "Лента",     icon: <Calendar size={15} />, count: feedItems.length },
              { id: "routes",      label: "Маршруты",  icon: <Map size={15} />,      count: routes.length },
              { id: "members",     label: "Участники", icon: <Users size={15} />,    count: members.length },
              { id: "leaderboard", label: "Рейтинг",   icon: <Trophy size={15} />,   count: 0 },
              ...(isAdmin && pendingMembers.length > 0
                ? [{ id: "requests" as const, label: "Заявки", icon: <Clock size={15} />, count: pendingMembers.length }]
                : []),
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              aria-label={tab.label}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-medium transition-all whitespace-nowrap shrink-0"
              style={
                activeTab === tab.id
                  ? { backgroundColor: "#1C1C1E", color: "white" }
                  : { color: "#71717A" }
              }
            >
              {tab.icon}
              <span>{tab.label}</span>
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
            {/* Active poll card */}
            {activePoll && myMembership?.status === "active" && (
              <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7] mb-4" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#E8FAF9" }}>
                      <Vote size={14} style={{ color: "#0BBFB5" }} />
                    </div>
                    <span className="text-sm font-semibold text-[#1C1C1E]">{activePoll.question}</span>
                  </div>
                  {isAdmin && (
                    <button onClick={handleClosePoll} className="text-xs text-[#A1A1AA] hover:text-[#EF4444] transition-colors" title="Завершить голосование">
                      Завершить
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {activePoll.options.map((opt) => {
                    const voteCount = pollVoteCounts[opt.id] ?? 0;
                    const totalVotes = Object.values(pollVoteCounts).reduce((s, v) => s + v, 0);
                    const pct = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
                    const isMyVote = myVote === opt.id;
                    const isLeading = totalVotes > 0 && voteCount === Math.max(...Object.values(pollVoteCounts));
                    return (
                      <button
                        key={opt.id}
                        onClick={() => handleVote(opt.id)}
                        disabled={voting}
                        className="w-full text-left rounded-xl border overflow-hidden transition-colors disabled:cursor-wait"
                        style={{ borderColor: isMyVote ? "#0BBFB5" : "#E4E4E7" }}
                      >
                        <div className="relative px-3 py-2.5">
                          {/* Progress bar */}
                          {myVote && (
                            <div className="absolute inset-0 rounded-xl transition-all" style={{ width: `${pct}%`, background: isMyVote ? "rgba(11,191,181,0.12)" : "rgba(0,0,0,0.04)" }} />
                          )}
                          <div className="relative flex items-center justify-between gap-2">
                            <span className="text-sm text-[#1C1C1E] flex items-center gap-1.5">
                              {isMyVote && <Check size={13} style={{ color: "#0BBFB5" }} />}
                              {opt.label}
                            </span>
                            <div className="flex items-center gap-2 shrink-0">
                              {myVote && (
                                <span className="text-xs font-semibold" style={{ color: isLeading ? "#0BBFB5" : "#A1A1AA" }}>{pct}%</span>
                              )}
                              <span className="text-xs text-[#A1A1AA]">{voteCount}</span>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="text-xs text-[#A1A1AA] mt-2 text-right">
                  {Object.values(pollVoteCounts).reduce((s, v) => s + v, 0)} {(() => { const n = Object.values(pollVoteCounts).reduce((s, v) => s + v, 0); return n === 1 ? "голос" : n < 5 ? "голоса" : "голосов"; })()}
                </div>
              </div>
            )}

            {/* Admin: create poll button (only when no active poll) */}
            {isAdmin && !activePoll && (
              <button
                onClick={() => setShowPollModal(true)}
                className="w-full mb-4 flex items-center justify-center gap-2 py-3 rounded-2xl border border-dashed border-[#E4E4E7] text-sm text-[#A1A1AA] hover:text-[#0BBFB5] hover:border-[#0BBFB5] transition-colors"
              >
                <Vote size={15} /> Запустить голосование за маршрут
              </button>
            )}

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

            {pastEvents.length > 0 && (
              <div className="mt-6">
                <button
                  onClick={() => setShowArchive((v) => !v)}
                  className="w-full flex items-center justify-between gap-2 py-2.5 px-1 text-sm font-medium text-[#71717A] hover:text-[#1C1C1E] transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <Archive size={14} />
                    Архив мероприятий ({pastEvents.length})
                  </span>
                  <ChevronDown
                    size={15}
                    className="transition-transform"
                    style={{ transform: showArchive ? "rotate(180deg)" : "none" }}
                  />
                </button>
                {showArchive && (
                  <div className="space-y-4 mt-3">
                    {pastEvents.map((e) => (
                      <EventCard key={`pe-${e.id}`} event={e} />
                    ))}
                  </div>
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
              <>
                {isAdmin && (
                  <p className="text-xs text-[#A1A1AA] mb-3 flex items-center gap-1">
                    <Pin size={11} /> Закрепите официальные маршруты клуба — они появятся первыми
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[...routes]
                    .sort((a, b) => (b.is_club_featured ? 1 : 0) - (a.is_club_featured ? 1 : 0))
                    .map((r) => (
                      <div key={r.id} className="relative group">
                        {r.is_club_featured && (
                          <div className="absolute top-3 left-3 z-10 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#0BBFB5", color: "white" }}>
                            <Pin size={9} /> Официальный
                          </div>
                        )}
                        <RouteCard route={r} />
                        {isAdmin && (
                          <button
                            onClick={() => handleToggleFeatured(r.id, !!r.is_club_featured)}
                            title={r.is_club_featured ? "Открепить маршрут" : "Закрепить как официальный"}
                            className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ backgroundColor: r.is_club_featured ? "#F5F4F1" : "#0BBFB5", color: r.is_club_featured ? "#71717A" : "white" }}>
                            {r.is_club_featured ? <PinOff size={12} /> : <Pin size={12} />}
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              </>
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

        {/* Leaderboard tab */}
        {activeTab === "leaderboard" && (
          <section>
            {members.filter((m) => m.profile).length === 0 ? (
              <EmptyState icon={<Trophy size={28} />} title="Нет данных" text="Участники ещё не добавили поездки" />
            ) : (
              <div className="space-y-2">
                {[...members]
                  .filter((m) => m.profile)
                  .sort((a, b) => (b.profile?.km_total ?? 0) - (a.profile?.km_total ?? 0))
                  .slice(0, 20)
                  .map((m, idx) => (
                    <LeaderboardRow key={m.user_id} member={m} rank={idx + 1} />
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
          </div>
        </div>
      </main>

      {/* Poll creation modal */}
      {showPollModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-[#1C1C1E] flex items-center gap-2">
                <Vote size={18} style={{ color: "#0BBFB5" }} /> Голосование
              </h2>
              <button onClick={() => setShowPollModal(false)} className="text-[#A1A1AA] hover:text-[#1C1C1E]">
                <X size={18} />
              </button>
            </div>

            {/* Question */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-2">Вопрос</label>
              <input
                type="text"
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                maxLength={120}
                className="w-full text-sm text-[#1C1C1E] border border-[#E4E4E7] rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#0BBFB5]/30 focus:border-[#0BBFB5] transition-all"
                placeholder="За какой маршрут едем дальше?"
              />
            </div>

            {/* Options */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-2">Варианты ответа</label>
              <div className="space-y-2">
                {pollOptions.map((opt, i) => (
                  <div key={opt.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={opt.label}
                      onChange={(e) => setPollOptions((prev) => prev.map((o) => o.id === opt.id ? { ...o, label: e.target.value } : o))}
                      maxLength={80}
                      placeholder={`Вариант ${i + 1}`}
                      className="flex-1 text-sm text-[#1C1C1E] border border-[#E4E4E7] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0BBFB5]/30 focus:border-[#0BBFB5] transition-all"
                    />
                    {pollOptions.length > 2 && (
                      <button onClick={() => setPollOptions((prev) => prev.filter((o) => o.id !== opt.id))} className="text-[#A1A1AA] hover:text-[#EF4444] transition-colors">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {pollOptions.length < 5 && (
                <button
                  onClick={() => setPollOptions((prev) => [...prev, { id: crypto.randomUUID(), label: "", route_id: null }])}
                  className="mt-2 text-xs text-[#0BBFB5] hover:underline flex items-center gap-1"
                >
                  <Plus size={12} /> Добавить вариант
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={() => setShowPollModal(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-[#71717A] border border-[#E4E4E7] hover:bg-[#F5F4F1] transition-colors">
                Отмена
              </button>
              <button
                onClick={handleCreatePoll}
                disabled={creatingPoll || pollOptions.filter((o) => o.label.trim()).length < 2}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-colors"
                style={{ backgroundColor: "#0BBFB5" }}
              >
                {creatingPoll ? "Создаём..." : "Запустить"}
              </button>
            </div>
          </div>
        </div>
      )}
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

function LeaderboardRow({ member, rank }: { member: ClubMember; rank: number }) {
  const p = member.profile;
  const name = p?.name ?? "Участник";
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;

  return (
    <Link
      href={`/users/${member.user_id}`}
      className="flex items-center gap-3 bg-white rounded-2xl p-4 border border-[#E4E4E7] hover:border-[#0BBFB5]/40 transition-colors"
      style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}
    >
      {/* Rank */}
      <div className="w-8 text-center shrink-0">
        {medal ? (
          <span className="text-xl">{medal}</span>
        ) : (
          <span className="text-sm font-bold text-[#A1A1AA]">#{rank}</span>
        )}
      </div>

      {/* Avatar */}
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

      {/* Name + stats */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-[#1C1C1E] truncate">{name}</div>
        <div className="text-xs text-[#A1A1AA] mt-0.5">
          {Math.round(p?.km_total ?? 0).toLocaleString()} км · {p?.events_count ?? 0} поездок
        </div>
      </div>

      {/* Total km badge */}
      <div className="shrink-0 text-right">
        <div className="text-sm font-bold" style={{ color: "#0BBFB5" }}>
          {Math.round(p?.km_total ?? 0).toLocaleString()} км
        </div>
        <div className="text-[10px] text-[#A1A1AA]">{p?.routes_count ?? 0} маршрутов</div>
      </div>
    </Link>
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
