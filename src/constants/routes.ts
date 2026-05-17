import type { Difficulty, Surface, RouteType } from "@/types";

export const SURFACES: { value: Surface; label: string }[] = [
  { value: "asphalt", label: "Асфальт" },
  { value: "gravel",  label: "Гравий" },
  { value: "dirt",    label: "Грунт" },
];

export const ROUTE_TYPES: { value: RouteType; label: string }[] = [
  { value: "road",   label: "Шоссе" },
  { value: "gravel", label: "Гревел" },
  { value: "mtb",    label: "МТБ" },
  { value: "urban",  label: "Городской" },
];

export const DIFFICULTIES: { value: Difficulty; label: string; emoji: string }[] = [
  { value: "easy",   label: "Лёгкий",  emoji: "⭐" },
  { value: "medium", label: "Средний", emoji: "🔥" },
  { value: "hard",   label: "Сложный", emoji: "💪" },
];
