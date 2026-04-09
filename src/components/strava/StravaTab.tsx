"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bike, RefreshCw, Calendar, Mountain, Activity, AlertCircle } from "lucide-react";

import { supabase, type DbStravaActivity } from "@/lib/supabase";
import { useAuth } from "@/lib/context/AuthContext";

import { ConnectStravaButton } from "./ConnectStravaButton";
import { StravaActivityCard } from "./StravaActivityCard";
import { StravaLogo } from "./StravaLogo";
import { formatDistanceM } from "@/lib/strava/format";

/**
 * Full Strava panel rendered inside the profile page.
 *
 * Three states, branched at the top:
 *   1. Not connected      → big Connect with Strava CTA + 3-bullet pitch.
 *   2. Connected, loading → skeletons.
 *   3. Connected          → 4 stats tiles + last 10 activities + footer
 *                            with sport-type filter and link to settings.
 *
 * The activity list is fetched directly via supabase-js using the anon
 * key — RLS lets owners read all of their own rows, so we don't need
 * any server-side wrapper. The query is scoped to the current user.
 *
 * Stats come straight from the profile row (already aggregated by
 * recompute_strava_stats on the server side after every webhook).
 */

const ACTIVITY_LIMIT = 10;

export function StravaTab() {
  const { user, profile } = useAuth();

  const [activities, setActivities] = useState<DbStravaActivity[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [last30Km, setLast30Km] = useState<number | null>(null);

  const isConnected = !!profile?.strava_connected;

  useEffect(() => {
    if (!user || !isConnected) return;
    // Note: we deliberately don't reset state to null here. The
    // cancelled flag below guarantees we never overwrite with stale
    // data, and the not-connected branch returns early before any of
    // this state is read, so old data is never visible after a
    // disconnect/reconnect cycle.

    let cancelled = false;

    (async () => {
      const [{ data: rows, error: rowsErr }, { data: monthRows, error: monthErr }] =
        // Filter by the sport types the user has enabled (default: Ride + GravelRide).
        // This hides HIIT sessions, walks, and other non-cycling activities.
        const sportTypes: string[] =
          profile?.strava_sport_types?.length
            ? profile.strava_sport_types
            : ["Ride", "GravelRide"];

        await Promise.all([
          supabase
            .from("strava_activities")
            .select("*")
            .eq("user_id", user.id)
            .in("type", sportTypes)
            .order("start_date", { ascending: false })
            .limit(ACTIVITY_LIMIT),
          supabase
            .from("strava_activities")
            .select("distance_m")
            .eq("user_id", user.id)
            .in("type", sportTypes)
            .eq("is_counted", true)
            .gte(
              "start_date",
              new Date(Date.now() - 30 * 86_400_000).toISOString(),
            ),
        ]);

      if (cancelled) return;

      if (rowsErr) {
        setLoadError(rowsErr.message);
        setActivities([]);
      } else {
        setActivities((rows ?? []) as DbStravaActivity[]);
      }

      if (!monthErr && monthRows) {
        const sum = (monthRows as { distance_m: number }[]).reduce(
          (acc, r) => acc + Number(r.distance_m || 0),
          0,
        );
        setLast30Km(sum);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, isConnected]);

  if (!user) return null;

  // ─── Not connected ─────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div
        className="bg-white rounded-2xl border border-[#E4E4E7] overflow-hidden"
        style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}
      >
        {/* Hero strip */}
        <div
          className="px-6 py-7 text-white relative overflow-hidden"
          style={{
            background:
              "linear-gradient(135deg, #FC4C02 0%, #E34302 50%, #C73602 100%)",
          }}
        >
          <div className="absolute right-2 top-2 opacity-20">
            <StravaLogo size={120} />
          </div>
          <div className="relative max-w-md">
            <div className="flex items-center gap-2 mb-1">
              <StravaLogo size={18} />
              <span className="text-xs font-bold uppercase tracking-wider">
                Strava
              </span>
            </div>
            <h2 className="text-xl font-bold mb-1.5">
              Километры считаются сами
            </h2>
            <p className="text-white/90 text-sm">
              Подключи Strava один раз — и каждый твой заезд автоматически
              появится в профиле. Никаких ручных пометок и записей.
            </p>
          </div>
        </div>

        {/* Bullets + CTA */}
        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <Pitch
              icon={<Bike size={20} />}
              title="Заезды сами"
              text="Любой заезд из Strava подтянется в течение пары секунд"
            />
            <Pitch
              icon={<Activity size={20} />}
              title="Реальные километры"
              text="Профиль покажет, сколько ты реально накатываешь, а не сколько отметил"
            />
            <Pitch
              icon={<Mountain size={20} />}
              title="С последних 30 дней"
              text="При подключении подтянем твою историю за месяц назад"
            />
          </div>
          <ConnectStravaButton />
        </div>
      </div>
    );
  }

  // ─── Connected ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Stats tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile
          label="всего"
          value={
            profile?.strava_synced_km != null
              ? formatDistanceM(Number(profile.strava_synced_km) * 1000)
              : "—"
          }
          color="#FC4C02"
        />
        <StatTile
          label="за 30 дней"
          value={last30Km != null ? formatDistanceM(last30Km) : "…"}
          color="#7C5CFC"
        />
        <StatTile
          label="заездов"
          value={
            profile?.strava_synced_rides != null
              ? String(profile.strava_synced_rides)
              : "—"
          }
          color="#0BBFB5"
        />
        <StatTile
          label="последний"
          value={
            profile?.strava_last_activity_at
              ? relativeDays(profile.strava_last_activity_at)
              : "—"
          }
          color="#1C1C1E"
        />
      </div>

      {/* Activity list header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar size={16} style={{ color: "#FC4C02" }} />
          <h3 className="text-sm font-semibold text-[#1C1C1E]">
            Последние заезды
          </h3>
        </div>
        <Link
          href="/profile/settings"
          className="inline-flex items-center gap-1 text-xs font-medium text-[#71717A] hover:text-[#1C1C1E] transition-colors"
        >
          <RefreshCw size={11} />
          Настройки
        </Link>
      </div>

      {/* Activity list body */}
      {loadError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl px-4 py-3 text-sm flex items-center gap-2">
          <AlertCircle size={15} />
          Не удалось загрузить заезды: {loadError}
        </div>
      )}

      {activities === null && !loadError && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 bg-white rounded-2xl animate-pulse border border-[#E4E4E7]"
            />
          ))}
        </div>
      )}

      {activities && activities.length === 0 && !loadError && (
        <div
          className="bg-white rounded-2xl border border-[#E4E4E7] p-8 text-center"
          style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}
        >
          <div
            className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-3"
            style={{ backgroundColor: "#FFF0EB" }}
          >
            <Bike size={24} style={{ color: "#FC4C02" }} />
          </div>
          <div className="font-semibold text-[#1C1C1E] mb-1">
            Заездов пока нет
          </div>
          <div className="text-sm text-[#71717A] max-w-xs mx-auto">
            Бэкфил подтягивает заезды последних 30 дней — обнови страницу
            через минуту, либо запиши новый заезд в Strava.
          </div>
        </div>
      )}

      {activities && activities.length > 0 && (
        <div className="space-y-3">
          {activities.map((a) => (
            <StravaActivityCard key={a.id} activity={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      className="bg-white rounded-2xl border border-[#E4E4E7] p-4"
      style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}
    >
      <div className="text-xl font-bold leading-tight" style={{ color }}>
        {value}
      </div>
      <div className="text-[11px] text-[#71717A] mt-1">{label}</div>
    </div>
  );
}

function Pitch({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: "#FFF0EB", color: "#FC4C02" }}
      >
        {icon}
      </div>
      <div>
        <div className="text-sm font-semibold text-[#1C1C1E]">{title}</div>
        <div className="text-xs text-[#71717A] mt-0.5 leading-snug">{text}</div>
      </div>
    </div>
  );
}

function relativeDays(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const diff = Date.now() - date.getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days <= 0) return "сегодня";
  if (days === 1) return "вчера";
  if (days < 7) return `${days} дн назад`;
  if (days < 30) return `${Math.floor(days / 7)} нед назад`;
  return `${Math.floor(days / 30)} мес назад`;
}
