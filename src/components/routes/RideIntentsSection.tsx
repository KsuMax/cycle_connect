"use client";

import { useState } from "react";
import Link from "next/link";
import { Bike, Plus, X, Calendar, Users, ChevronRight } from "lucide-react";
import { Avatar, AvatarGroup } from "@/components/ui/Avatar";
import { ContactButton } from "@/components/ui/ContactButton";
import { supabase, type DbRideIntent, type DbProfile } from "@/lib/supabase";
import { dbToUser } from "@/lib/transforms";
import { useAuth } from "@/lib/context/AuthContext";
import { useAuthModal } from "@/components/ui/AuthModal";
import { useToast } from "@/lib/context/ToastContext";
import { useIntents } from "@/lib/context/IntentsContext";
import { formatDate } from "@/lib/utils";

interface RideIntentsSectionProps {
  routeId: string;
  routeTitle: string;
  intents: DbRideIntent[];
  onIntentsChange: () => void;
}

interface MatchingEvent {
  id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  participants: { user_id: string }[];
}

type FormStep = "closed" | "form" | "event_suggestion";

export function RideIntentsSection({ routeId, routeTitle, intents, onIntentsChange }: RideIntentsSectionProps) {
  const { user } = useAuth();
  const { requireAuth } = useAuthModal();
  const { showToast } = useToast();
  const { refresh: refreshIntents } = useIntents();

  const [formStep, setFormStep] = useState<FormStep>("closed");
  const [plannedDate, setPlannedDate] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [matchingEvent, setMatchingEvent] = useState<MatchingEvent | null>(null);

  const today = new Date().toISOString().split("T")[0];

  const handleStartCreate = () => {
    if (!requireAuth("создать план поездки")) return;
    setFormStep("form");
    setPlannedDate("");
    setNote("");
    setMatchingEvent(null);
  };

  const handleSubmitDate = async () => {
    if (!plannedDate || !user) return;
    setSubmitting(true);

    // Check for matching open events on this route
    const { data: events } = await supabase
      .from("events")
      .select("id, title, start_date, end_date, participants:event_participants(user_id)")
      .eq("route_id", routeId)
      .eq("is_private", false)
      .lte("start_date", plannedDate)
      .gte("end_date", plannedDate);

    if (events && events.length > 0) {
      // Filter out events user is already participating in
      const available = events.filter(
        ev => !ev.participants.some((p: { user_id: string }) => p.user_id === user.id)
      );
      if (available.length > 0) {
        setMatchingEvent(available[0] as MatchingEvent);
        setFormStep("event_suggestion");
        setSubmitting(false);
        return;
      }
    }

    // No matching event — create intent directly
    await createIntent();
  };

  const createIntent = async () => {
    if (!user) return;
    setSubmitting(true);

    const { data: intent, error } = await supabase
      .from("ride_intents")
      .insert({ route_id: routeId, creator_id: user.id, planned_date: plannedDate, note: note || null })
      .select("id")
      .single();

    if (error || !intent) {
      showToast("Не удалось создать план", "error");
      setSubmitting(false);
      return;
    }

    // Auto-join as participant
    await supabase
      .from("ride_intent_participants")
      .insert({ intent_id: intent.id, user_id: user.id });

    showToast("План создан! Другие смогут присоединиться", "success");
    setFormStep("closed");
    setSubmitting(false);
    onIntentsChange();
    refreshIntents();
  };

  const handleJoinEvent = async () => {
    if (!user || !matchingEvent) return;
    setSubmitting(true);

    await supabase
      .from("event_participants")
      .insert({ event_id: matchingEvent.id, user_id: user.id });

    showToast("Ты вписался в мероприятие!", "success");
    setFormStep("closed");
    setSubmitting(false);
    // EventRidesContext will re-fetch on next render since it depends on user
    // Force a page-level refresh by calling onIntentsChange
    onIntentsChange();
  };

  const handleJoinIntent = async (intent: DbRideIntent) => {
    if (!requireAuth("присоединиться к поездке")) return;
    if (!user) return;

    await supabase
      .from("ride_intent_participants")
      .insert({ intent_id: intent.id, user_id: user.id });

    // Notify creator (if not self)
    if (intent.creator_id !== user.id) {
      await supabase.from("notifications").insert({
        user_id: intent.creator_id,
        type: "intent_joined",
        actor_id: user.id,
        data: {
          intent_id: intent.id,
          route_title: routeTitle,
          route_id: routeId,
          planned_date: intent.planned_date,
        },
      });
    }

    showToast("Ты присоединился к поездке!", "success");
    onIntentsChange();
    refreshIntents();
  };

  const handleLeaveIntent = async (intentId: string) => {
    if (!user) return;

    await supabase
      .from("ride_intent_participants")
      .delete()
      .eq("intent_id", intentId)
      .eq("user_id", user.id);

    showToast("Ты отменил участие", "info");
    onIntentsChange();
    refreshIntents();
  };

  const handleDeleteIntent = async (intentId: string) => {
    if (!user) return;

    await supabase
      .from("ride_intents")
      .delete()
      .eq("id", intentId);

    showToast("План отменён", "info");
    onIntentsChange();
    refreshIntents();
  };

  const futureIntents = intents.filter(i => i.planned_date >= today);

  return (
    <div className="bg-white rounded-2xl p-4 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
      {futureIntents.length > 0 ? (
        <>
          <h3 className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Bike size={12} /> Планируют поездку
          </h3>
          <div className="space-y-2 mb-3">
            {futureIntents.map(intent => (
              <IntentCard
                key={intent.id}
                intent={intent}
                currentUserId={user?.id}
                onJoin={() => handleJoinIntent(intent)}
                onLeave={() => handleLeaveIntent(intent.id)}
                onDelete={() => handleDeleteIntent(intent.id)}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="text-center mb-3">
          <div className="text-sm font-semibold text-[#1C1C1E] mb-0.5">Хочешь проехать этот маршрут?</div>
          <div className="text-xs text-[#A1A1AA]">Нажми кнопку — другие увидят и смогут присоединиться</div>
        </div>
      )}

      {/* Create form */}
      {formStep === "closed" && (
        <button
          onClick={handleStartCreate}
          className="w-full py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 border border-dashed border-[#D1D1D6] text-[#71717A] hover:border-[#F4632A] hover:text-[#F4632A] hover:bg-[#FFF8F5]"
        >
          <Plus size={14} /> Хочу катнуть
        </button>
      )}

      {formStep === "form" && (
        <div className="rounded-xl border border-[#E4E4E7] p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#1C1C1E]">Когда планируешь?</span>
            <button onClick={() => setFormStep("closed")} className="text-[#A1A1AA] hover:text-[#1C1C1E]">
              <X size={14} />
            </button>
          </div>
          <input
            type="date"
            min={today}
            value={plannedDate}
            onChange={e => setPlannedDate(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] text-sm focus:outline-none focus:border-[#F4632A] transition-colors"
          />
          <textarea
            placeholder="Во сколько, откуда старт... (необязательно)"
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] text-sm resize-none focus:outline-none focus:border-[#F4632A] transition-colors"
          />
          <button
            onClick={handleSubmitDate}
            disabled={!plannedDate || submitting}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50"
            style={{ backgroundColor: "#F4632A" }}
          >
            {submitting ? "..." : "Готово"}
          </button>
        </div>
      )}

      {formStep === "event_suggestion" && matchingEvent && (
        <div className="rounded-xl border border-[#E4E4E7] p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#1C1C1E]">На эту дату уже есть мероприятие!</span>
            <button onClick={() => setFormStep("closed")} className="text-[#A1A1AA] hover:text-[#1C1C1E]">
              <X size={14} />
            </button>
          </div>

          <Link href={`/events/${matchingEvent.id}`}
            className="flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-[#F5F4F1] transition-colors">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, #0BBFB5 0%, #7C5CFC 100%)" }}>
              <Calendar size={12} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[#1C1C1E] truncate">{matchingEvent.title}</div>
              <div className="flex items-center gap-2 text-xs text-[#A1A1AA]">
                {matchingEvent.start_date && <span>{formatDate(matchingEvent.start_date)}</span>}
                {matchingEvent.end_date && matchingEvent.end_date !== matchingEvent.start_date && (
                  <span>– {formatDate(matchingEvent.end_date)}</span>
                )}
                <span className="flex items-center gap-0.5">
                  <Users size={10} /> {matchingEvent.participants.length}
                </span>
              </div>
            </div>
            <ChevronRight size={14} className="text-[#A1A1AA]" />
          </Link>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleJoinEvent}
              disabled={submitting}
              className="py-2.5 rounded-xl text-xs font-semibold text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: "#7C5CFC" }}
            >
              {submitting ? "..." : "Вписаться"}
            </button>
            <button
              onClick={createIntent}
              disabled={submitting}
              className="py-2.5 rounded-xl text-xs font-semibold border border-[#E4E4E7] text-[#71717A] hover:bg-[#F5F4F1] transition-colors disabled:opacity-50"
            >
              {submitting ? "..." : "Свой план"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Individual intent card ───────────────────────────────── */

function IntentCard({
  intent,
  currentUserId,
  onJoin,
  onLeave,
  onDelete,
}: {
  intent: DbRideIntent;
  currentUserId: string | undefined;
  onJoin: () => void;
  onLeave: () => void;
  onDelete: () => void;
}) {
  const creator = intent.creator as DbProfile | undefined;
  const participants = intent.participants ?? [];
  const isCreator = currentUserId === intent.creator_id;
  const isParticipant = participants.some(p => p.user_id === currentUserId);

  const participantUsers = participants.map(p => {
    const profile = p.profile as DbProfile | undefined;
    const name = profile?.name ?? "Участник";
    return {
      id: p.user_id,
      name,
      initials: name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(),
      color: "#0BBFB5",
      avatar_url: profile?.avatar_url ?? null,
      km_total: 0,
      routes_count: 0,
      events_count: 0,
    };
  });

  return (
    <div className="rounded-xl border border-[#E4E4E7] p-3">
      <div className="flex items-center gap-2.5 mb-1.5">
        <Avatar user={{
          id: intent.creator_id,
          name: creator?.name ?? "Участник",
          initials: (creator?.name ?? "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(),
          color: "#0BBFB5",
          avatar_url: creator?.avatar_url ?? null,
          km_total: 0,
          routes_count: 0,
          events_count: 0,
        }} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-[#1C1C1E] truncate">
            {creator?.name ?? "Участник"}
          </div>
          <div className="text-xs text-[#A1A1AA]">{formatDate(intent.planned_date)}</div>
        </div>
        {creator && !isCreator && (
          <ContactButton user={dbToUser(creator)} />
        )}
      </div>

      {intent.note && (
        <div className="text-xs text-[#71717A] mb-2 pl-10 italic">
          {intent.note}
        </div>
      )}

      <div className="flex items-center justify-between pl-10">
        {participants.length > 1 ? (
          <AvatarGroup users={participantUsers} max={4} />
        ) : (
          <span className="text-xs text-[#A1A1AA]">Пока один</span>
        )}

        {isCreator ? (
          <button
            onClick={onDelete}
            className="text-xs font-medium text-red-400 hover:text-red-500 transition-colors px-2 py-1"
          >
            Отменить
          </button>
        ) : isParticipant ? (
          <button
            onClick={onLeave}
            className="text-xs font-medium text-[#A1A1AA] hover:text-[#1C1C1E] transition-colors px-2 py-1"
          >
            Не поеду
          </button>
        ) : (
          <button
            onClick={onJoin}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            style={{ backgroundColor: "#F0FDF4", color: "#16A34A" }}
          >
            Присоединиться
          </button>
        )}
      </div>

      {/* Expanded participant roster with contact buttons — only when the
          viewer is part of this intent (creator or joined). Avoids leaking
          "who's planning" to randoms and keeps the card compact otherwise. */}
      {(isCreator || isParticipant) && participants.length > 0 && (
        <div className="mt-2 pl-10 space-y-1">
          {participants
            .filter((p) => p.user_id !== currentUserId)
            .map((p) => {
              const profile = p.profile as DbProfile | undefined;
              if (!profile) return null;
              const u = dbToUser(profile);
              return (
                <div key={p.user_id} className="flex items-center justify-between text-xs text-[#71717A]">
                  <span className="truncate">{u.name}</span>
                  <ContactButton user={u} />
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
