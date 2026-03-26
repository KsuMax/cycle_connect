import type { Metadata } from "next";
import "./globals.css";
import { FavoritesProvider } from "@/lib/context/FavoritesContext";
import { AuthProvider } from "@/lib/context/AuthContext";

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
        <AuthProvider><FavoritesProvider>{children}</FavoritesProvider></AuthProvider>
      </body>
    </html>
  );
}
