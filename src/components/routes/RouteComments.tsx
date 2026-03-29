"use client";

import { useState, useEffect, useCallback } from "react";
import { Heart, Send } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/context/AuthContext";
import type { User } from "@/types";

interface CommentData {
  id: string;
  author: User;
  text: string;
  created_at: string;
  likes: number;
}

interface RouteCommentsProps {
  routeId: string;
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "только что";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} мин. назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч. назад`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "вчера";
  if (days < 7) return `${days} дн. назад`;
  if (days < 30) return `${Math.floor(days / 7)} нед. назад`;
  if (days < 365) return `${Math.floor(days / 30)} мес. назад`;
  return `${Math.floor(days / 365)} г. назад`;
}

type DbCommentRow = {
  id: string;
  text: string;
  created_at: string;
  author: { id: string; name: string; avatar_url?: string | null; km_total: number; routes_count: number; events_count: number } | null;
};

function dbToComment(row: DbCommentRow): CommentData {
  const name = row.author?.name ?? "Участник";
  return {
    id: row.id,
    text: row.text,
    created_at: row.created_at,
    likes: 0,
    author: {
      id: row.author?.id ?? "",
      name,
      initials: name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase(),
      color: "#7C5CFC",
      avatar_url: row.author?.avatar_url ?? null,
      km_total: row.author?.km_total ?? 0,
      routes_count: row.author?.routes_count ?? 0,
      events_count: row.author?.events_count ?? 0,
    },
  };
}

export function RouteComments({ routeId }: RouteCommentsProps) {
  const { user, profile } = useAuth();
  const [comments, setComments] = useState<CommentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());

  const loadComments = useCallback(async () => {
    const { data } = await supabase
      .from("route_comments")
      .select("id, text, created_at, author:profiles!author_id(id, name, avatar_url, km_total, routes_count, events_count)")
      .eq("route_id", routeId)
      .order("created_at", { ascending: true });

    if (data) setComments((data as unknown as DbCommentRow[]).map(dbToComment));
    setLoading(false);
  }, [routeId]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed || !user || submitting) return;

    setSubmitting(true);
    const { data, error } = await supabase
      .from("route_comments")
      .insert({ route_id: routeId, author_id: user.id, text: trimmed })
      .select("id, text, created_at, author:profiles!author_id(id, name, avatar_url, km_total, routes_count, events_count)")
      .single();

    if (!error && data) {
      setComments((prev) => [...prev, dbToComment(data as unknown as DbCommentRow)]);
      setText("");
    }
    setSubmitting(false);
  };

  const toggleLike = (id: string) => {
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setComments((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, likes: likedIds.has(id) ? c.likes - 1 : c.likes + 1 } : c
      )
    );
  };

  const currentUserAvatar: User | null = profile
    ? {
        id: user!.id,
        name: profile.name,
        initials: profile.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase(),
        color: "#7C5CFC",
        avatar_url: profile.avatar_url ?? null,
        km_total: profile.km_total,
        routes_count: profile.routes_count,
        events_count: profile.events_count,
      }
    : null;

  return (
    <div className="bg-white rounded-2xl border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
      <div className="px-6 py-4 border-b border-[#F5F4F1] flex items-center gap-2">
        <span className="font-semibold text-[#1C1C1E]">Обсуждение</span>
        <span className="text-xs text-[#A1A1AA] bg-[#F5F4F1] px-2 py-0.5 rounded-full font-medium">
          {comments.length}
        </span>
      </div>

      {/* Comments list */}
      <div className="divide-y divide-[#F5F4F1]">
        {loading && (
          <div className="px-6 py-6 text-center text-[#A1A1AA] text-sm">Загрузка...</div>
        )}
        {!loading && comments.length === 0 && (
          <div className="px-6 py-8 text-center text-[#A1A1AA] text-sm">
            Будь первым, кто оставит комментарий 💬
          </div>
        )}
        {comments.map((comment) => (
          <div key={comment.id} className="px-6 py-4 flex gap-3">
            <Avatar user={comment.author} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-sm font-semibold text-[#1C1C1E]">{comment.author.name}</span>
                <span className="text-xs text-[#A1A1AA]">{timeAgo(comment.created_at)}</span>
              </div>
              <p className="text-sm text-[#3F3F46] leading-relaxed">{comment.text}</p>
              <button
                onClick={() => toggleLike(comment.id)}
                className="mt-2 flex items-center gap-1 text-xs transition-colors"
                style={{ color: likedIds.has(comment.id) ? "#F4632A" : "#A1A1AA" }}
              >
                <Heart size={12} fill={likedIds.has(comment.id) ? "#F4632A" : "none"} />
                {comment.likes > 0 && <span>{comment.likes}</span>}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t border-[#F5F4F1]">
        {user && currentUserAvatar ? (
          <>
            <div className="flex gap-3 items-end">
              <Avatar user={currentUserAvatar} size="sm" />
              <div className="flex-1 relative">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  placeholder="Напиши комментарий..."
                  rows={1}
                  className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors resize-none leading-relaxed"
                  style={{ minHeight: 42 }}
                />
                <button
                  onClick={handleSubmit}
                  disabled={!text.trim() || submitting}
                  className="absolute right-3 bottom-2.5 transition-opacity"
                  style={{ color: text.trim() && !submitting ? "#F4632A" : "#D1D1D6" }}
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
            <p className="text-xs text-[#A1A1AA] mt-2 ml-10">Enter — отправить, Shift+Enter — перенос строки</p>
          </>
        ) : (
          <p className="text-sm text-center text-[#A1A1AA]">
            <a href="/auth/login" className="text-[#F4632A] hover:underline">Войди</a>, чтобы оставить комментарий
          </p>
        )}
      </div>
    </div>
  );
}
