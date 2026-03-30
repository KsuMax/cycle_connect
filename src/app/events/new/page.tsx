"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { DayEditor } from "@/components/events/DayEditor";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { MOCK_ROUTES } from "@/lib/data/mock";
import { Plus, Trash2, ChevronLeft, Calendar, Bike, AlertCircle } from "lucide-react";
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

interface RouteOption { id: string; title: string; distance_km: number; region: string; }

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
  const router = useRouter();
  const { user, profile } = useAuth();
  const preselectedRouteId = searchParams.get("route") ?? "";

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [routeId, setRouteId] = useState(preselectedRouteId);
  const [startDate, setStartDate] = useState("");
  const [maxParticipants, setMaxParticipants] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [days, setDays] = useState<DayForm[]>([newDay(0)]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [routes, setRoutes] = useState<RouteOption[]>([]);

  // Load available routes (Supabase first, fallback to mock)
  useEffect(() => {
    async function loadRoutes() {
      const { data, error } = await supabase
        .from("routes")
        .select("id, title, distance_km, region")
        .order("created_at", { ascending: false });

      if (!error && data && data.length > 0) {
        setRoutes(data);
      } else {
        setRoutes(MOCK_ROUTES.map((r) => ({
          id: r.id, title: r.title, distance_km: r.distance_km, region: r.region,
        })));
      }
    }
    loadRoutes();
  }, []);

  const selectedRoute = routes.find((r) => r.id === routeId);

  const addDay = () => setDays((prev) => [...prev, newDay(prev.length)]);
  const removeDay = (id: string) => { if (days.length > 1) setDays((prev) => prev.filter((d) => d.id !== id)); };
  const updateDay = (id: string, field: keyof DayForm, value: string) =>
    setDays((prev) => prev.map((d) => (d.id === id ? { ...d, [field]: value } : d)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setError("");

    // 1. Insert event
    const { data: eventData, error: eventError } = await supabase
      .from("events")
      .insert({
        organizer_id: user.id,
        route_id: routeId || null,
        title: title.trim(),
        description: description.trim(),
        start_date: startDate || null,
        end_date: days.length > 1 && days[days.length - 1].date ? days[days.length - 1].date : startDate || null,
        max_participants: parseInt(maxParticipants) || null,
        is_private: isPrivate,
        likes_count: 0,
      })
      .select()
      .single();

    if (eventError || !eventData) {
      setError("Не удалось сохранить мероприятие. Попробуй ещё раз.");
      setSubmitting(false);
      return;
    }

    // 2. Insert days
    const dayRows = days.map((d, i) => ({
      event_id: eventData.id,
      day_number: i + 1,
      date: d.date || null,
      title: d.title,
      distance_km: parseFloat(d.distance_km) || null,
      start_point: d.start_point || null,
      end_point: d.end_point || null,
      description: d.description || null,
      surface_note: d.surface_note || null,
    }));

    await supabase.from("event_days").insert(dayRows);

    // 3. Auto-join as participant
    await supabase.from("event_participants").insert({ event_id: eventData.id, user_id: user.id });

    // 4. Update events_count
    await supabase.from("profiles")
      .update({ events_count: (profile?.events_count ?? 0) + 1 })
      .eq("id", user.id);

    router.push(`/events/${eventData.id}`);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F5F4F1]">
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-20 text-center">
          <AlertCircle size={48} className="mx-auto mb-4 text-[#F4632A]" />
          <h2 className="text-xl font-bold text-[#1C1C1E] mb-2">Нужна авторизация</h2>
          <p className="text-[#71717A] mb-6">Чтобы создать мероприятие, войди в аккаунт</p>
          <Link href="/auth/login"
            className="inline-block px-6 py-3 rounded-xl text-white text-sm font-semibold"
            style={{ backgroundColor: "#F4632A" }}>
            Войти
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F4F1]">
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-[#71717A] hover:text-[#1C1C1E] mb-6 transition-colors">
          <ChevronLeft size={16} /> Назад
        </Link>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#1C1C1E] mb-1">Новое мероприятие</h1>
          <p className="text-[#71717A] text-sm">Организуй поездку и пригласи участников</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</div>
          )}

          {/* Basic info */}
          <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <h2 className="font-semibold text-[#1C1C1E] mb-4">Основное</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-1.5 block">Название *</label>
                <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder="Велопоход по Карелии" className="w-full px-4 py-2.5 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors" />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-1.5 block">Описание</label>
                <DayEditor
                  placeholder="Расскажи об этой поездке..."
                  onChange={(html) => setDescription(html)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-1.5 block flex items-center gap-1">
                    <Calendar size={11} /> Дата начала
                  </label>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-1.5 block flex items-center gap-1">
                    <Bike size={11} /> Макс. участников
                  </label>
                  <input type="number" min={1} value={maxParticipants} onChange={(e) => setMaxParticipants(e.target.value)}
                    placeholder="Без ограничений"
                    className="w-full px-3 py-2.5 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors" />
                </div>
              </div>

              {/* Private toggle */}
              <div className="flex items-center justify-between pt-1">
                <div>
                  <div className="text-sm font-medium text-[#1C1C1E]">Закрытое мероприятие</div>
                  <div className="text-xs text-[#71717A]">Не отображается в списках — доступно только по прямой ссылке</div>
                </div>
                <button type="button" onClick={() => setIsPrivate(!isPrivate)}
                  className="relative w-11 h-6 rounded-full transition-colors shrink-0 ml-4"
                  style={{ backgroundColor: isPrivate ? "#7C5CFC" : "#D1D5DB" }}>
                  <div className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200"
                    style={{ transform: isPrivate ? "translateX(20px)" : "translateX(0)" }} />
                </button>
              </div>
            </div>
          </div>

          {/* Route selection */}
          <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <h2 className="font-semibold text-[#1C1C1E] mb-1">Маршрут</h2>
            <p className="text-xs text-[#71717A] mb-3">Выбери маршрут из списка или оставь пустым</p>
            <select value={routeId} onChange={(e) => setRouteId(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors bg-white">
              <option value="">— Без маршрута —</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>{r.title} ({r.distance_km} км, {r.region})</option>
              ))}
            </select>
            {selectedRoute && (
              <div className="mt-2 text-xs text-[#71717A] bg-[#F5F4F1] rounded-lg px-3 py-2">
                {selectedRoute.title} · {selectedRoute.distance_km} км · {selectedRoute.region}
              </div>
            )}
          </div>

          {/* Days */}
          <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-[#1C1C1E]">Дни поездки</h2>
                <p className="text-xs text-[#71717A] mt-0.5">{days.length} {days.length === 1 ? "день" : days.length < 5 ? "дня" : "дней"}</p>
              </div>
              <button type="button" onClick={addDay}
                className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
                style={{ color: "#F4632A", backgroundColor: "#FFF0EB" }}>
                <Plus size={14} /> Добавить день
              </button>
            </div>

            <div className="space-y-4">
              {days.map((day, idx) => (
                <div key={day.id} className="rounded-xl border border-[#E4E4E7] p-4">
                  <div className="flex items-center justify-between mb-3">
                    <input type="text" value={day.title} onChange={(e) => updateDay(day.id, "title", e.target.value)}
                      className="font-semibold text-sm text-[#1C1C1E] bg-transparent outline-none border-b border-transparent hover:border-[#E4E4E7] focus:border-[#F4632A] transition-colors pb-0.5" />
                    {days.length > 1 && (
                      <button type="button" onClick={() => removeDay(day.id)}
                        className="text-[#A1A1AA] hover:text-[#EF4444] transition-colors p-1 rounded-lg hover:bg-[#FEE2E2]">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    {[
                      { label: "Дата", field: "date" as const, type: "date", placeholder: "" },
                      { label: "Км", field: "distance_km" as const, type: "number", placeholder: "0" },
                      { label: "Старт", field: "start_point" as const, type: "text", placeholder: "Откуда" },
                      { label: "Финиш", field: "end_point" as const, type: "text", placeholder: "Куда" },
                    ].map(({ label, field, type, placeholder }) => (
                      <div key={field}>
                        <label className="text-xs text-[#71717A] mb-1 block">{label}</label>
                        <input type={type} value={day[field]} placeholder={placeholder}
                          onChange={(e) => updateDay(day.id, field, e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] text-xs outline-none focus:border-[#F4632A] transition-colors" />
                      </div>
                    ))}
                  </div>
                  <div className="mb-3">
                    <label className="text-xs text-[#71717A] mb-1 block">Покрытие</label>
                    <input type="text" value={day.surface_note} placeholder="Асфальт + грунт 30%"
                      onChange={(e) => updateDay(day.id, "surface_note", e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-[#E4E4E7] text-xs outline-none focus:border-[#F4632A] transition-colors" />
                  </div>
                  <div>
                    <label className="text-xs text-[#71717A] mb-1.5 block">Описание дня</label>
                    <DayEditor onChange={(html) => updateDay(day.id, "description", html)} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" variant="secondary" size="lg" loading={submitting} className="flex-1">
              Опубликовать мероприятие
            </Button>
            <Link href="/"><Button type="button" variant="outline" size="lg">Отмена</Button></Link>
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
