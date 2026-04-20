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
import { NavigationProvider } from "@/lib/context/NavigationContext";
import { BottomNav } from "@/components/layout/BottomNav";
import { TopProgressBar } from "@/components/layout/TopProgressBar";
import { AuthModalWrapper } from "@/components/ui/AuthModalWrapper";
import { AchievementModal } from "@/components/ui/AchievementModal";
import { AiSearchWidget } from "@/components/ui/AiSearchWidget";

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
        <NavigationProvider>
          <AuthProvider>
            <ToastProvider>
              <AuthModalWrapper>
                <AchievementsProvider>
                  <NotificationsProvider>
                    <LikesProvider>
                    <EventLikesProvider>
                      <FavoritesProvider>
                        <RidesProvider>
                          <FollowProvider>
                            <EventRidesProvider>
                              <IntentsProvider>
                                <TopProgressBar />
                                {children}
                                <AiSearchWidget />
                                <BottomNav />
                                <AchievementModal />
                              </IntentsProvider>
                            </EventRidesProvider>
                          </FollowProvider>
                        </RidesProvider>
                      </FavoritesProvider>
                    </EventLikesProvider>
                  </LikesProvider>
                  </NotificationsProvider>
                </AchievementsProvider>
              </AuthModalWrapper>
            </ToastProvider>
          </AuthProvider>
        </NavigationProvider>
      </body>
    </html>
  );
}
