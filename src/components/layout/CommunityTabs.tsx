"use client";

import { usePathname } from "next/navigation";
import { Shield, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigation } from "@/lib/context/NavigationContext";

const TABS = [
  { href: "/clubs", label: "Клубы", icon: Shield },
  { href: "/users", label: "Участники", icon: Users },
];

/**
 * Section switcher for the "Сообщество" area, shared by the Clubs and Users
 * pages. Renders as a segmented control near the top of each page.
 */
export function CommunityTabs() {
  const pathname = usePathname();
  const { navigate, pendingHref } = useNavigation();

  return (
    <div
      className="inline-flex gap-1 bg-white rounded-xl p-1 border border-[#E4E4E7] mb-6"
      style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.05)" }}
    >
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href) || pendingHref === href;
        return (
          <a
            key={href}
            href={href}
            onClick={(e) => {
              e.preventDefault();
              if (pathname === href) return;
              navigate(href);
            }}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              active ? "bg-[#FFF0EB] text-[#F4632A]" : "text-[#71717A] hover:text-[#1C1C1E] hover:bg-[#F5F4F1]",
            )}
          >
            <Icon size={15} strokeWidth={active ? 2.5 : 2} />
            {label}
          </a>
        );
      })}
    </div>
  );
}
