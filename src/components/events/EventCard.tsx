"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Bike, Heart, ChevronRight } from "lucide-react";
import { AvatarGroup } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/context/AuthContext";
import { useEventLikes } from "@/lib/context/EventLikesContext";
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

interface EventCardProps {
  event: CycleEvent;
  compact?: boolean;
}

export function EventCard({ event }: EventCardProps) {
  const { user } = useAuth();
  const { isLiked, toggleLike } = useEventLikes();
  const router = useRouter();

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
    if (!user) { router.push("/auth/login"); return; }
    const newCount = liked ? likeCount - 1 : likeCount + 1;
    setLikeCount(newCount);
    await toggleLike(event.id, likeCount);
  };

  const handleGoing = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!user) { router.push("/auth/login"); return; }
    if (goingBusy) return;
    setGoingBusy(true);
    const wasGoing = going;
    setGoing(!wasGoing);
    if (wasGoing) {
      await supabase.from("event_participants").delete().eq("event_id", event.id).eq("user_id", user.id);
    } else {
      await supabase.from("event_participants").insert({ event_id: event.id, user_id: user.id });
    }
    setGoingBusy(false);
  };

  const isMultiDay = event.days.length > 1;
  const totalKm = event.days.reduce((sum, d) => sum + d.distance_km, 0);
  const hasCover = !!event.cover_url;

  return (
    <Link href={`/events/${event.id}`} className="group flex h-full">
      <div
        className="bg-white rounded-2xl overflow-hidden border border-[#E4E4E7] hover:border-[#D1D1D6] transition-all duration-200 flex flex-col w-full"
        style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}
      >
        {/* Hero banner */}
        <div
          className="relative flex flex-col justify-end overflow-hidden"
          style={{
            height: 160,
            background: hasCover ? undefined : pickGradient(event.id),
          }}
        >
          {/* Cover photo */}
          {hasCover && (
            <>
              <img
                src={event.cover_url!}
                alt={event.title}
                className="absolute inset-0 w-full h-full object-cover"
              />
              {/* Gradient overlay for text readability */}
              <div
                className="absolute inset-0"
                style={{ background: "linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.1) 60%, transparent 100%)" }}
              />
            </>
          )}

          {/* Wave decoration (gradient-only) */}
          {!hasCover && (
            <div className="absolute inset-0 opacity-10">
              <svg viewBox="0 0 400 160" className="w-full h-full" preserveAspectRatio="none">
                <path d="M0,80 Q50,35 100,65 Q150,95 200,45 Q250,5 300,55 Q350,85 400,35 L400,160 L0,160 Z" fill="white"/>
              </svg>
            </div>
          )}

          <div className="relative p-5">
            <div className="flex items-center gap-2 mb-1">
              <Badge className="bg-white/30 text-white border-0 text-xs font-semibold backdrop-blur-sm">
                📅 {isMultiDay ? `${event.days.length} дня · поход` : "Поездка"}
              </Badge>
            </div>
            <h3 className="text-white font-bold text-lg leading-tight group-hover:opacity-90 transition-opacity drop-shadow-sm">
              {event.title}
            </h3>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 flex flex-col flex-1">
          {/* Meta */}
          <div className="flex items-center gap-3 text-sm text-[#71717A] mb-3">
            <span className="flex items-center gap-1">
              <Calendar size={14} />
              {formatDate(event.start_date)}
            </span>
            <span className="flex items-center gap-1">
              <Bike size={14} />
              {totalKm} км
            </span>
            {isMultiDay && (
              <span className="text-xs text-[#A1A1AA]">{event.days.length} дн.</span>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-[#F5F4F1]">
            <AvatarGroup
              users={event.participants}
              max={3}
              label={`${event.participants.length}${event.max_participants ? `/${event.max_participants}` : ""} едут`}
            />

            <div className="flex items-center gap-2">
              <button
                onClick={handleLike}
                className="flex items-center gap-1 text-sm min-w-[44px] min-h-[44px] justify-center transition-colors"
                style={{ color: liked ? "#F4632A" : "#A1A1AA" }}
              >
                <Heart size={14} fill={liked ? "#F4632A" : "none"} />
                {likeCount}
              </button>

              <button
                onClick={handleGoing}
                disabled={goingBusy}
                className="flex items-center gap-1.5 text-sm font-medium px-4 min-h-[44px] rounded-xl transition-colors disabled:opacity-70"
                style={going
                  ? { backgroundColor: "#0BBFB5", color: "white" }
                  : { backgroundColor: "#1C1C1E", color: "white" }
                }
              >
                {going ? "✓ Еду" : <>Я поеду <ChevronRight size={14} /></>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
