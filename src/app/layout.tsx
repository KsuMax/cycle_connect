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
import { LegalFooter } from "@/components/layout/LegalFooter";
import { AuthModalWrapper } from "@/components/ui/AuthModalWrapper";
import { AiSearchWidget } from "@/components/ui/AiSearchWidget";
import { CookieBanner } from "@/components/ui/CookieBanner";
import { YandexMetrika } from "@/components/analytics/YandexMetrika";
import { AchievementsProvider } from "@/lib/context/AchievementsContext";
import { NotificationsProvider } from "@/lib/context/NotificationsContext";

export const metadata: Metadata = {
  metadataBase: new URL("https://cycleconnect.cc"),
  title: {
    default: "CycleConnect — велосипедные маршруты, поездки и клубы",
    template: "%s | CycleConnect",
  },
  description:
    "Социальная сеть для велосипедистов: ищи маршруты с отзывами, присоединяйся к групповым поездкам и клубам, делись отчётами о своих покатушках.",
  openGraph: {
    type: "website",
    siteName: "CycleConnect",
    locale: "ru_RU",
    url: "https://cycleconnect.cc",
  },
  twitter: {
    card: "summary_large_image",
  },
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
                            <AchievementsProvider>
                              <NotificationsProvider>
                                <TopProgressBar />
                                {children}
                                <LegalFooter />
                                <AiSearchWidget />
                                <BottomNav />
                                <UserFeatures />
                                <CookieBanner />
                                <YandexMetrika />
                              </NotificationsProvider>
                            </AchievementsProvider>
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
