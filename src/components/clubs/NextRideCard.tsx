"use client";

import { useState } from "react";
import Link from "next/link";
import { Calendar, PlusCircle, RotateCcw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/context/AuthContext";
import { useAuthModal } from "@/components/ui/AuthModal";
import { useToast } from "@/lib/context/ToastContext";
import { formatDate } from "@/lib/utils";
import type { CycleEvent } from "@/types";

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

/** Formats an ISO date ("YYYY-MM-DD...") as "5 июля" — parsed directly to avoid timezone shifts. */
function formatDayMonth(iso: string): string {
  const datePart = (iso ?? "").split("T")[0];
  const [, m, d] = datePart.split("-");
  const month = MONTHS[Number(m) - 1];
  return month ? `${Number(d)} ${month}` : formatDate(iso);
}

interface NextRideCardProps {
  event: CycleEvent | null;
  isAdmin: boolean;
  lastPastEventId?: string | null;
  clubId: string;
  onParticipationChange?: (eventId: string, delta: number) => void;
}

export function NextRideCard({ event, isAdmin, lastPastEventId, clubId, onParticipationChange }: NextRideCardProps) {
  const { user } = useAuth();
  const { requireAuth } = useAuthModal();
  const { showToast } = useToast();

  const [busy, setBusy] = useState(false);
  // Участие и счётчик выводятся из пропсов: родитель правит events через
  // onParticipationChange, локальная копия состояния не нужна.
  const going = !!(user && event?.participants.some((p) => p.id === user.id));
  const participantCount = event?.participants.length ?? 0;

  if (!event) {
    if (!isAdmin) return null;
    return (
      <div
        className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl px-4 py-3.5 mb-6"
        style={{ backgroundColor: "#E1F5EE" }}
      >
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold" style={{ color: "#04342C" }}>Заезды не запланированы</div>
          <div className="text-xs mt-0.5" style={{ color: "#0F6E56" }}>Создай первый заезд, чтобы собрать группу</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {lastPastEventId && (
            <Link
              href={`/events/new?copy=${lastPastEventId}&club=${clubId}`}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl transition-colors hover:opacity-80"
              style={{ color: "#0F6E56" }}
            >
              <RotateCcw size={13} />
              Повторить прошлый
            </Link>
          )}
          <Link
            href={`/events/new?club=${clubId}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#0F6E56" }}
          >
            <PlusCircle size={14} />
            Создать заезд
          </Link>
        </div>
      </div>
    );
  }

  const currentEvent = event;
  const distanceKm = currentEvent.days.reduce((sum, d) => sum + (d.distance_km ?? 0), 0);
  const routeTitle = currentEvent.route?.id ? currentEvent.route.title : null;
  const metaParts = [routeTitle, distanceKm > 0 ? `${distanceKm} км` : null, `${participantCount} едут`].filter(Boolean);

  async function handleGoing() {
    if (!requireAuth("записаться на заезд")) return;
    if (busy) return;
    setBusy(true);
    const wasGoing = going;
    // Оптимистично: родитель сразу обновляет events, карточка перерисуется из пропсов.
    onParticipationChange?.(currentEvent.id, wasGoing ? -1 : 1);
    const { error } = wasGoing
      ? await supabase.from("event_participants").delete().eq("event_id", currentEvent.id).eq("user_id", user!.id)
      : await supabase.from("event_participants").insert({ event_id: currentEvent.id, user_id: user!.id });
    if (error) {
      onParticipationChange?.(currentEvent.id, wasGoing ? 1 : -1);
      showToast("Не получилось — попробуй ещё раз", "error");
    } else {
      showToast(wasGoing ? "Вы отменили участие" : "Вы записались на заезд!", wasGoing ? "info" : "success");
    }
    setBusy(false);
  }

  return (
    <div className="rounded-2xl px-4 py-4 mb-6" style={{ backgroundColor: "#E1F5EE" }}>
      <div className="text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#0F6E56" }}>
        Ближайший заезд
      </div>
      <div className="flex items-center gap-1.5 text-sm font-bold mb-1" style={{ color: "#04342C" }}>
        <Calendar size={14} />
        {formatDayMonth(event.start_date)}
      </div>
      <div className="text-base font-bold mb-1.5" style={{ color: "#04342C" }}>{event.title}</div>
      {metaParts.length > 0 && (
        <div className="text-xs mb-3" style={{ color: "#0F6E56" }}>
          {metaParts.join(" · ")}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={handleGoing}
          disabled={busy}
          className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl transition-opacity disabled:opacity-60"
          style={going
            ? { backgroundColor: "white", color: "#0F6E56", border: "1px solid #0F6E56" }
            : { backgroundColor: "#0F6E56", color: "white" }
          }
        >
          {going ? "Ты едешь" : "Я еду"}
        </button>
        <Link
          href={`/events/${event.id}`}
          className="inline-flex items-center justify-center text-sm font-medium px-4 py-2 rounded-xl transition-colors hover:opacity-80"
          style={{ color: "#0F6E56" }}
        >
          Подробнее
        </Link>
      </div>
    </div>
  );
}
