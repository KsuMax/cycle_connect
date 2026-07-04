import type { RideReportVibe } from "@/lib/supabase";

/** Единый список «настроений» поездки — используется в шите «Я проехал(а)» и в формах отчёта. */
export const VIBES: { value: RideReportVibe; emoji: string; label: string }[] = [
  { value: "chill",   emoji: "😌", label: "Кайф" },
  { value: "push",    emoji: "💪", label: "Жарили" },
  { value: "epic",    emoji: "🔥", label: "Эпик" },
  { value: "suffer",  emoji: "😵", label: "Страдали" },
  { value: "explore", emoji: "🧭", label: "Открытие" },
];
