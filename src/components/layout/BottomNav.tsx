"use client";

import { usePathname } from "next/navigation";
import { Newspaper, Map, Plus, Calendar, User } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/context/AuthContext";
import { useNavigation } from "@/lib/context/NavigationContext";

export function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { navigate, pendingHref } = useNavigation();
  const [showCreate, setShowCreate] = useState(false);

  const handleCreateRoute = () => {
    setShowCreate(false);
    navigate("/routes/new");
  };

  const handleCreateEvent = () => {
    setShowCreate(false);
    navigate("/events/new");
  };

  const isActive = (href: string, exact = false) => {
    if (pendingHref === href) return true;
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  const isPending = (href: string) => pendingHref === href;

  const handleClick = (href: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    if (pathname === href) return;
    navigate(href);
  };

  return (
    <>
      {showCreate && (
        <div
          className="sm:hidden fixed inset-0 z-40 bg-black/20"
          onClick={() => setShowCreate(false)}
        />
      )}

      {showCreate && (
        <div className="sm:hidden fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-white rounded-2xl border border-[#E4E4E7] p-2 flex flex-col gap-1 min-w-[220px]"
          style={{ boxShadow: "0 8px 32px 0 rgb(0 0 0 / 0.15)" }}>
          <button
            onClick={handleCreateRoute}
            className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#F5F4F1] text-sm font-medium text-[#1C1C1E] w-full text-left"
          >
            <Map size={18} style={{ color: "#F4632A" }} />
            Добавить маршрут
          </button>
          <button
            onClick={handleCreateEvent}
            className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#F5F4F1] text-sm font-medium text-[#1C1C1E] w-full text-left"
          >
            <Calendar size={18} style={{ color: "#7C5CFC" }} />
            Создать мероприятие
          </button>
        </div>
      )}

      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-[#E4E4E7]"
        style={{
          boxShadow: "0 -1px 3px 0 rgb(0 0 0 / 0.07)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="flex items-center justify-around h-16 px-1">
          <a
            href="/"
            onClick={handleClick("/")}
            className={cn(
              "flex flex-col items-center gap-0.5 min-w-[56px] min-h-[44px] justify-center rounded-xl transition-opacity",
              isActive("/", true) ? "text-[#F4632A]" : "text-[#71717A]",
              isPending("/") && "opacity-70"
            )}
          >
            <Newspaper size={20} strokeWidth={isActive("/", true) ? 2.5 : 2} />
            <span className="text-[10px] font-medium">Лента</span>
          </a>

          <a
            href="/routes"
            onClick={handleClick("/routes")}
            className={cn(
              "flex flex-col items-center gap-0.5 min-w-[56px] min-h-[44px] justify-center rounded-xl transition-opacity",
              isActive("/routes") ? "text-[#F4632A]" : "text-[#71717A]",
              isPending("/routes") && "opacity-70"
            )}
          >
            <Map size={20} strokeWidth={isActive("/routes") ? 2.5 : 2} />
            <span className="text-[10px] font-medium">Маршруты</span>
          </a>

          <button
            onClick={() => setShowCreate(!showCreate)}
            className="flex items-center justify-center w-12 h-12 rounded-2xl text-white"
            style={{ backgroundColor: "#F4632A", boxShadow: "0 4px 12px 0 rgb(244 99 42 / 0.4)" }}
            aria-label="Создать"
          >
            <Plus size={24} strokeWidth={2.5} />
          </button>

          <a
            href="/routes?tab=events"
            onClick={handleClick("/routes?tab=events")}
            className={cn(
              "flex flex-col items-center gap-0.5 min-w-[56px] min-h-[44px] justify-center rounded-xl transition-opacity",
              pathname.startsWith("/events") || pendingHref === "/routes?tab=events" ? "text-[#F4632A]" : "text-[#71717A]",
              isPending("/routes?tab=events") && "opacity-70"
            )}
          >
            <Calendar size={20} strokeWidth={pathname.startsWith("/events") ? 2.5 : 2} />
            <span className="text-[10px] font-medium">Поездки</span>
          </a>

          <a
            href={user ? "/profile" : "/auth/login"}
            onClick={handleClick(user ? "/profile" : "/auth/login")}
            className={cn(
              "flex flex-col items-center gap-0.5 min-w-[56px] min-h-[44px] justify-center rounded-xl transition-opacity",
              isActive("/profile", true) ? "text-[#F4632A]" : "text-[#71717A]",
              (isPending("/profile") || isPending("/auth/login")) && "opacity-70"
            )}
          >
            <User size={20} strokeWidth={isActive("/profile", true) ? 2.5 : 2} />
            <span className="text-[10px] font-medium">{user ? "Профиль" : "Войти"}</span>
          </a>
        </div>
      </nav>

      {/* Spacer so content isn't hidden behind bottom nav */}
      <div className="sm:hidden" style={{ height: "calc(4rem + env(safe-area-inset-bottom))" }} />
    </>
  );
}
