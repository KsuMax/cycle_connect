import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { FavoritesProvider } from "@/lib/context/FavoritesContext";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

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
    <html lang="ru" className={`${geist.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        <FavoritesProvider>{children}</FavoritesProvider>
      </body>
    </html>
  );
}
