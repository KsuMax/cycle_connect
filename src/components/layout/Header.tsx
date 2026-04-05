"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Map, Newspaper, LogOut } from "lucide-react";
import { useAuth } from "@/lib/context/AuthContext";
import { proxyImageUrl } from "@/lib/supabase";
import { NotificationBell } from "@/components/ui/NotificationBell";

const NAV_ITEMS = [
  { href: "/", label: "Лента", icon: Newspaper },
  { href: "/routes", label: "Маршруты", icon: Map },
];

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
    router.refresh();
  };

  const initials = profile?.name
    ? profile.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : user?.email?.[0].toUpperCase() ?? "?";

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="shrink-0 select-none">
          <span className="text-[1.35rem] font-extrabold tracking-tight">
            <span style={{ color: "#1C1C1E" }}>Cycle</span><span style={{ color: "#F4632A" }}>Connect</span>
          </span>
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href) && href !== "/";
            return (
              <Link key={href} href={href}
                className={cn(
                  "flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg text-sm font-medium transition-colors",
                  isActive ? "text-[#F4632A] bg-[#FFF0EB]" : "text-[#71717A] hover:text-[#1C1C1E] hover:bg-[#F5F4F1]"
                )}>
                <Icon size={16} strokeWidth={isActive ? 2.5 : 2} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Auth area — hidden on mobile (BottomNav handles it) */}
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          {user ? (
            <>
              <NotificationBell />
              <Link href="/profile"
                className={cn(
                  "flex items-center gap-2 px-3 min-h-[44px] rounded-lg text-sm font-medium transition-colors",
                  pathname === "/profile" ? "text-[#F4632A] bg-[#FFF0EB]" : "text-[#71717A] hover:text-[#1C1C1E] hover:bg-[#F5F4F1]"
                )}>
                <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ backgroundColor: "#7C5CFC" }}>
                  {profile?.avatar_url
                    ? <img src={proxyImageUrl(profile.avatar_url) ?? profile.avatar_url} alt="" className="w-full h-full object-cover" />
                    : initials
                  }
                </div>
                <span>{profile?.name ?? "Профиль"}</span>
              </Link>
              <button onClick={handleSignOut}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-[#A1A1AA] hover:text-[#71717A] hover:bg-[#F5F4F1] transition-colors"
                title="Выйти">
                <LogOut size={16} />
              </button>
            </>
          ) : (
            <>
              <Link href="/auth/login"
                className="text-sm font-medium px-4 min-h-[44px] flex items-center rounded-lg transition-colors"
                style={{ color: "#71717A" }}>
                Войти
              </Link>
              <Link href="/auth/register"
                className="text-sm font-medium px-4 min-h-[44px] flex items-center rounded-lg transition-colors text-white"
                style={{ backgroundColor: "#1C1C1E" }}>
                Регистрация
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
