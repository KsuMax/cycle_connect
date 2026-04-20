"use client";

/**
 * Mounts the heavy, auth-only providers (Notifications + Achievements)
 * and the AchievementModal only after:
 *   1. Auth has finished resolving (!loading)
 *   2. A user is actually logged in
 *
 * Benefits:
 *   - Guests never pay the cost of these providers (no DB queries, no WebSocket)
 *   - Logged-in users: providers mount after auth resolves → a single fetch with
 *     the real user, no wasted null-user cycle
 *   - AchievementModal is only in the DOM when there's a user to award
 */

import { useAuth } from "@/lib/context/AuthContext";
import { AchievementsProvider } from "@/lib/context/AchievementsContext";
import { NotificationsProvider } from "@/lib/context/NotificationsContext";
import { AchievementModal } from "@/components/ui/AchievementModal";

export function UserFeatures() {
  const { user, loading } = useAuth();

  if (loading || !user) return null;

  return (
    <AchievementsProvider>
      <NotificationsProvider>
        <AchievementModal />
      </NotificationsProvider>
    </AchievementsProvider>
  );
}
