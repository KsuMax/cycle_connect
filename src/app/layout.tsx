import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { FavoritesProvider } from "@/lib/context/FavoritesContext";
import { LikesProvider } from "@/lib/context/LikesContext";
import { EventLikesProvider } from "@/lib/context/EventLikesContext";
import { AuthProvider } from "@/lib/context/AuthContext";
import { RidesProvider } from "@/lib/context/RidesContext";
import { FollowProvider } from "@/lib/context/FollowContext";
import { ToastProvider } from "@/lib/context/ToastContext";
import { EventRidesProvider } from "@/lib/context/EventRidesContext";
import { InterestsProvider } from "@/lib/context/InterestsContext";
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
    images: [
      {
        url: "/og-default.png",
        width: 1200,
        height: 630,
        type: "image/png",
        alt: "CycleConnect — велосипедные маршруты, поездки и клубы",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og-default.png"],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Per-request CSP nonce set in middleware.ts. Pass it down to any
  // component that renders an inline <Script> so the inline payload matches
  // the response CSP.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

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
                          <InterestsProvider>
                            <AchievementsProvider>
                              <NotificationsProvider>
                                <TopProgressBar />
                                {children}
                                <LegalFooter />
                                <AiSearchWidget />
                                <BottomNav />
                                <UserFeatures />
                                <CookieBanner />
                                <YandexMetrika nonce={nonce} />
                              </NotificationsProvider>
                            </AchievementsProvider>
                          </InterestsProvider>
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
