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
import { NavigationProvider } from "@/lib/context/NavigationContext";
import { BottomNav } from "@/components/layout/BottomNav";
import { TopProgressBar } from "@/components/layout/TopProgressBar";
import { UserFeatures } from "@/components/layout/UserFeatures";
import { AuthModalWrapper } from "@/components/ui/AuthModalWrapper";
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
                            {/* Notifications + Achievements mount only after auth
                                resolves with a logged-in user — no guest fetches,
                                no double-fetch null→user cycle */}
                            <UserFeatures />
                          </IntentsProvider>
                        </EventRidesProvider>
                      </FollowProvider>
                    </RidesProvider>
                  </FavoritesProvider>
                </EventLikesProvider>
                </LikesProvider>
              </AuthModalWrapper>
            </ToastProvider>
          </AuthProvider>
        </NavigationProvider>
      </body>
    </html>
  );
}
