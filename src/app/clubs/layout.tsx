import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Велоклубы и сообщества",
  description:
    "Велоклубы CycleConnect: регулярные поездки командой, общая лента событий и список маршрутов клуба. Найди клуб в своём городе или создай свой.",
  alternates: { canonical: "/clubs" },
};

export default function ClubsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
