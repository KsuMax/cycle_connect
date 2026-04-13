import type { Metadata } from "next";
import "./globals.css";
import { FavoritesProvider } from "@/lib/context/FavoritesContext";
import { LikesProvider } from "@/lib/context/LikesContext";
import { EventLikesProvider } from "@/lib/context/EventLikesContext";
import { AuthProvider } from "@/lib/context/AuthContext";
import { RidesProvider } from "@/lib/context/RidesContext";
import { FollowProvider } from "@/lib/context/FollowContext";
import { ToastProvider } from "@/lib/context/ToastContext";
import { EventRidesProvider } from "@/lib/context/EventRidesContext";
import { IntentsProvider } from "@/lib/context/IntentsContext";
import { AchievementsProvider } from "@/lib/context/AchievementsContext";
import { NotificationsProvider } from "@/lib/context/NotificationsContext";
import { BottomNav } from "@/components/layout/BottomNav";
import { AuthModalWrapper } from "@/components/ui/AuthModalWrapper";
import { AchievementModal } from "@/components/ui/AchievementModal";

export const metadata: Metadata = {
  title: "CycleConnect — велосипедное сообщество",
  description: "Находи маршруты, объединяйся с людьми, открывай новые места",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="h-full">
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <ToastProvider>
            <AuthModalWrapper>
              <AchievementsProvider>
                <NotificationsProvider>
                  <LikesProvider><EventLikesProvider><FavoritesProvider><RidesProvider><FollowProvider><EventRidesProvider><IntentsProvider>{children}<BottomNav /><AchievementModal /></IntentsProvider></EventRidesProvider></FollowProvider></RidesProvider></FavoritesProvider></EventLikesProvider></LikesProvider>
                </NotificationsProvider>
              </AchievementsProvider>
            </AuthModalWrapper>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
