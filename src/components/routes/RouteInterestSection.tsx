"use client";

import { useState } from "react";
import Link from "next/link";
import { Send, Pencil, X, Check } from "lucide-react";
import { Avatar, AvatarGroup } from "@/components/ui/Avatar";
import { supabase, type DbRouteInterest, type DbProfile, type RoughWhen } from "@/lib/supabase";
import { useAuth } from "@/lib/context/AuthContext";
import { useAuthModal } from "@/components/ui/AuthModal";
import { useToast } from "@/lib/context/ToastContext";
import { useInterests } from "@/lib/context/InterestsContext";
import { formatDate } from "@/lib/utils";

interface RouteInterestSectionProps {
  routeId: string;
  interests: DbRouteInterest[];
  onChange: () => void;
}

const ROUGH_LABELS: Record<RoughWhen, string> = {
  anytime: "когда угодно",
  weekend: "на выходных",
  this_month: "в этом месяце",
  specific: "конкретная дата",
};

type WhenChoice = RoughWhen | null;

function profileToUser(p: DbProfile) {
  const name = p.name ?? "Катальщик";
  return {
    id: p.id,
    name,
    initials: name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(),
    color: "#0BBFB5",
    avatar_url: p.avatar_url ?? null,
    km_total: 0,
    routes_count: 0,
    events_count: 0,
  };
}

function describeWhen(planned: string | null, rough: RoughWhen | null): string {
  if (rough === "specific" && planned) return formatDate(planned);
  if (rough && rough !== "specific") return ROUGH_LABELS[rough];
  if (planned) return formatDate(planned);
  return "когда получится";
}

