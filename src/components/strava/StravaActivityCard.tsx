"use client";

import { useState } from "react";
import Link from "next/link";
import { Bike, Mountain, Lock, Heart } from "lucide-react";

import type { DbStravaActivity } from "@/lib/supabase";
import { buildStravaStaticMapUrl } from "@/lib/strava/static-map";
import {
  formatActivityDate,
  formatDistanceM,
  formatDurationS,
  formatElevationM,
  formatSpeedMs,
  formatSportType,
} from "@/lib/strava/format";
import { StravaLogo } from "./StravaLogo";

/**
 * One Strava activity row. Shows a small static-map preview on the
 * left and a stat block on the right. Clickable through to Strava's
 * activity page in a new tab — we deliberately don't try to render a
 * full activity detail view inside CycleConnect; Strava's own page
 * is the source of truth for kudos / comments / segments.
 *
 * Used in three places:
 *   - profile/Strava tab (the user's own list)
 *   - users/[id] page (someone else's public list)
 *   - home page CommunityPulse (recent activities from everyone)
 *
 * Layout is responsive: on narrow screens the map drops below the text.
 *
 * Props:
 *   activity      — the row from public.strava_activities
 *   author        — name + avatar to render in the "by" line; only used
 *                   when this row is shown OUTSIDE the owner's profile
 *                   (e.g. CommunityPulse). Pass null to hide.
 *   showOwnerLink — whether the author block should link to /users/[id]
 */
interface Props {
  activity: DbStravaActivity;
  author?: {
    id: string;
    name: string;
    avatar_url: string | null;
    username: string | null;
  } | null;
  showOwnerLink?: boolean;
}

export function StravaActivityCard({
  activity,
  author = null,
  showOwnerLink = false,
}: Props) {
  // Map preview is the most visually impactful element when present.
  // Building it once per render is cheap (just a URL string) and avoids
  // useMemo overhead.
  const mapUrl = buildStravaStaticMapUrl(activity.summary_polyline, {
    width: 320,
    height: 200,
  });
  const [mapErrored, setMapErrored] = useState(false);
  const showMap = mapUrl && !mapErrored;

  const stravaLink = `https://www.strava.com/activities/${activity.id}`;
  const sportLabel = formatSportType(activity.type);
  const elev = formatElevationM(activity.total_elevation_gain_m);
  const speed = formatSpeedMs(activity.average_speed_ms);

  return (
    <div
      className="bg-white rounded-2xl border border-[#E4E4E7] overflow-hidden flex flex-col sm:flex-row"
      style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}
    >
      {/* Map / placeholder */}
      <div
        className="shrink-0 bg-[#F5F4F1] sm:w-[140px] sm:h-auto h-32 relative"
        style={{ minHeight: 128 }}
      >
        {showMap ? (
          // Static image — no JS map lib. eslint-disable-next-line is needed
          // because we deliberately use <img> for an external CDN URL.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mapUrl}
            alt={`Карта заезда ${activity.name ?? ""}`}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
            onError={() => setMapErrored(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[#A1A1AA]">
            {activity.is_trainer ? (
              <Mountain size={28} strokeWidth={1.5} />
            ) : (
              <Bike size={28} strokeWidth={1.5} />
            )}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 p-4 min-w-0">
        {/* Author + sport type chip */}
        <div className="flex items-center justify-between gap-3 mb-1.5">
          {author ? (
            showOwnerLink ? (
              <Link
                href={`/users/${author.id}`}
                className="flex items-center gap-2 min-w-0 group"
              >
                <AuthorAvatar author={author} />
                <span className="text-xs font-medium text-[#71717A] group-hover:text-[#1C1C1E] transition-colors truncate">
                  {author.name}
                </span>
              </Link>
            ) : (
              <div className="flex items-center gap-2 min-w-0">
                <AuthorAvatar author={author} />
                <span className="text-xs font-medium text-[#71717A] truncate">
                  {author.name}
                </span>
              </div>
            )
          ) : (
            <div className="text-xs text-[#A1A1AA] truncate">
              {formatActivityDate(activity.start_date)}
            </div>
          )}
          <span
            className="shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
            style={{ backgroundColor: "#FFF0EB", color: "#FC4C02" }}
          >
            {sportLabel}
          </span>
        </div>

        {/* Title */}
        <a
          href={stravaLink}
          target="_blank"
          rel="noopener noreferrer"
          className="block font-semibold text-sm text-[#1C1C1E] hover:text-[#FC4C02] transition-colors line-clamp-2"
          title={activity.name ?? ""}
        >
          {activity.name || "Без названия"}
        </a>

        {/* Date (only when author is shown above) */}
        {author && (
          <div className="text-[11px] text-[#A1A1AA] mt-0.5">
            {formatActivityDate(activity.start_date)}
          </div>
        )}

        {/* Stats row */}
        <div className="flex items-baseline gap-4 mt-2 flex-wrap">
          <Stat value={formatDistanceM(activity.distance_m)} accent />
          <Stat value={formatDurationS(activity.moving_time_s)} />
          {elev && <Stat value={elev} />}
          {speed && <Stat value={speed} />}
        </div>

        {/* Footer: Strava link + flags */}
        <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-[#F0F0F0]">
          <a
            href={stravaLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold transition-colors hover:underline"
            style={{ color: "#FC4C02" }}
          >
            <StravaLogo size={11} /> Открыть в Strava
          </a>
          <div className="flex items-center gap-2 text-[11px] text-[#A1A1AA]">
            {activity.kudos_count > 0 && (
              <span className="inline-flex items-center gap-1">
                <Heart size={11} /> {activity.kudos_count}
              </span>
            )}
            {activity.is_private && <Lock size={11} aria-label="Приватный" />}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ value, accent = false }: { value: string; accent?: boolean }) {
  return (
    <span
      className={`text-sm font-bold ${accent ? "" : "text-[#1C1C1E]"}`}
      style={accent ? { color: "#FC4C02" } : undefined}
    >
      {value}
    </span>
  );
}

function AuthorAvatar({
  author,
}: {
  author: {
    name: string;
    avatar_url: string | null;
  };
}) {
  const initials = author.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div
      className="w-6 h-6 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
      style={{ backgroundColor: "#7C5CFC" }}
    >
      {author.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={author.avatar_url}
          alt={author.name}
          className="w-full h-full object-cover"
        />
      ) : (
        initials
      )}
    </div>
  );
}
