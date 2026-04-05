"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthContext";
import { getQualifyingLevel } from "@/lib/achievement-levels";
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

// ─── Earned data ─────────────────────────────────────────────────────────────

interface EarnedInfo {
  earned_at: string;
  level: number;
}

/** Item queued for the achievement modal */
export interface NewlyEarnedItem {
  achievement: DbAchievement;
  level: number;
  isLevelUp: boolean;
}

// ─── Context value ───────────────────────────────────────────────────────────

interface AchievementsContextValue {
  achievements: DbAchievement[];
  earnedIds: Set<string>;
  earnedMap: Map<string, EarnedInfo>;
  loaded: boolean;
  checkAndAward: <T extends keyof TriggerMap>(trigger: T, payload: TriggerMap[T]) => Promise<void>;
  newlyEarned: NewlyEarnedItem[];
  dismissNewlyEarned: () => void;
  fetchUserAchievements: (userId: string) => Promise<Record<string, number>>;
  /** Showcase: current user's pinned achievement IDs */
  showcaseIds: string[];
  setShowcaseIds: (ids: string[]) => Promise<void>;
}

const AchievementsContext = createContext<AchievementsContextValue | null>(null);

export function AchievementsProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [achievements, setAchievements] = useState<DbAchievement[]>([]);
  const [earnedIds, setEarnedIds] = useState<Set<string>>(new Set());
  const [earnedMap, setEarnedMap] = useState<Map<string, EarnedInfo>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [newlyEarned, setNewlyEarned] = useState<NewlyEarnedItem[]>([]);
  const [showcaseIds, setShowcaseIdsState] = useState<string[]>([]);

  // Load catalog + user's earned achievements + showcase
  useEffect(() => {
    setLoaded(false);

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
        .select("achievement_id, earned_at, level")
        .eq("user_id", user.id)
        .then(({ data }) => {
          if (data) {
            const ids = new Set(data.map((d) => d.achievement_id));
            const map = new Map(
              data.map((d) => [d.achievement_id, { earned_at: d.earned_at, level: d.level ?? 1 }]),
            );
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

  // Load showcase from profile
  useEffect(() => {
    if (profile?.showcase_achievements) {
      setShowcaseIdsState(profile.showcase_achievements);
    } else {
      setShowcaseIdsState([]);
    }
  }, [profile]);

  // ─── Award helper (handles both new awards and level-ups) ──────────────────

  const award = useCallback(
    async (achievementId: string, level: number = 1) => {
      if (!user) return false;

      const existing = earnedMap.get(achievementId);

      if (existing && existing.level >= level) return false; // already at this level or higher

      const now = new Date().toISOString();
      const isLevelUp = !!existing;

      if (isLevelUp) {
        // Level up: update existing row
        const { error } = await supabase
          .from("user_achievements")
          .update({ level, level_updated_at: now })
          .eq("user_id", user.id)
          .eq("achievement_id", achievementId);
        if (error) return false;
      } else {
        // New achievement
        const { error } = await supabase.from("user_achievements").insert({
          user_id: user.id,
          achievement_id: achievementId,
          level,
        });
        if (error) return false;
      }

      setEarnedIds((prev) => new Set(prev).add(achievementId));
      setEarnedMap((prev) => {
        const next = new Map(prev);
        next.set(achievementId, { earned_at: existing?.earned_at ?? now, level });
        return next;
      });

      const ach = achievements.find((a) => a.id === achievementId);
      if (ach) {
        setNewlyEarned((prev) => [...prev, { achievement: ach, level, isLevelUp }]);
      }

      // Notify followers for milestone achievements (level >= 2 or hidden)
      if (level >= 2 || ach?.is_hidden) {
        notifyFollowers(achievementId, level, ach);
      }

      return true;
    },
    [user, earnedMap, achievements],
  );

  // ─── Notify followers ─────────────────────────────────────────────────────

  const notifyFollowers = useCallback(
    async (achievementId: string, level: number, ach: DbAchievement | undefined) => {
      if (!user) return;
      const { data: followers } = await supabase
        .from("user_follows")
        .select("follower_id")
        .eq("following_id", user.id);

      if (!followers || followers.length === 0) return;

      const notifications = followers.map((f) => ({
        user_id: f.follower_id,
        type: "achievement_friend",
        actor_id: user.id,
        data: {
          achievement_id: achievementId,
          achievement_title: ach?.title ?? "",
          achievement_icon: ach?.icon ?? "",
          level,
          is_hidden: ach?.is_hidden ?? false,
        },
      }));

      // Batch insert (Supabase handles arrays)
      await supabase.from("notifications").insert(notifications);
    },
    [user],
  );

  // ─── Check functions per trigger ──────────────────────────────────────────

  const checkAndAward = useCallback(
    async <T extends keyof TriggerMap>(trigger: T, payload: TriggerMap[T]) => {
      if (!user || !loaded) return;

      switch (trigger) {
        case "ride_added": {
          const p = payload as RideAddedPayload;

          // first_ride
          if (!earnedIds.has("first_ride")) {
            await award("first_ride");
          }

          // own_route (hidden)
          if (!earnedIds.has("own_route") && p.authorId === user.id) {
            await award("own_route");
          }

          // century — progressive with levels
          {
            const centuryAch = achievements.find((a) => a.id === "century");
            if (centuryAch) {
              const { data: prof } = await supabase
                .from("profiles")
                .select("km_total")
                .eq("id", user.id)
                .single();
              const totalKm = (prof?.km_total ?? 0) + p.distanceKm;
              const newLevel = getQualifyingLevel(
                centuryAch.level_thresholds,
                centuryAch.max_level,
                totalKm,
              );
              const currentLevel = earnedMap.get("century")?.level ?? 0;
              if (newLevel > currentLevel) {
                await award("century", newLevel);
              }
            }
          }

          // omnivore
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

          // explorer (hidden) — 3+ regions
          if (!earnedIds.has("explorer")) {
            const { data: rides } = await supabase
              .from("route_rides")
              .select("route_id")
              .eq("user_id", user.id);
            if (rides) {
              const routeIds = [...new Set(rides.map((r) => r.route_id))];
              if (routeIds.length > 0) {
                const { data: routes } = await supabase
                  .from("routes")
                  .select("region")
                  .in("id", routeIds);
                if (routes) {
                  const regions = new Set(
                    routes.map((r) => r.region as string).filter((r) => r && r.trim()),
                  );
                  if (regions.size >= 3) {
                    await award("explorer");
                  }
                }
              }
            }
          }

          // double_strike (hidden) — 2+ rides today
          if (!earnedIds.has("double_strike")) {
            const today = new Date().toISOString().split("T")[0];
            const { count } = await supabase
              .from("route_rides")
              .select("route_id", { count: "exact", head: true })
              .eq("user_id", user.id)
              .gte("created_at", today + "T00:00:00")
              .lte("created_at", today + "T23:59:59");
            if ((count ?? 0) >= 2) {
              await award("double_strike");
            }
          }

          break;
        }

        case "route_created": {
          const p = payload as RouteCreatedPayload;

          // cartographer
          if (!earnedIds.has("cartographer")) {
            await award("cartographer");
          }

          // architect — progressive
          {
            const archAch = achievements.find((a) => a.id === "architect");
            if (archAch) {
              const newLevel = getQualifyingLevel(
                archAch.level_thresholds,
                archAch.max_level,
                p.routesCount,
              );
              const currentLevel = earnedMap.get("architect")?.level ?? 0;
              if (newLevel > currentLevel) {
                await award("architect", newLevel);
              }
            }
          }
          break;
        }

        case "event_joined": {
          // first_event
          if (!earnedIds.has("first_event")) {
            await award("first_event");
          }

          // regular — progressive
          {
            const regAch = achievements.find((a) => a.id === "regular");
            if (regAch) {
              const { count } = await supabase
                .from("event_participants")
                .select("event_id", { count: "exact", head: true })
                .eq("user_id", user.id);
              const newLevel = getQualifyingLevel(
                regAch.level_thresholds,
                regAch.max_level,
                count ?? 0,
              );
              const currentLevel = earnedMap.get("regular")?.level ?? 0;
              if (newLevel > currentLevel) {
                await award("regular", newLevel);
              }
            }
          }
          break;
        }

        case "event_created": {
          if (!earnedIds.has("organizer")) {
            await award("organizer");
          }
          break;
        }

        case "user_followed": {
          // friendly — progressive
          {
            const friendlyAch = achievements.find((a) => a.id === "friendly");
            if (friendlyAch) {
              const { count } = await supabase
                .from("user_follows")
                .select("following_id", { count: "exact", head: true })
                .eq("follower_id", user.id);
              const newLevel = getQualifyingLevel(
                friendlyAch.level_thresholds,
                friendlyAch.max_level,
                count ?? 0,
              );
              const currentLevel = earnedMap.get("friendly")?.level ?? 0;
              if (newLevel > currentLevel) {
                await award("friendly", newLevel);
              }
            }
          }

          // social_magnet (hidden) — check if the FOLLOWED user now has 10+ followers
          // (We don't have the followed user's ID here, so skip — this is checked elsewhere)
          break;
        }
      }
    },
    [user, loaded, earnedIds, earnedMap, achievements, award],
  );

  // ─── Dismiss modal ─────────────────────────────────────────────────────────

  const dismissNewlyEarned = useCallback(() => {
    setNewlyEarned((prev) => prev.slice(1));
  }, []);

  // ─── Fetch another user's achievements (with levels) ──────────────────────

  const fetchUserAchievements = useCallback(async (userId: string): Promise<Record<string, number>> => {
    const { data } = await supabase
      .from("user_achievements")
      .select("achievement_id, level")
      .eq("user_id", userId);
    const result: Record<string, number> = {};
    (data ?? []).forEach((d) => { result[d.achievement_id] = d.level ?? 1; });
    return result;
  }, []);

  // ─── Showcase ──────────────────────────────────────────────────────────────

  const setShowcaseIds = useCallback(
    async (ids: string[]) => {
      if (!user) return;
      const trimmed = ids.slice(0, 3);
      setShowcaseIdsState(trimmed);
      await supabase
        .from("profiles")
        .update({ showcase_achievements: trimmed })
        .eq("id", user.id);
    },
    [user],
  );

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
        showcaseIds,
        setShowcaseIds,
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
