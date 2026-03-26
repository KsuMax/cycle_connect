"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { MOCK_ROUTES } from "@/lib/data/mock";
import { DayEditor } from "@/components/events/DayEditor";
import { Button } from "@/components/ui/Button";
import { Plus, Trash2, ChevronLeft, Calendar, Bike, Info } from "lucide-react";
import Link from "next/link";

interface DayForm {
  id: string;
  title: string;
  date: string;
  distance_km: string;
  start_point: string;
  end_point: string;
  surface_note: string;
  description: string;
}

const newDay = (index: number): DayForm => ({
  id: crypto.randomUUID(),
  title: `День ${index + 1}`,
  date: "",
  distance_km: "",
  start_point: "",
  end_point: "",
  surface_note: "",
  description: "",
});

function CreateEventForm() {
  const searchParams = useSearchParams();
  const preselectedRouteId = searchParams.get("route") ?? "";

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [routeId, setRouteId] = useState(preselectedRouteId);
  const [startDate, setStartDate] = useState("");
  const [maxParticipants, setMaxParticipants] = useState("");
  const [days, setDays] = useState<DayForm[]>([newDay(0)]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const selectedRoute = MOCK_ROUTES.find((r) => r.id === routeId);

  const addDay = () => setDays((prev) => [...prev, newDay(prev.length)]);

  const removeDay = (id: string) => {
    if (days.length <= 1) return;
    setDays((prev) => prev.filter((d) => d.id !== id));
  };

  const updateDay = (id: string, field: keyof DayForm, value: string) => {
    setDays((prev) => prev.map((d) => (d.id === id ? { ...d, [field]: value } : d)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    // Simulate API call
    await new Promise((r) => setTimeout(r, 1000));
    setSubmitting(false);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#F5F4F1]">
        <Header />
        <div className="max-w-xl mx-auto px-4 py-20 text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-[#1C1C1E] mb-2">Мероприятие создано!</h2>
          <p className="text-[#71717A] mb-6">Теперь другие участники могут найти твою поездку и присоединиться</p>
          <div className="flex gap-3 justify-center">
            <Link href="/events/velopohod-kareliya-may">
              <Button variant="secondary">Посмотреть мероприятие</Button>
            </Link>
            <Link href="/">
              <Button variant="outline">На главную</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F4F1]">
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Back */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-[#71717A] hover:text-[#1C1C1E] mb-5 transition-colors"
        >
          <ChevronLeft size={16} /> Назад
        </Link>

        <h1 className="text-2xl font-bold text-[#1C1C1E] mb-1">Создать мероприятие</h1>
        <p className="text-[#71717A] text-sm mb-6">Опиши поездку по дням, добавь маршрут и позови участников</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Basic info */}
          <div className="bg-white rounded-2xl p-6 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <h2 className="font-semibold text-[#1C1C1E] mb-4 flex items-center gap-2">
              <Info size={16} style={{ color: "#F4632A" }} />
              Основная информация
            </h2>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-1.5 block">
                  Название мероприятия *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Например: Велопоход по Карелии"
                  className="w-full px-4 py-2.5 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-1.5 block">
                  Описание
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Кратко расскажи о поездке — куда едем, что увидим, что нужно взять..."
                  className="w-full px-4 py-2.5 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors resize-none"
                />
              </div>
            </div>
          </div>

          {/* Route selection */}
          <div className="bg-white rounded-2xl p-6 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <h2 className="font-semibold text-[#1C1C1E] mb-4 flex items-center gap-2">
              <Bike size={16} style={{ color: "#0BBFB5" }} />
              Маршрут
            </h2>

            <div>
              <label className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-1.5 block">
                Выбери маршрут
              </label>
              <select
                value={routeId}
                onChange={(e) => setRouteId(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors bg-white"
              >
                <option value="">— Без маршрута —</option>
                {MOCK_ROUTES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title} ({r.distance_km} км · {r.region})
                  </option>
                ))}
              </select>
            </div>

            {selectedRoute && (
              <div className="mt-3 p-3 rounded-xl flex items-center gap-3" style={{ backgroundColor: "#F5F4F1" }}>
                <Bike size={16} style={{ color: "#0BBFB5" }} />
                <div className="text-sm">
                  <span className="font-medium text-[#1C1C1E]">{selectedRoute.title}</span>
                  <span className="text-[#71717A] ml-2">{selectedRoute.distance_km} км · {selectedRoute.region}</span>
                </div>
              </div>
            )}
          </div>

          {/* Dates + participants */}
          <div className="bg-white rounded-2xl p-6 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <h2 className="font-semibold text-[#1C1C1E] mb-4 flex items-center gap-2">
              <Calendar size={16} style={{ color: "#7C5CFC" }} />
              Даты и участники
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-1.5 block">
                  Дата начала *
                </label>
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-1.5 block">
                  Макс. участников
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={maxParticipants}
                  onChange={(e) => setMaxParticipants(e.target.value)}
                  placeholder="Без ограничения"
                  className="w-full px-4 py-2.5 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Days */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-[#1C1C1E] flex items-center gap-2">
                <span
                  className="w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center"
                  style={{ backgroundColor: "#F4632A" }}
                >
                  {days.length}
                </span>
                {days.length === 1 ? "1 день" : `${days.length} дня`}
              </h2>
              <Button type="button" variant="outline" size="sm" onClick={addDay}>
                <Plus size={14} /> Добавить день
              </Button>
            </div>

            <div className="space-y-4">
              {days.map((day, idx) => (
                <div key={day.id} className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-sm"
                        style={{ backgroundColor: "#F4632A" }}
                      >
                        {idx + 1}
                      </div>
                      <input
                        type="text"
                        value={day.title}
                        onChange={(e) => updateDay(day.id, "title", e.target.value)}
                        className="font-semibold text-[#1C1C1E] text-sm bg-transparent outline-none border-b border-transparent focus:border-[#F4632A] pb-0.5 transition-colors"
                        placeholder={`День ${idx + 1}`}
                      />
                    </div>
                    {days.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeDay(day.id)}
                        className="text-[#A1A1AA] hover:text-[#EF4444] transition-colors p-1 rounded-lg hover:bg-[#FEE2E2]"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <div>
                      <label className="text-xs text-[#71717A] mb-1 block">Дата</label>
                      <input
                        type="date"
                        value={day.date}
                        onChange={(e) => updateDay(day.id, "date", e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] text-xs outline-none focus:border-[#F4632A] transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[#71717A] mb-1 block">Км</label>
                      <input
                        type="number"
                        value={day.distance_km}
                        onChange={(e) => updateDay(day.id, "distance_km", e.target.value)}
                        placeholder="0"
                        className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] text-xs outline-none focus:border-[#F4632A] transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[#71717A] mb-1 block">Старт</label>
                      <input
                        type="text"
                        value={day.start_point}
                        onChange={(e) => updateDay(day.id, "start_point", e.target.value)}
                        placeholder="Откуда"
                        className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] text-xs outline-none focus:border-[#F4632A] transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[#71717A] mb-1 block">Финиш</label>
                      <input
                        type="text"
                        value={day.end_point}
                        onChange={(e) => updateDay(day.id, "end_point", e.target.value)}
                        placeholder="Куда"
                        className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] text-xs outline-none focus:border-[#F4632A] transition-colors"
                      />
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="text-xs text-[#71717A] mb-1 block">Тип покрытия</label>
                    <input
                      type="text"
                      value={day.surface_note}
                      onChange={(e) => updateDay(day.id, "surface_note", e.target.value)}
                      placeholder="Например: Асфальт + грунт 30%"
                      className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] text-xs outline-none focus:border-[#F4632A] transition-colors"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-[#71717A] mb-1.5 block">Описание дня</label>
                    <DayEditor
                      onChange={(html) => updateDay(day.id, "description", html)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <Button type="submit" variant="secondary" size="lg" loading={submitting} className="flex-1">
              Опубликовать мероприятие
            </Button>
            <Link href="/">
              <Button type="button" variant="outline" size="lg">
                Отмена
              </Button>
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}

export default function CreateEventPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F5F4F1]"><Header /></div>}>
      <CreateEventForm />
    </Suspense>
  );
}
