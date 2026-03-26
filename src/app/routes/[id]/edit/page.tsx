"use client";

import { useState, use } from "react";
import { notFound, useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { ImageUpload } from "@/components/routes/ImageUpload";
import { MOCK_ROUTES } from "@/lib/data/mock";
import { MapPin, Link as LinkIcon, ChevronLeft, Check } from "lucide-react";
import type { RouteType, Difficulty } from "@/types";

const ROUTE_TYPES: { value: RouteType; label: string }[] = [
  { value: "road",   label: "Шоссе" },
  { value: "gravel", label: "Гревел" },
  { value: "mtb",    label: "МТБ" },
  { value: "urban",  label: "Городской" },
];

const DIFFICULTIES: { value: Difficulty; label: string; emoji: string }[] = [
  { value: "easy",   label: "Лёгкий",  emoji: "⭐" },
  { value: "medium", label: "Средний", emoji: "🔥" },
  { value: "hard",   label: "Сложный", emoji: "💪" },
];

// MVP: текущий пользователь
const CURRENT_USER_ID = "u1";

export default function EditRoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const route = MOCK_ROUTES.find((r) => r.id === id);

  if (!route) notFound();
  if (route.author.id !== CURRENT_USER_ID) notFound(); // Не автор — 404

  const [title, setTitle] = useState(route.title);
  const [description, setDescription] = useState(route.description);
  const [mapUrl, setMapUrl] = useState(route.mapmagic_url ?? "");
  const [region, setRegion] = useState(route.region);
  const [distance, setDistance] = useState(String(route.distance_km));
  const [elevation, setElevation] = useState(String(route.elevation_m));
  const [difficulty, setDifficulty] = useState<Difficulty>(route.difficulty);
  const [routeTypes, setRouteTypes] = useState<RouteType[]>(route.route_types);
  const [images, setImages] = useState<string[]>(route.images ?? []);
  const [saved, setSaved] = useState(false);

  const toggleType = (type: RouteType) => {
    setRouteTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const canSubmit = title.trim() && routeTypes.length > 0;

  const handleSave = () => {
    // В реальном приложении здесь будет API-запрос
    // Пока просто показываем флаг сохранения и редиректим
    setSaved(true);
    setTimeout(() => router.push(`/routes/${id}`), 1000);
  };

  return (
    <div className="min-h-screen bg-[#F5F4F1]">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-10">
        {/* Back */}
        <Link
          href={`/routes/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-[#71717A] hover:text-[#1C1C1E] mb-6 transition-colors"
        >
          <ChevronLeft size={16} /> К маршруту
        </Link>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#1C1C1E] mb-1">Редактировать маршрут</h1>
          <p className="text-[#71717A] text-sm">Обнови информацию о маршруте</p>
        </div>

        <div className="space-y-5">
          {/* Title */}
          <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-2">Название маршрута *</label>
            <input
              type="text"
              placeholder="Например: Карельская тишина"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors"
            />
          </div>

          {/* Route type — multi-select */}
          <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-1">Тип маршрута *</label>
            <p className="text-xs text-[#71717A] mb-3">Можно выбрать несколько</p>
            <div className="flex flex-wrap gap-2">
              {ROUTE_TYPES.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => toggleType(value)}
                  className="px-4 py-2 rounded-xl text-sm font-medium transition-colors border"
                  style={routeTypes.includes(value)
                    ? { backgroundColor: "#1C1C1E", color: "white", borderColor: "#1C1C1E" }
                    : { backgroundColor: "white", color: "#71717A", borderColor: "#E4E4E7" }
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty */}
          <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-3">Сложность *</label>
            <div className="flex gap-3">
              {DIFFICULTIES.map(({ value, label, emoji }) => (
                <button
                  key={value}
                  onClick={() => setDifficulty(value)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors border text-center"
                  style={difficulty === value
                    ? { backgroundColor: "#F4632A", color: "white", borderColor: "#F4632A" }
                    : { backgroundColor: "white", color: "#71717A", borderColor: "#E4E4E7" }
                  }
                >
                  {emoji} {label}
                </button>
              ))}
            </div>
          </div>

          {/* Map URL */}
          <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-1">
              <span className="flex items-center gap-2"><LinkIcon size={15} /> Ссылка на маршрут</span>
            </label>
            <p className="text-xs text-[#71717A] mb-3">Вставь ссылку из MapMagic, Komoot или другого планировщика</p>
            <input
              type="url"
              placeholder="https://mapmagic.app/map?routes=..."
              value={mapUrl}
              onChange={(e) => setMapUrl(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors font-mono"
            />
          </div>

          {/* Region + stats */}
          <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-3">Детали</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-[#71717A] mb-1 block">
                  <MapPin size={11} className="inline mr-1" />Регион
                </label>
                <input
                  type="text"
                  placeholder="Карелия"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors"
                />
              </div>
              <div>
                <label className="text-xs text-[#71717A] mb-1 block">Дистанция, км</label>
                <input
                  type="number"
                  value={distance}
                  onChange={(e) => setDistance(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors"
                />
              </div>
              <div>
                <label className="text-xs text-[#71717A] mb-1 block">Набор высоты, м</label>
                <input
                  type="number"
                  value={elevation}
                  onChange={(e) => setElevation(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Photos */}
          <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-1">Фотографии</label>
            <p className="text-xs text-[#71717A] mb-3">Загруженные фото маршрута, можно удалить или добавить новые</p>
            <ImageUpload images={images} onChange={setImages} />
          </div>

          {/* Description */}
          <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <label className="block text-sm font-semibold text-[#1C1C1E] mb-2">Описание</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full px-4 py-2.5 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Link
              href={`/routes/${id}`}
              className="flex-1 py-3.5 rounded-2xl text-sm font-semibold text-center border border-[#E4E4E7] text-[#71717A] hover:bg-white transition-colors"
            >
              Отмена
            </Link>
            <button
              onClick={handleSave}
              disabled={!canSubmit || saved}
              className="flex-1 py-3.5 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 transition-all"
              style={saved
                ? { backgroundColor: "#22C55E", color: "white" }
                : canSubmit
                  ? { backgroundColor: "#1C1C1E", color: "white" }
                  : { backgroundColor: "#E4E4E7", color: "#A1A1AA" }
              }
            >
              {saved ? <><Check size={16} /> Сохранено!</> : "Сохранить изменения"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
