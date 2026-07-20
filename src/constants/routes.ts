import type { Difficulty, Surface, RouteType } from "@/types";
import {
  Leaf, Flame, Mountain, Fish, Waves, Sailboat, TreePalm, Trees, Binoculars,
  Droplets, Coffee, GlassWater, Church, TrainFront, Castle, Landmark, MapPinned,
  Flower, Sun, Snowflake,
  type LucideIcon,
} from "lucide-react";

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

export const DIFFICULTIES: { value: Difficulty; label: string; icon: LucideIcon }[] = [
  { value: "easy",   label: "Лёгкий",  icon: Leaf },
  { value: "medium", label: "Средний", icon: Flame },
  { value: "hard",   label: "Сложный", icon: Mountain },
];

export const POI_TAGS: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "lake",        label: "Озеро",                    icon: Fish },
  { value: "river",       label: "Река",                     icon: Waves },
  { value: "sea",         label: "Море",                     icon: Sailboat },
  { value: "forest",      label: "Лес",                      icon: Trees },
  { value: "mountain",    label: "Горы",                     icon: Mountain },
  { value: "viewpoint",   label: "Видовое место",            icon: Binoculars },
  { value: "waterfall",   label: "Водопад",                  icon: Droplets },
  { value: "beach",       label: "Пляж",                     icon: TreePalm },
  { value: "cafe",        label: "Кафе / еда",               icon: Coffee },
  { value: "water_source",label: "Родник",                   icon: GlassWater },
  { value: "monastery",   label: "Храм / монастырь",         icon: Church },
  { value: "station",     label: "Электричка рядом",         icon: TrainFront },
  { value: "castle",      label: "Замок / крепость",         icon: Castle },
  { value: "historical",  label: "Исторический",             icon: Landmark },
  { value: "landmarks",   label: "Много достопримечательностей", icon: MapPinned },
];

export const SEASONS: { months: number[]; label: string; icon: LucideIcon }[] = [
  { months: [3, 4, 5],    label: "Весна",  icon: Flower },
  { months: [6, 7, 8],    label: "Лето",   icon: Sun },
  { months: [9, 10, 11],  label: "Осень",  icon: Leaf },
  { months: [12, 1, 2],   label: "Зима",   icon: Snowflake },
];