export function RouteInterestSection({ routeId, interests, onChange }: RouteInterestSectionProps) {
  const { user } = useAuth();
  const { requireAuth } = useAuthModal();
  const { showToast } = useToast();
  const { refresh: refreshInterests } = useInterests();

  const myInterest = user ? interests.find(i => i.user_id === user.id) ?? null : null;
  const others = interests.filter(i => i.user_id !== user?.id);
  const today = new Date().toISOString().split("T")[0];

  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [whenChoice, setWhenChoice] = useState<WhenChoice>(null);
  const [specificDate, setSpecificDate] = useState("");
  const [note, setNote] = useState("");

  const openEditor = (existing: DbRouteInterest | null) => {
    setWhenChoice(existing?.rough_when ?? null);
    setSpecificDate(existing?.planned_date ?? "");
    setNote(existing?.note ?? "");
    setEditing(true);
  };

  const handleJoin = async () => {
    if (!requireAuth("отметиться на маршрут")) return;
    if (!user) return;
    setSubmitting(true);
    const { error } = await supabase
      .from("route_interests")
      .insert({ route_id: routeId, user_id: user.id });
    setSubmitting(false);
    if (error) {
      showToast("Не удалось отметиться", "error");
      return;
    }
    showToast("Отмечено! Другие катальщики увидят", "success");
    onChange();
    refreshInterests();

    // Fire-and-forget TG push to the rest of the pool. The DB trigger
    // already wrote in-app notifications; this just adds the TG channel.
    supabase.functions
      .invoke("tg-notify", { body: { mode: "route_interest_new", routeId } })
      .catch(() => { /* silent — non-critical */ });
  };

  const handleSave = async () => {
    if (!user) return;
    const planned = whenChoice === "specific" ? specificDate || null : null;
    const rough = whenChoice;
    setSubmitting(true);
    const { error } = await supabase
      .from("route_interests")
      .update({ planned_date: planned, rough_when: rough, note: note || null })
      .eq("route_id", routeId)
      .eq("user_id", user.id);
    setSubmitting(false);
    if (error) {
      showToast("Не удалось сохранить", "error");
      return;
    }
    setEditing(false);
    onChange();
    refreshInterests();
  };

  const handleRemove = async () => {
    if (!user) return;
    setSubmitting(true);
    await supabase
      .from("route_interests")
      .delete()
      .eq("route_id", routeId)
      .eq("user_id", user.id);
    setSubmitting(false);
    setEditing(false);
    showToast("Отметка убрана", "info");
    onChange();
    refreshInterests();
  };

  const poolUsers = interests
    .map(i => i.profile)
    .filter((p): p is DbProfile => !!p)
    .map(profileToUser);

  const total = interests.length;

  return (
    <div className="bg-white rounded-2xl p-4 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-[#1C1C1E]">Хочу проехать</h3>
        <p className="text-xs text-[#A1A1AA] mt-0.5">
          Отметься — найдёшь компанию. Без обязательств, дата необязательна.
        </p>
      </div>

      {/* Pool */}
      {total > 0 && (
        <div className="flex items-center justify-between mb-3 p-2.5 rounded-xl bg-[#F8F8F6]">
          <AvatarGroup users={poolUsers} max={6} getHref={(u) => `/users/${u.id}`} />
          <span className="text-xs text-[#71717A] font-medium">
            {total === 1
              ? "1 человек"
              : total < 5
              ? `${total} человека`
              : `${total} человек`}
          </span>
        </div>
      )}

      {/* Others' details (only when there are concrete dates / notes) */}
      {others.some(i => i.planned_date || i.rough_when || i.note) && (
        <div className="space-y-1.5 mb-3">
          {others
            .filter(i => i.planned_date || i.rough_when || i.note)
            .slice(0, 4)
            .map(i => (
              <OtherInterestRow key={i.user_id} interest={i} today={today} />
            ))}
        </div>
      )}

      {/* My state */}
      {!myInterest && !editing && (
        <button
          onClick={handleJoin}
          disabled={submitting}
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50"
          style={{ backgroundColor: "#F4632A" }}
        >
          {submitting ? "..." : total > 0 ? "Я тоже хочу" : "Хочу проехать"}
        </button>
      )}

      {myInterest && !editing && (
        <div className="rounded-xl border border-[#E4E4E7] p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs text-[#A1A1AA] mb-0.5">Ты отметился</div>
              <div className="text-sm font-medium text-[#1C1C1E]">
                {describeWhen(myInterest.planned_date, myInterest.rough_when)}
              </div>
              {myInterest.note && (
                <div className="text-xs text-[#71717A] mt-1 italic">{myInterest.note}</div>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => openEditor(myInterest)}
                title="Изменить"
                className="p-1.5 rounded-lg text-[#71717A] hover:text-[#1C1C1E] hover:bg-[#F5F4F1] transition-colors"
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={handleRemove}
                disabled={submitting}
                title="Убрать отметку"
                className="p-1.5 rounded-lg text-[#A1A1AA] hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="rounded-xl border border-[#E4E4E7] p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#1C1C1E]">Когда планируешь?</span>
            <button onClick={() => setEditing(false)} className="text-[#A1A1AA] hover:text-[#1C1C1E]">
              <X size={14} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(ROUGH_LABELS) as RoughWhen[]).map(key => (
              <button
                key={key}
                onClick={() => setWhenChoice(whenChoice === key ? null : key)}
                className={`px-2.5 py-2 rounded-lg text-xs font-medium border transition-colors ${
                  whenChoice === key
                    ? "border-[#F4632A] bg-[#FFF8F5] text-[#F4632A]"
                    : "border-[#E4E4E7] text-[#71717A] hover:border-[#A1A1AA]"
                }`}
              >
                {ROUGH_LABELS[key]}
              </button>
            ))}
          </div>

          {whenChoice === "specific" && (
            <input
              type="date"
              min={today}
              value={specificDate}
              onChange={e => setSpecificDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] text-sm focus:outline-none focus:border-[#F4632A] transition-colors"
            />
          )}

          <textarea
            placeholder="Заметка (необязательно)"
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] text-sm resize-none focus:outline-none focus:border-[#F4632A] transition-colors"
          />

          <button
            onClick={handleSave}
            disabled={submitting || (whenChoice === "specific" && !specificDate)}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
            style={{ backgroundColor: "#F4632A" }}
          >
            <Check size={14} /> {submitting ? "..." : "Сохранить"}
          </button>
        </div>
      )}
    </div>
  );
}

function OtherInterestRow({ interest, today }: { interest: DbRouteInterest; today: string }) {
  const profile = interest.profile;
  if (!profile) return null;
  const name = profile.name ?? "Катальщик";
  const tg = profile.telegram_username;
  const when = describeWhen(interest.planned_date, interest.rough_when);
  const isPast = interest.planned_date && interest.planned_date < today;

  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <Link href={`/users/${profile.id}`}>
        <Avatar user={profileToUser(profile)} size="sm" />
      </Link>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Link href={`/users/${profile.id}`} className="text-sm font-medium text-[#1C1C1E] hover:text-[#F4632A] transition-colors truncate">
            {name}
          </Link>
          <span className={`text-xs ${isPast ? "text-[#A1A1AA] line-through" : "text-[#71717A]"}`}>
            {when}
          </span>
        </div>
        {interest.note && (
          <div className="text-xs text-[#A1A1AA] truncate">{interest.note}</div>
        )}
      </div>
      {tg && (
        <a
          href={`https://t.me/${tg}`}
          target="_blank"
          rel="noopener noreferrer"
          title={`Написать @${tg} в Telegram`}
          className="flex items-center gap-1 text-xs font-medium text-[#0088CC] hover:text-[#006DAF] transition-colors px-2 py-1 rounded-lg hover:bg-[#E8F5FB]"
        >
          <Send size={11} />
        </a>
      )}
    </div>
  );
}
