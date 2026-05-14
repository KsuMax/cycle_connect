import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Велосипедисты",
  description:
    "Участники CycleConnect: ищи друзей по велу, смотри их маршруты и поездки, подписывайся на интересных людей.",
  alternates: { canonical: "/users" },
};

export default function UsersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
