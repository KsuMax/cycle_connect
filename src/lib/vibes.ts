import type { RideReportVibe } from "@/lib/supabase";
import { Smile, BicepsFlexed, Flame, Skull, Compass, type LucideIcon } from "lucide-react";

/** Единый список «настроений» поездки — используется в шите «Я проехал(а)» и в формах отчёта. */
export const VIBES: { value: RideReportVibe; icon: LucideIcon; label: string }[] = [
  { value: "chill",   icon: Smile,        label: "Кайф" },
  { value: "push",    icon: BicepsFlexed, label: "Жарили" },
  { value: "epic",    icon: Flame,        label: "Эпик" },
  { value: "suffer",  icon: Skull,        label: "Страдали" },
  { value: "explore", icon: Compass,      label: "Открытие" },
];
