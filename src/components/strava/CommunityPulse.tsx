"use client";

import { useEffect, useState } from "react";
import { Activity } from "lucide-react";

import { supabase, type DbStravaActivity, type DbProfile } from "@/lib/supabase";
import { StravaActivityCard } from "./StravaActivityCard";
import { StravaLogo } from "./StravaLogo";

/**
 * Home page "Pulse" block — most recent public Strava activities from
 * the whole community. Renders nothing when there are no public
 * activities (e.g. fresh install) so we don't pollute the feed with
 * an empty section.
 *
 * Why two queries instead of a Postgres join: strava_activities.user_id
 * has a foreign key to auth.users, not to public.profiles, so Supabase
 * REST can't auto-detect the relationship for an embedded select. We
 * pull ids first, then fetch matching profile rows in one batched
 * `.in("id", [...])` query. With LIMIT 6 the second query is trivial.
 *
 * RLS already filters out:
 *   - the user's own activities (we don't exclude them — they're shown
 *     in the pulse alongside others, intentional, the user feels seen)
 *   - private activities (Strava `private = true`)
 *   - activities where the owner has strava_show_activities = false
 * So we don't need any extra WHERE clauses on the client.
 */

const PULSE_LIMIT = 6;

interface ActivityWithAuthor {
  activity: DbStravaActivity;
  author: {
    id: string;
    name: string;
    avatar_url: string | null;
    username: string | null;
  } | null;
}

export function CommunityPulse() {
  const [items, setItems] = useState<ActivityWithAuthor[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: rows, error: rowsErr } = await supabase
        .from("strava_activities")
        .select("*")
        .order("start_date", { ascending: false })
        .limit(PULSE_LIMIT);

      if (cancelled) return;
      if (rowsErr || !rows || rows.length === 0) {
        setItems([]);
        return;
      }

      const activities = rows as DbStravaActivity[];
      const userIds = Array.from(new Set(activities.map((a) => a.user_id)));

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name, avatar_url, username")
        .in("id", userIds);

      if (cancelled) return;

      const profileById = new Map<string, Pick<DbProfile, "id" | "name" | "avatar_url" | "username">>();
      (profiles ?? []).forEach((p) => {
        profileById.set(p.id, p as Pick<DbProfile, "id" | "name" | "avatar_url" | "username">);
      });

      setItems(
        activities.map((a) => {
          const p = profileById.get(a.user_id);
          return {
            activity: a,
            author: p
              ? {
                  id: p.id,
                  name: p.name,
                  avatar_url: p.avatar_url,
                  username: p.username,
                }
              : null,
          };
        }),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Don't render anything until we know — keeps the home page from
  // jumping around on initial paint.
  if (items === null) return null;
  if (items.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 rounded-full" style={{ backgroundColor: "#FC4C02" }} />
          <h2 className="text-lg font-bold text-[#1C1C1E] flex items-center gap-2">
            <Activity size={18} style={{ color: "#FC4C02" }} />
            Пульс комьюнити
          </h2>
        </div>
        <div className="inline-flex items-center gap-1 text-[11px] text-[#A1A1AA]">
          через <StravaLogo size={11} className="text-[#FC4C02]" /> Strava
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {items.map(({ activity, author }) => (
          <StravaActivityCard
            key={activity.id}
            activity={activity}
            author={author}
            showOwnerLink
          />
        ))}
      </div>
    </section>
  );
}
