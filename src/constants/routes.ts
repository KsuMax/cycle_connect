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

export const POI_TAGS: { value: string; label: string; emoji: string }[] = [
  { value: "lake",        label: "Озеро",                    emoji: "🏞" },
  { value: "river",       label: "Река",                     emoji: "🌊" },
  { value: "sea",         label: "Море",                     emoji: "🏖" },
  { value: "forest",      label: "Лес",                      emoji: "🌲" },
  { value: "mountain",    label: "Горы",                     emoji: "🏔" },
  { value: "viewpoint",   label: "Видовое место",            emoji: "👁" },
  { value: "waterfall",   label: "Водопад",                  emoji: "💧" },
  { value: "beach",       label: "Пляж",                     emoji: "🏝" },
  { value: "cafe",        label: "Кафе / еда",               emoji: "☕" },
  { value: "water_source",label: "Родник",                   emoji: "🚰" },
  { value: "monastery",   label: "Храм / монастырь",         emoji: "⛪" },
  { value: "station",     label: "Электричка рядом",         emoji: "🚂" },
  { value: "castle",      label: "Замок / крепость",         emoji: "🏰" },
  { value: "historical",  label: "Исторический",             emoji: "🏛" },
  { value: "landmarks",   label: "Много достопримечательностей", emoji: "🗺" },
];

export const SEASONS: { months: number[]; label: string; emoji: string }[] = [
  { months: [3, 4, 5],    label: "Весна",  emoji: "🌸" },
  { months: [6, 7, 8],    label: "Лето",   emoji: "☀️" },
  { months: [9, 10, 11],  label: "Осень",  emoji: "🍂" },
  { months: [12, 1, 2],   label: "Зима",   emoji: "❄️" },
];
