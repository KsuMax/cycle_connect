"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Bike, Heart, MapPin, Shield } from "lucide-react";
import { AvatarGroup } from "@/components/ui/Avatar";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/context/AuthContext";
import { useEventLikes } from "@/lib/context/EventLikesContext";
import { useAuthModal } from "@/components/ui/AuthModal";
import { useToast } from "@/lib/context/ToastContext";
import { proxyImageUrl } from "@/lib/supabase";
import type { CycleEvent } from "@/types";

// Deterministic gradient palette — pick by hashing event id
const GRADIENTS = [
  "linear-gradient(135deg, #0BBFB5 0%, #7C5CFC 100%)",
  "linear-gradient(135deg, #F4632A 0%, #E91E8C 100%)",
  "linear-gradient(135deg, #2563EB 0%, #0BBFB5 100%)",
  "linear-gradient(135deg, #7C5CFC 0%, #2563EB 100%)",
  "linear-gradient(135deg, #E91E8C 0%, #7C5CFC 100%)",
  "linear-gradient(135deg, #F4632A 0%, #7C5CFC 100%)",
];

function pickGradient(id: string): string {
  const hash = id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return GRADIENTS[hash % GRADIENTS.length];
}

const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

/** Splits an ISO date ("YYYY-MM-DD" or full ISO) into a day number + short month,
 *  parsing the string directly to avoid timezone shifts. */
function dateChip(iso: string): { day: string; month: string } {
  const datePart = (iso ?? "").split("T")[0];
  const [, m, d] = datePart.split("-");
  return { day: String(Number(d) || ""), month: MONTHS_SHORT[Number(m) - 1] ?? "" };
}

interface EventCardProps {
  event: CycleEvent;
  compact?: boolean;
  priority?: boolean;
}

export function EventCard({ event, priority = false }: EventCardProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { isLiked, toggleLike } = useEventLikes();
  const { requireAuth } = useAuthModal();
  const { showToast } = useToast();

  const liked = isLiked(event.id);
  const [likeCount, setLikeCount] = useState(event.likes);
  const [going, setGoing] = useState(false);
  const [goingBusy, setGoingBusy] = useState(false);

  useEffect(() => {
    setLikeCount(event.likes);
  }, [event.likes]);

  useEffect(() => {
    setGoing(user ? event.participants.some((p) => p.id === user.id) : false);
  }, [user?.id, event.id, event.participants]);

  const handleLike = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!requireAuth("поставить лайк")) return;
    const willLike = !liked;
    const newCount = willLike ? likeCount + 1 : likeCount - 1;
    setLikeCount(newCount);
    await toggleLike(event.id, likeCount);
    showToast(willLike ? "Мероприятие отмечено" : "Лайк убран", "info");
  };

  const handleGoing = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!requireAuth("записаться на поездку")) return;
    if (goingBusy) return;
    setGoingBusy(true);
    const wasGoing = going;
    setGoing(!wasGoing);
    if (wasGoing) {
      await supabase.from("event_participants").delete().eq("event_id", event.id).eq("user_id", user!.id);
      showToast("Вы отменили участие", "info");
    } else {
      await supabase.from("event_participants").insert({ event_id: event.id, user_id: user!.id });
      showToast("Вы записались на поездку!", "success");
    }
    setGoingBusy(false);
  };

  const isMultiDay = event.days.length > 1;
  const totalKm = event.days.reduce((sum, d) => sum + d.distance_km, 0);
  const startPoint = event.days[0]?.start_point;
  const hasCover = !!event.cover_url;
  const { day, month } = dateChip(event.start_date);

  return (
    <Link href={`/events/${event.id}`} className="group block">
      <div
        className="bg-white rounded-2xl overflow-hidden border border-[#E4E4E7] hover:border-[#D1D1D6] transition-all duration-200 flex"
        style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}
      >
        {/* Left media */}
        <div
          className="relative w-[120px] sm:w-[150px] shrink-0 self-stretch overflow-hidden"
          style={{ minHeight: 150, background: hasCover ? undefined : pickGradient(event.id) }}
        >
          {/* Cover photo */}
          {hasCover && (
            <>
              <Image
                src={proxyImageUrl(event.cover_url) ?? event.cover_url!}
                alt={event.title}
                fill
                className="object-cover"
                sizes="150px"
                priority={priority}
              />
              <div
                className="absolute inset-0"
                style={{ background: "linear-gradient(135deg, rgba(75,47,214,0.28) 0%, rgba(124,92,252,0.16) 100%)" }}
              />
            </>
          )}

          {/* Wave decoration (gradient-only) */}
          {!hasCover && (
            <div className="absolute inset-0 opacity-10">
              <svg viewBox="0 0 200 200" className="w-full h-full" preserveAspectRatio="none">
                <path d="M0,110 Q40,70 80,95 Q120,120 160,80 Q190,55 200,75 L200,200 L0,200 Z" fill="white" />
              </svg>
            </div>
          )}

          {/* Date chip */}
          <div className="absolute top-2.5 left-2.5 bg-white rounded-xl text-center px-2 py-1.5"
            style={{ boxShadow: "0 1px 4px 0 rgb(0 0 0 / 0.18)" }}>
            <div className="text-lg font-bold text-[#1C1C1E] leading-none">{day}</div>
            <div className="text-[10px] uppercase text-[#71717A] mt-0.5">{month}</div>
          </div>
        </div>

        {/* Right content */}
        <div className="p-4 flex flex-col flex-1 min-w-0">
          {event.club && (
            <span
              role="link"
              tabIndex={0}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                router.push(`/clubs/${event.club!.slug}`);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  router.push(`/clubs/${event.club!.slug}`);
                }
              }}
              className="inline-flex self-start items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full mb-2 transition-opacity hover:opacity-80 cursor-pointer"
              style={{ backgroundColor: "#EDE9FF", color: "#7C5CFC" }}
            >
              <Shield size={10} />
              {event.club.name}
            </span>
          )}

          <h3 className="text-[#1C1C1E] font-bold text-base leading-tight line-clamp-2 group-hover:text-[#7C5CFC] transition-colors">
            {event.title}
          </h3>

          {/* Meta */}
          <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1 text-xs text-[#71717A] mt-2 mb-3">
            <span className="flex items-center gap-1">
              <Bike size={13} />
              {totalKm} км
            </span>
            {isMultiDay && <span>· {event.days.length} дн.</span>}
            {startPoint && (
              <span className="flex items-center gap-1 min-w-0">
                · <MapPin size={12} className="shrink-0" />
                <span className="truncate">{startPoint}</span>
              </span>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-2 mt-auto pt-2 border-t border-[#F5F4F1]">
            <AvatarGroup
              users={event.participants}
              max={3}
              label={`${event.participants.length}${event.max_participants ? `/${event.max_participants}` : ""} едут`}
            />

            <div className="flex items-center gap-1.5">
              <button
                onClick={handleLike}
                aria-label="Нравится"
                className="flex items-center gap-1 text-sm min-w-[40px] h-9 justify-center transition-colors"
                style={{ color: liked ? "#F4632A" : "#A1A1AA" }}
              >
                <Heart size={15} fill={liked ? "#F4632A" : "none"} />
                {likeCount}
              </button>

              <button
                onClick={handleGoing}
                disabled={goingBusy}
                className="flex items-center gap-1.5 text-sm font-medium px-4 h-9 rounded-xl transition-colors disabled:opacity-70"
                style={going
                  ? { backgroundColor: "#0BBFB5", color: "white" }
                  : { backgroundColor: "#7C5CFC", color: "white" }
                }
              >
                {going ? "✓ Еду" : "Я поеду"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
