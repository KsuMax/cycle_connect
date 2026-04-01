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
import { BottomNav } from "@/components/layout/BottomNav";
import { AuthModalWrapper } from "@/components/ui/AuthModalWrapper";

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
              <LikesProvider><EventLikesProvider><FavoritesProvider><RidesProvider><FollowProvider><EventRidesProvider>{children}<BottomNav /></EventRidesProvider></FollowProvider></RidesProvider></FavoritesProvider></EventLikesProvider></LikesProvider>
            </AuthModalWrapper>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
