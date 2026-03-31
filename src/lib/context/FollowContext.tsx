"use client";

/*
  Requires this table in Supabase (run once in SQL Editor):

  create table if not exists user_follows (
    follower_id  uuid not null references profiles(id) on delete cascade,
    following_id uuid not null references profiles(id) on delete cascade,
    created_at   timestamptz default now(),
    primary key (follower_id, following_id)
  );
  create index if not exists user_follows_follower_idx  on user_follows(follower_id);
  create index if not exists user_follows_following_idx on user_follows(following_id);
*/

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/context/AuthContext";

interface FollowContextValue {
  followedIds: Set<string>;
  isFollowing: (userId: string) => boolean;
  follow: (userId: string) => Promise<void>;
  unfollow: (userId: string) => Promise<void>;
  loaded: boolean;
}

const FollowContext = createContext<FollowContextValue>({
  followedIds: new Set(),
  isFollowing: () => false,
  follow: async () => {},
  unfollow: async () => {},
  loaded: false,
});

export function FollowProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) {
      setFollowedIds(new Set());
      setLoaded(true);
      return;
    }
    supabase
      .from("user_follows")
      .select("following_id")
      .eq("follower_id", user.id)
      .then(({ data }) => {
        if (data) setFollowedIds(new Set(data.map((r: { following_id: string }) => r.following_id)));
        setLoaded(true);
      });
  }, [user]);

  const follow = useCallback(async (userId: string) => {
    if (!user) return;
    setFollowedIds((prev) => new Set([...prev, userId]));
    await supabase.from("user_follows").insert({ follower_id: user.id, following_id: userId });
  }, [user]);

  const unfollow = useCallback(async (userId: string) => {
    if (!user) return;
    setFollowedIds((prev) => { const next = new Set(prev); next.delete(userId); return next; });
    await supabase.from("user_follows").delete().eq("follower_id", user.id).eq("following_id", userId);
  }, [user]);

  const isFollowing = useCallback((userId: string) => followedIds.has(userId), [followedIds]);

  return (
    <FollowContext.Provider value={{ followedIds, isFollowing, follow, unfollow, loaded }}>
      {children}
    </FollowContext.Provider>
  );
}

export const useFollow = () => useContext(FollowContext);
