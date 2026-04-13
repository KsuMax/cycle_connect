"use client";

import { useState, useRef, useEffect } from "react";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useNotifications } from "@/lib/context/NotificationsContext";
import { formatDate } from "@/lib/utils";
import { proxyImageUrl, type DbNotification, type DbProfile } from "@/lib/supabase";

function formatNotification(n: DbNotification) {
  const actor = n.actor as DbProfile | undefined;
  const actorName = actor?.name ?? "Кто-то";
  const data = n.data as Record<string, unknown> | null;

  if (n.type === "achievement_friend" && data) {
    const icon = (data.achievement_icon as string) ?? "🏆";
    const title = (data.achievement_title as string) ?? "достижение";
    const level = data.level as number | undefined;
    const isHidden = data.is_hidden as boolean | undefined;

    if (isHidden) {
      return `${icon} ${actorName} получил редкое достижение «${title}»`;
    }
    if (level && level > 1) {
      const levelNames: Record<number, string> = { 2: "серебро", 3: "золото", 4: "алмаз" };
      return `${icon} ${actorName} повысил «${title}» до уровня ${levelNames[level] ?? level}`;
    }
    return `${icon} ${actorName} получил достижение «${title}»`;
  }

  if (n.type === "intent_joined" && data) {
    const routeTitle = (data.route_title as string) ?? "маршрут";
    const date = data.planned_date as string | undefined;
    return `🚴 ${actorName} хочет присоединиться к поездке «${routeTitle}»${date ? ` ${formatDate(date)}` : ""}`;
  }

  return `${actorName} — новое уведомление`;
}

export function NotificationBell() {
  const { notifications, unreadCount, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleOpen = () => {
    setOpen((v) => !v);
    if (!open && unreadCount > 0) {
      markAllRead();
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleOpen}
        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-[#71717A] hover:text-[#1C1C1E] hover:bg-[#F5F4F1] transition-colors relative"
        title="Уведомления"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span
            className="absolute top-1.5 right-1.5 min-w-[16px] h-4 flex items-center justify-center rounded-full text-[10px] font-bold text-white px-1"
            style={{ backgroundColor: "#F4632A" }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-80 bg-white rounded-2xl border border-[#E4E4E7] overflow-hidden z-50"
          style={{ boxShadow: "0 4px 24px 0 rgb(0 0 0 / 0.12)", animation: "tooltip-fade 0.15s ease-out" }}
        >
          <div className="px-4 py-3 border-b border-[#E4E4E7] flex items-center justify-between">
            <span className="text-sm font-semibold text-[#1C1C1E]">Уведомления</span>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[#A1A1AA]">
                Пока нет уведомлений
              </div>
            ) : (
              notifications.slice(0, 20).map((n) => {
                const actor = n.actor as DbProfile | undefined;
                const data = n.data as Record<string, unknown> | null;
                const actorId = data?.actor_id ?? actor?.id ?? n.actor_id;
                return (
                  <Link
                    key={n.id}
                    href={actorId ? `/users/${actorId}` : "#"}
                    onClick={() => setOpen(false)}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-[#F5F4F1] transition-colors border-b border-[#F5F4F1] last:border-0"
                    style={{ backgroundColor: n.read ? undefined : "#FFFBF5" }}
                  >
                    {/* Actor avatar */}
                    <div
                      className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ backgroundColor: "#7C5CFC" }}
                    >
                      {actor?.avatar_url ? (
                        <img src={proxyImageUrl(actor.avatar_url) ?? actor.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        (actor?.name ?? "?")[0].toUpperCase()
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-[#1C1C1E] leading-snug">
                        {formatNotification(n)}
                      </div>
                      <div className="text-[10px] text-[#A1A1AA] mt-0.5">
                        {formatDate(n.created_at)}
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>

          <style>{`
            @keyframes tooltip-fade {
              from { opacity: 0; transform: translateY(-4px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
