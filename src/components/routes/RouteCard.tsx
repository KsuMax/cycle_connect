"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bike, Mountain, Clock, Heart, ChevronRight } from "lucide-react";
import { DifficultyBadge, Badge } from "@/components/ui/Badge";
import { AvatarGroup } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import { useLikes } from "@/lib/context/LikesContext";
import { useAuth } from "@/lib/context/AuthContext";
import { useEventRides } from "@/lib/context/EventRidesContext";
import { proxyImageUrl } from "@/lib/supabase";
import type { Route, RouteType } from "@/types";

const ROUTE_TYPE_LABELS: Record<RouteType, string> = {
  road: "Шоссе",
  gravel: "Гревел",
  mtb: "МТБ",
  urban: "Городской",
};

const ROUTE_TYPE_COLORS: Record<RouteType, { bg: string; text: string }> = {
  road:   { bg: "#EFF6FF", text: "#2563EB" },
  gravel: { bg: "#FFF7ED", text: "#EA580C" },
  mtb:    { bg: "#F5F3FF", text: "#7C3AED" },
  urban:  { bg: "#F0FDFA", text: "#0D9488" },
};

interface RouteCardProps {
  route: Route;
  compact?: boolean;
}

export function RouteCard({ route, compact = false }: RouteCardProps) {
  const { isLiked, toggleLike } = useLikes();
  const { user } = useAuth();
  const { getRouteEventStatus } = useEventRides();
  const router = useRouter();
  const [likeCount, setLikeCount] = useState(route.likes);
  const liked = isLiked(route.id);

  const handleLike = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!user) { router.push("/auth/login"); return; }
    const prev = likeCount;
    setLikeCount(liked ? prev - 1 : prev + 1);
    await toggleLike(route.id, prev);
  };

  return (
    <Link href={`/routes/${route.id}`} className="group block">
      <div
        className={cn(
          "bg-white rounded-2xl overflow-hidden transition-all duration-200",
          "border border-[#E4E4E7] hover:border-[#D1D1D6]"
        )}
        style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}
      >
        {/* Cover or placeholder */}
        <div className="relative overflow-hidden" style={{ height: compact ? 140 : 180 }}>
          {route.cover_url ? (
            <img src={proxyImageUrl(route.cover_url) ?? route.cover_url} alt={route.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#E6FAF9] to-[#D1FAF7]">
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 180" preserveAspectRatio="none">
                <path
                  d={route.difficulty === "hard"
                    ? "M 40,140 Q 100,40 160,100 Q 220,160 280,60 Q 340,20 370,80"
                    : route.difficulty === "medium"
                    ? "M 30,120 Q 120,60 200,100 Q 280,140 370,70"
                    : "M 30,110 Q 150,80 250,100 Q 320,110 370,90"
                  }
                  fill="none"
                  stroke={route.difficulty === "hard" ? "#7C5CFC" : route.difficulty === "medium" ? "#F4632A" : "#0BBFB5"}
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <circle cx="30" cy={route.difficulty === "hard" ? 140 : route.difficulty === "medium" ? 120 : 110} r="5" fill="#22C55E" />
                <circle cx="370" cy={route.difficulty === "hard" ? 80 : route.difficulty === "medium" ? 70 : 90} r="5" fill="#F4632A" />
              </svg>
            </div>
          )}

          {/* Region label */}
          <div className="absolute top-3 left-3">
            <span className="text-xs font-medium px-2 py-1 rounded-lg bg-white/80 backdrop-blur-sm text-[#71717A]">
              📍 {route.region}
            </span>
          </div>

          {/* Difficulty badge */}
          <div className="absolute top-3 right-3">
            <DifficultyBadge difficulty={route.difficulty} />
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-md" style={{ backgroundColor: "#FFF0EB", color: "#F4632A" }}>
              🗺 Маршрут
            </span>
          </div>
          <h3 className="font-semibold text-[#1C1C1E] text-base leading-snug mb-2 line-clamp-2 group-hover:text-[#F4632A] transition-colors">
            {route.title}
            {getRouteEventStatus(route.id) === "upcoming" && (
              <span className="inline-block ml-1.5 align-middle -translate-y-px text-[11px] font-semibold px-2 py-0.5 rounded-md"
                style={{ backgroundColor: "#EFF6FF", color: "#2563EB" }}>
                Скоро катну
              </span>
            )}
          </h3>

          {/* Stats */}
          <div className="flex items-center gap-3 text-sm text-[#71717A] mb-3">
            <span className="flex items-center gap-1">
              <Bike size={14} />
              {route.distance_km} км
            </span>
            <span className="flex items-center gap-1">
              <Mountain size={14} />
              {route.elevation_m} м
            </span>
            <span className="flex items-center gap-1">
              <Clock size={14} />
              ~{Math.round(route.duration_min / 60)} ч
            </span>
          </div>

          {/* Route types */}
          <div className="flex flex-wrap gap-1.5 mb-2">
            {route.route_types.map((type) => (
              <span
                key={type}
                className="text-xs font-semibold px-2 py-0.5 rounded-md"
                style={{ backgroundColor: ROUTE_TYPE_COLORS[type].bg, color: ROUTE_TYPE_COLORS[type].text }}
              >
                {ROUTE_TYPE_LABELS[type]}
              </span>
            ))}
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {route.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline">{tag}</Badge>
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-[#F5F4F1]">
            {route.riders_today > 0 ? (
              <AvatarGroup
                users={[route.author]}
                label={`${route.riders_today} ${route.riders_today === 1 ? "едет" : "едут"} сегодня`}
              />
            ) : (
              <span className="text-xs text-[#A1A1AA]">Будь первым</span>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={handleLike}
                className="flex items-center gap-1 text-sm min-w-[44px] min-h-[44px] justify-center transition-colors"
                style={{ color: liked ? "#F4632A" : "#A1A1AA" }}
              >
                <Heart size={14} fill={liked ? "#F4632A" : "none"} />
                {likeCount}
              </button>
              <span className="flex items-center gap-0.5 text-xs font-medium text-[#F4632A]">
                Открыть <ChevronRight size={14} />
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
