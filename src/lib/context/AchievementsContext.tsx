"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthContext";
import type { DbAchievement } from "@/lib/supabase";

// ─── Trigger payloads ────────────────────────────────────────────────────────

interface RideAddedPayload {
  routeId: string;
  authorId: string;
  distanceKm: number;
}

interface RouteCreatedPayload {
  routesCount: number;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface SimplePayload {}

type TriggerMap = {
  ride_added: RideAddedPayload;
  route_created: RouteCreatedPayload;
  event_joined: SimplePayload;
  event_created: SimplePayload;
  user_followed: SimplePayload;
};

// ─── Context value ───────────────────────────────────────────────────────────

interface AchievementsContextValue {
  /** Full catalog of achievements */
  achievements: DbAchievement[];
  /** Set of earned achievement IDs for the current user */
  earnedIds: Set<string>;
  /** Map of achievement_id → earned_at */
  earnedMap: Map<string, string>;
  /** Whether the data has been loaded */
  loaded: boolean;
  /** Check and award achievements after an action */
  checkAndAward: <T extends keyof TriggerMap>(trigger: T, payload: TriggerMap[T]) => Promise<void>;
  /** Queue of newly earned achievements (for modal display) */
  newlyEarned: DbAchievement[];
  /** Dismiss the first item in the newlyEarned queue */
  dismissNewlyEarned: () => void;
  /** Fetch another user's earned achievement IDs */
  fetchUserAchievements: (userId: string) => Promise<Set<string>>;
}

const AchievementsContext = createContext<AchievementsContextValue | null>(null);

export function AchievementsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [achievements, setAchievements] = useState<DbAchievement[]>([]);
  const [earnedIds, setEarnedIds] = useState<Set<string>>(new Set());
  const [earnedMap, setEarnedMap] = useState<Map<string, string>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [newlyEarned, setNewlyEarned] = useState<DbAchievement[]>([]);

  // Load catalog + user's earned achievements
  useEffect(() => {
    setLoaded(false);

    // Always load catalog
    supabase
      .from("achievements")
      .select("*")
      .order("sort_order")
      .then(({ data }) => {
        if (data) setAchievements(data as DbAchievement[]);
      });

    if (user) {
      supabase
        .from("user_achievements")
        .select("achievement_id, earned_at")
        .eq("user_id", user.id)
        .then(({ data }) => {
          if (data) {
            const ids = new Set(data.map((d) => d.achievement_id));
            const map = new Map(data.map((d) => [d.achievement_id, d.earned_at]));
            setEarnedIds(ids);
            setEarnedMap(map);
          }
          setLoaded(true);
        });
    } else {
      setEarnedIds(new Set());
      setEarnedMap(new Map());
      setLoaded(true);
    }
  }, [user]);

  // ─── Award helper ──────────────────────────────────────────────────────────

  const award = useCallback(
    async (achievementId: string) => {
      if (!user) return false;
      if (earnedIds.has(achievementId)) return false;

      const { error } = await supabase.from("user_achievements").insert({
        user_id: user.id,
        achievement_id: achievementId,
      });

      if (error) return false;

      const now = new Date().toISOString();
      setEarnedIds((prev) => new Set(prev).add(achievementId));
      setEarnedMap((prev) => new Map(prev).set(achievementId, now));

      const ach = achievements.find((a) => a.id === achievementId);
      if (ach) setNewlyEarned((prev) => [...prev, ach]);

      return true;
    },
    [user, earnedIds, achievements],
  );

  // ─── Check functions per trigger ──────────────────────────────────────────

  const checkAndAward = useCallback(
    async <T extends keyof TriggerMap>(trigger: T, payload: TriggerMap[T]) => {
      if (!user || !loaded) return;

      switch (trigger) {
        case "ride_added": {
          const p = payload as RideAddedPayload;

          // first_ride — user has at least 1 ride
          if (!earnedIds.has("first_ride")) {
            await award("first_ride");
          }

          // own_route — rode own route (hidden achievement)
          if (!earnedIds.has("own_route") && p.authorId === user.id) {
            await award("own_route");
          }

          // century — km_total >= 100
          if (!earnedIds.has("century")) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("km_total")
              .eq("id", user.id)
              .single();
            // Use current DB value + the distance just added (trigger may not have fired yet)
            const totalKm = (profile?.km_total ?? 0) + p.distanceKm;
            if (totalKm >= 100) {
              await award("century");
            }
          }

          // omnivore — ridden routes with 3+ different surface types
          if (!earnedIds.has("omnivore")) {
            const { data: rides } = await supabase
              .from("route_rides")
              .select("route_id")
              .eq("user_id", user.id);
            if (rides) {
              const routeIds = [...new Set(rides.map((r) => r.route_id))];
              if (routeIds.length > 0) {
                const { data: routes } = await supabase
                  .from("routes")
                  .select("surface")
                  .in("id", routeIds);
                if (routes) {
                  const allSurfaces = new Set<string>();
                  for (const r of routes) {
                    const surfaces = r.surface as string[];
                    if (surfaces) surfaces.forEach((s) => allSurfaces.add(s));
                  }
                  if (allSurfaces.size >= 3) {
                    await award("omnivore");
                  }
                }
              }
            }
          }
          break;
        }

        case "route_created": {
          const p = payload as RouteCreatedPayload;

          // cartographer — created first route
          if (!earnedIds.has("cartographer")) {
            await award("cartographer");
          }

          // architect — created 5+ routes
          if (!earnedIds.has("architect") && p.routesCount >= 5) {
            await award("architect");
          }
          break;
        }

        case "event_joined": {
          // first_event — joined first event
          if (!earnedIds.has("first_event")) {
            await award("first_event");
          }

          // regular — participated in 5+ events
          if (!earnedIds.has("regular")) {
            const { count } = await supabase
              .from("event_participants")
              .select("event_id", { count: "exact", head: true })
              .eq("user_id", user.id);
            if ((count ?? 0) >= 5) {
              await award("regular");
            }
          }
          break;
        }

        case "event_created": {
          // organizer — created first event
          if (!earnedIds.has("organizer")) {
            await award("organizer");
          }
          break;
        }

        case "user_followed": {
          // friendly — followed first user
          if (!earnedIds.has("friendly")) {
            await award("friendly");
          }
          break;
        }
      }
    },
    [user, loaded, earnedIds, award],
  );

  // ─── Dismiss modal ─────────────────────────────────────────────────────────

  const dismissNewlyEarned = useCallback(() => {
    setNewlyEarned((prev) => prev.slice(1));
  }, []);

  // ─── Fetch another user's achievements ─────────────────────────────────────

  const fetchUserAchievements = useCallback(async (userId: string): Promise<Set<string>> => {
    const { data } = await supabase
      .from("user_achievements")
      .select("achievement_id")
      .eq("user_id", userId);
    return new Set(data?.map((d) => d.achievement_id) ?? []);
  }, []);

  return (
    <AchievementsContext.Provider
      value={{
        achievements,
        earnedIds,
        earnedMap,
        loaded,
        checkAndAward,
        newlyEarned,
        dismissNewlyEarned,
        fetchUserAchievements,
      }}
    >
      {children}
    </AchievementsContext.Provider>
  );
}

export function useAchievements() {
  const ctx = useContext(AchievementsContext);
  if (!ctx) throw new Error("useAchievements must be used within AchievementsProvider");
  return ctx;
}
