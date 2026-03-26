"use client";

import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { MOCK_USERS, MOCK_ROUTES, MOCK_EVENTS } from "@/lib/data/mock";
import { RouteCard } from "@/components/routes/RouteCard";
import { EventCard } from "@/components/events/EventCard";
import { Avatar } from "@/components/ui/Avatar";
import { useFavorites } from "@/lib/context/FavoritesContext";
import { Bike, Map, Calendar, Settings, Bookmark } from "lucide-react";

// MVP: текущий пользователь
const ME = MOCK_USERS[0];

type Tab = "routes" | "favorites" | "events";

export default function ProfilePage() {
  const [activeTab, setActiveTab] = useState<Tab>("routes");
  const { favorites } = useFavorites();

  const myRoutes = MOCK_ROUTES.filter((r) => r.author.id === ME.id);
  const myEvents = MOCK_EVENTS.filter(
    (e) => e.organizer.id === ME.id || e.participants.some((p) => p.id === ME.id)
  );
  const favoriteRoutes = MOCK_ROUTES.filter((r) => favorites.has(r.id));

  const TABS: { id: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { id: "routes",    label: "Мои маршруты", icon: <Map size={15} />,      count: myRoutes.length },
    { id: "favorites", label: "Избранное",    icon: <Bookmark size={15} />, count: favoriteRoutes.length },
    { id: "events",    label: "Поездки",      icon: <Calendar size={15} />, count: myEvents.length },
  ];

  return (
    <div className="min-h-screen bg-[#F5F4F1]">
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Profile header */}
        <div
          className="bg-white rounded-2xl p-6 border border-[#E4E4E7] mb-6"
          style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}
        >
          <div className="flex items-start gap-5">
            <Avatar user={ME} size="lg" />
            <div className="flex-1">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-xl font-bold text-[#1C1C1E]">{ME.name}</h1>
                  {ME.bio && <p className="text-sm text-[#71717A] mt-0.5">{ME.bio}</p>}
                </div>
                <button className="flex items-center gap-1.5 text-sm text-[#71717A] hover:text-[#1C1C1E] transition-colors p-2 rounded-lg hover:bg-[#F5F4F1]">
                  <Settings size={16} />
                  <span className="hidden sm:inline">Настройки</span>
                </button>
              </div>

              {/* Stats */}
              <div className="flex gap-6 mt-4">
                <div className="text-center">
                  <div className="text-xl font-bold" style={{ color: "#F4632A" }}>
                    {ME.km_total.toLocaleString()}
                  </div>
                  <div className="text-xs text-[#71717A]">км всего</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold" style={{ color: "#7C5CFC" }}>
                    {ME.routes_count}
                  </div>
                  <div className="text-xs text-[#71717A]">маршрутов</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold" style={{ color: "#0BBFB5" }}>
                    {ME.events_count}
                  </div>
                  <div className="text-xs text-[#71717A]">поездок</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white rounded-2xl p-1.5 border border-[#E4E4E7] mb-6" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-medium transition-all"
              style={activeTab === tab.id
                ? { backgroundColor: "#1C1C1E", color: "white" }
                : { color: "#71717A" }
              }
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
              {tab.count > 0 && (
                <span
                  className="text-[11px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center"
                  style={activeTab === tab.id
                    ? { backgroundColor: "rgba(255,255,255,0.2)", color: "white" }
                    : { backgroundColor: "#F5F4F1", color: "#71717A" }
                  }
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "routes" && (
          <section>
            {myRoutes.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {myRoutes.map((route) => (
                  <RouteCard key={route.id} route={route} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Map size={40} />}
                title="Нет маршрутов"
                text="Добавь первый маршрут, нажав + в меню"
              />
            )}
          </section>
        )}

        {activeTab === "favorites" && (
          <section>
            {favoriteRoutes.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {favoriteRoutes.map((route) => (
                  <RouteCard key={route.id} route={route} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Bookmark size={40} />}
                title="Нет избранных маршрутов"
                text='Нажми "Сохранить" на странице маршрута, чтобы добавить его сюда'
              />
            )}
          </section>
        )}

        {activeTab === "events" && (
          <section>
            {myEvents.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {myEvents.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Calendar size={40} />}
                title="Нет поездок"
                text="Присоединись к мероприятию или создай своё"
              />
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function EmptyState({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="text-center py-16 text-[#71717A]">
      <div className="flex justify-center mb-3 opacity-25">
        <Bike size={40} />
      </div>
      <div className="font-medium mb-1 text-[#1C1C1E]">{title}</div>
      <div className="text-sm max-w-xs mx-auto">{text}</div>
    </div>
  );
}
