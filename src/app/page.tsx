import { Header } from "@/components/layout/Header";
import { RouteCard } from "@/components/routes/RouteCard";
import { EventCard } from "@/components/events/EventCard";
import { MOCK_ROUTES, MOCK_EVENTS, MOCK_USERS } from "@/lib/data/mock";
import { Avatar } from "@/components/ui/Avatar";
import { Bike, TrendingUp, Calendar } from "lucide-react";
import Link from "next/link";

export default function FeedPage() {
  return (
    <div className="min-h-screen bg-[#F5F4F1]">
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">

          {/* Feed */}
          <div className="space-y-6">
            {/* Welcome banner */}
            <div
              className="rounded-2xl p-6 text-white relative overflow-hidden"
              style={{ background: "linear-gradient(135deg, #F4632A 0%, #7C5CFC 100%)" }}
            >
              <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-10">
                <Bike size={120} strokeWidth={1} />
              </div>
              <div className="relative">
                <h1 className="text-2xl font-bold mb-1">Привет, велосипедист 👋</h1>
                <p className="text-white/80 text-sm mb-4">Куда едем сегодня? В ленте — новые маршруты и поездки</p>
                <Link
                  href="/routes"
                  className="inline-flex items-center gap-2 bg-white font-semibold text-sm px-4 py-2 rounded-xl hover:bg-white/90 transition-colors"
                  style={{ color: "#F4632A" }}
                >
                  <Bike size={16} />
                  Найти маршрут
                </Link>
              </div>
            </div>

            {/* Section: Upcoming events */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-[#1C1C1E] flex items-center gap-2">
                  <Calendar size={18} style={{ color: "#7C5CFC" }} />
                  Ближайшие поездки
                </h2>
                <Link href="/events" className="text-sm hover:underline" style={{ color: "#F4632A" }}>Все</Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
                {MOCK_EVENTS.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            </section>

            {/* Section: Popular routes */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-[#1C1C1E] flex items-center gap-2">
                  <TrendingUp size={18} style={{ color: "#F4632A" }} />
                  Популярные маршруты
                </h2>
                <Link href="/routes" className="text-sm hover:underline" style={{ color: "#F4632A" }}>Все маршруты</Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {MOCK_ROUTES.slice(0, 4).map((route) => (
                  <RouteCard key={route.id} route={route} />
                ))}
              </div>
            </section>
          </div>

          {/* Sidebar */}
          <aside className="space-y-5">
            {/* Едут сейчас */}
            <div className="bg-white rounded-2xl p-4 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
              <h3 className="font-semibold text-[#1C1C1E] text-sm mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse" />
                Едут сейчас
              </h3>
              <div className="space-y-3">
                {MOCK_USERS.slice(0, 4).map((user) => (
                  <div key={user.id} className="flex items-center gap-3">
                    <div className="relative">
                      <Avatar user={user} size="sm" />
                      <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#22C55E] border-2 border-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[#1C1C1E] truncate">{user.name}</div>
                      <div className="text-xs text-[#71717A]">Карельская тишина</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Статистика */}
            <div className="bg-white rounded-2xl p-4 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
              <h3 className="font-semibold text-[#1C1C1E] text-sm mb-3">Сообщество сегодня</h3>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-xl font-bold" style={{ color: "#F4632A" }}>24</div>
                  <div className="text-xs text-[#71717A]">в пути</div>
                </div>
                <div>
                  <div className="text-xl font-bold" style={{ color: "#7C5CFC" }}>8</div>
                  <div className="text-xs text-[#71717A]">маршрутов</div>
                </div>
                <div>
                  <div className="text-xl font-bold" style={{ color: "#0BBFB5" }}>1 240</div>
                  <div className="text-xs text-[#71717A]">км сегодня</div>
                </div>
              </div>
            </div>

            {/* Создать мероприятие CTA */}
            <div
              className="rounded-2xl p-4 text-white"
              style={{ background: "linear-gradient(135deg, #0BBFB5 0%, #7C5CFC 100%)" }}
            >
              <h3 className="font-semibold mb-1 text-sm">Планируешь поездку?</h3>
              <p className="text-white/80 text-xs mb-3">Создай мероприятие, опиши маршрут по дням и позови друзей</p>
              <Link
                href="/events/new"
                className="block text-center bg-white font-semibold text-sm px-4 py-2 rounded-xl hover:bg-white/90 transition-colors"
                style={{ color: "#7C5CFC" }}
              >
                Создать мероприятие
              </Link>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
