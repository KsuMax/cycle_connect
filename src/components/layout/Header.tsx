"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Map, Newspaper, LogOut, Globe } from "lucide-react";
import { useAuth } from "@/lib/context/AuthContext";

const NAV_ITEMS = [
  { href: "/", label: "Лента", icon: Newspaper },
  { href: "/routes", label: "Маршруты", icon: Map },
  { href: "/online", label: "Онлайн", icon: Globe },
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
                  "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  isActive ? "text-[#F4632A] bg-[#FFF0EB]" : "text-[#71717A] hover:text-[#1C1C1E] hover:bg-[#F5F4F1]"
                )}>
                <Icon size={16} strokeWidth={isActive ? 2.5 : 2} />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Auth area */}
        <div className="flex items-center gap-2 shrink-0">
          {user ? (
            <>
              <Link href="/profile"
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  pathname === "/profile" ? "text-[#F4632A] bg-[#FFF0EB]" : "text-[#71717A] hover:text-[#1C1C1E] hover:bg-[#F5F4F1]"
                )}>
                <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ backgroundColor: "#7C5CFC" }}>
                  {profile?.avatar_url
                    ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                    : initials
                  }
                </div>
                <span className="hidden sm:inline">{profile?.name ?? "Профиль"}</span>
              </Link>
              <button onClick={handleSignOut}
                className="p-2 rounded-lg text-[#A1A1AA] hover:text-[#71717A] hover:bg-[#F5F4F1] transition-colors"
                title="Выйти">
                <LogOut size={16} />
              </button>
            </>
          ) : (
            <>
              <Link href="/auth/login"
                className="text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
                style={{ color: "#71717A" }}>
                Войти
              </Link>
              <Link href="/auth/register"
                className="text-sm font-medium px-3 py-1.5 rounded-lg transition-colors text-white"
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
