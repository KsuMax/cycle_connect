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

interface EventCardProps {
  event: CycleEvent;
  compact?: boolean;
}

export function EventCard({ event }: EventCardProps) {
  const { user } = useAuth();
  const { isLiked, toggleLike } = useEventLikes();
  const router = useRouter();

  const liked = isLiked(event.id);
  // likeCount tracks the displayed count, initialized from DB and updated optimistically
  const [likeCount, setLikeCount] = useState(event.likes);
  const [going, setGoing] = useState(false);
  const [goingBusy, setGoingBusy] = useState(false);

  // Keep likeCount in sync when event.likes changes (e.g. parent re-fetches)
  useEffect(() => {
    setLikeCount(event.likes);
  }, [event.likes]);

  // Sync going state whenever user or participants change
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

  return (
    <Link href={`/events/${event.id}`} className="group flex h-full">
      <div
        className="bg-white rounded-2xl overflow-hidden border border-[#E4E4E7] hover:border-[#D1D1D6] transition-all duration-200 flex flex-col w-full"
        style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}
      >
        {/* Hero banner */}
        <div
          className="relative p-5 flex flex-col justify-end"
          style={{
            height: 140,
            background: "linear-gradient(135deg, #0BBFB5 0%, #7C5CFC 100%)",
          }}
        >
          <div className="absolute inset-0 opacity-10">
            <svg viewBox="0 0 400 140" className="w-full h-full" preserveAspectRatio="none">
              <path d="M0,70 Q50,30 100,60 Q150,90 200,40 Q250,0 300,50 Q350,80 400,30 L400,140 L0,140 Z" fill="white"/>
            </svg>
          </div>

          <div className="relative">
            <div className="flex items-center gap-2 mb-1">
              <Badge className="bg-white/30 text-white border-0 text-xs font-semibold backdrop-blur-sm">
                📅 {isMultiDay ? `${event.days.length} дня · поход` : "Поездка"}
              </Badge>
            </div>
            <h3 className="text-white font-bold text-lg leading-tight group-hover:opacity-90 transition-opacity">
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
