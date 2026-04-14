import type { Difficulty, Surface, BikeType, RouteType } from "@/types";

export const SURFACES: { value: Surface; label: string }[] = [
  { value: "asphalt", label: "Асфальт" },
  { value: "gravel",  label: "Гравий" },
  { value: "dirt",    label: "Грунт" },
  { value: "mixed",   label: "Смешанное" },
];

export const BIKE_TYPES: { value: BikeType; label: string }[] = [
  { value: "road",     label: "Шоссейный" },
  { value: "mountain", label: "Горный (МТБ)" },
  { value: "gravel",   label: "Гревел" },
  { value: "any",      label: "Любой" },
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
