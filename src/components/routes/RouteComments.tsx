"use client";

import { useState } from "react";
import { Heart, Send } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { MOCK_USERS } from "@/lib/data/mock";
import type { Comment } from "@/types";

interface RouteCommentsProps {
  routeId: string;
  initialComments: Comment[];
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date("2026-03-25");
  const days = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "сегодня";
  if (days === 1) return "вчера";
  if (days < 7) return `${days} дн. назад`;
  if (days < 30) return `${Math.floor(days / 7)} нед. назад`;
  if (days < 365) return `${Math.floor(days / 30)} мес. назад`;
  return `${Math.floor(days / 365)} г. назад`;
}

export function RouteComments({ initialComments }: RouteCommentsProps) {
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [text, setText] = useState("");
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const newComment: Comment = {
      id: `c-${Date.now()}`,
      author: MOCK_USERS[0], // текущий пользователь (мок)
      text: trimmed,
      created_at: "2026-03-25",
      likes: 0,
    };
    setComments((prev) => [...prev, newComment]);
    setText("");
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
        {comments.length === 0 && (
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
        <div className="flex gap-3 items-end">
          <Avatar user={MOCK_USERS[0]} size="sm" />
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
              disabled={!text.trim()}
              className="absolute right-3 bottom-2.5 transition-opacity"
              style={{ color: text.trim() ? "#F4632A" : "#D1D1D6" }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
        <p className="text-xs text-[#A1A1AA] mt-2 ml-10">Enter — отправить, Shift+Enter — перенос строки</p>
      </div>
    </div>
  );
}
