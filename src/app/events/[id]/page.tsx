"use client";

import { useState, use } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { MOCK_EVENTS } from "@/lib/data/mock";
import { Avatar, AvatarGroup } from "@/components/ui/Avatar";
import { DifficultyBadge, Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  ChevronLeft, Calendar, Bike, Mountain, Heart,
  Share2, Users, MapPin, ExternalLink, Flag, ChevronRight,
} from "lucide-react";

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const event = MOCK_EVENTS.find((e) => e.id === id);
  if (!event) notFound();

  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(event.likes);
  const [going, setGoing] = useState(false);
  const [activeDay, setActiveDay] = useState<number | null>(null);

  const totalKm = event.days.reduce((sum, d) => sum + d.distance_km, 0);
  const isMultiDay = event.days.length > 1;

  return (
    <div className="min-h-screen bg-[#F5F4F1]">
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Back */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-[#71717A] hover:text-[#1C1C1E] mb-5 transition-colors"
        >
          <ChevronLeft size={16} /> Лента
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          {/* Left: Main content */}
          <div className="space-y-5">
            {/* Hero */}
            <div
              className="rounded-2xl p-8 text-white relative overflow-hidden"
              style={{ background: "linear-gradient(135deg, #0BBFB5 0%, #7C5CFC 100%)" }}
            >
              <div className="absolute inset-0 opacity-10">
                <svg viewBox="0 0 800 250" className="w-full h-full" preserveAspectRatio="none">
                  <path d="M0,125 Q100,60 200,110 Q300,160 400,80 Q500,20 600,90 Q700,140 800,60 L800,250 L0,250 Z" fill="white"/>
                </svg>
              </div>
              <div className="relative">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  {isMultiDay && (
                    <Badge className="bg-white/20 text-white border-0">
                      🏕️ {event.days.length}-дневный велопоход
                    </Badge>
                  )}
                  <Badge className="bg-white/20 text-white border-0">
                    📍 {event.route.region}
                  </Badge>
                </div>
                <h1 className="text-3xl font-bold mb-2 leading-tight">{event.title}</h1>
                <div className="flex flex-wrap items-center gap-4 text-white/80 text-sm">
                  <span className="flex items-center gap-1.5">
                    <Calendar size={14} />
                    {event.start_date}{isMultiDay ? ` — ${event.end_date}` : ""}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Bike size={14} />
                    {totalKm} км всего
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Users size={14} />
                    {event.participants.length}{event.max_participants ? `/${event.max_participants}` : ""} участников
                  </span>
                </div>
              </div>
            </div>

            {/* Map embed */}
            {event.route.mapmagic_url && (
              <div className="bg-white rounded-2xl overflow-hidden border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
                <iframe
                  src={event.route.mapmagic_url}
                  className="mapmagic-frame"
                  style={{ height: 380, borderRadius: 0 }}
                  allowFullScreen
                  title={event.route.title}
                />
                <div className="px-4 py-2.5 border-t border-[#F5F4F1] flex items-center justify-between">
                  <span className="text-xs text-[#71717A]">Маршрут: {event.route.title}</span>
                  <a
                    href={event.route.mapmagic_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs hover:underline"
                    style={{ color: "#F4632A" }}
                  >
                    Открыть в MapMagic <ExternalLink size={11} />
                  </a>
                </div>
              </div>
            )}

            {/* Description */}
            <div className="bg-white rounded-2xl p-6 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
              <h2 className="font-semibold text-[#1C1C1E] mb-3">О поездке</h2>
              <p className="text-[#71717A] text-sm leading-relaxed">{event.description}</p>
            </div>

            {/* Day-by-day */}
            {isMultiDay && (
              <div className="space-y-3">
                <h2 className="font-semibold text-[#1C1C1E] text-lg flex items-center gap-2">
                  <Flag size={18} style={{ color: "#F4632A" }} />
                  По дням
                </h2>

                {event.days.map((day) => {
                  const isOpen = activeDay === day.day;
                  return (
                    <div
                      key={day.day}
                      className="bg-white rounded-2xl overflow-hidden border border-[#E4E4E7] transition-all"
                      style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}
                    >
                      {/* Day header — clickable */}
                      <button
                        className="w-full text-left p-5 flex items-center gap-4 hover:bg-[#FAFAF9] transition-colors"
                        onClick={() => setActiveDay(isOpen ? null : day.day)}
                      >
                        {/* Day number circle */}
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shrink-0"
                          style={{ backgroundColor: "#F4632A" }}
                        >
                          {day.day}
                        </div>

                        {/* Day info */}
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-[#1C1C1E] text-sm mb-0.5">{day.title}</div>
                          <div className="flex items-center gap-3 text-xs text-[#71717A]">
                            <span>{day.date}</span>
                            <span className="flex items-center gap-1">
                              <Bike size={11} /> {day.distance_km} км
                            </span>
                            {day.start_point && (
                              <span className="hidden sm:inline flex items-center gap-1">
                                <MapPin size={11} /> {day.start_point} → {day.end_point}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Surface tag */}
                        {day.surface_note && (
                          <Badge variant="outline" className="hidden sm:inline-flex shrink-0">{day.surface_note}</Badge>
                        )}

                        <ChevronRight
                          size={16}
                          className="shrink-0 transition-transform duration-200 text-[#A1A1AA]"
                          style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}
                        />
                      </button>

                      {/* Day content */}
                      {isOpen && (
                        <div className="px-5 pb-5 border-t border-[#F5F4F1]">
                          <div className="pt-4 prose prose-sm max-w-none text-[#71717A] leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: day.description }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Participants */}
            <div className="bg-white rounded-2xl p-6 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
              <h2 className="font-semibold text-[#1C1C1E] mb-4 flex items-center gap-2">
                <Users size={18} style={{ color: "#0BBFB5" }} />
                Участники ({event.participants.length}{event.max_participants ? `/${event.max_participants}` : ""})
              </h2>
              <div className="flex flex-wrap gap-3">
                {event.participants.map((user) => (
                  <div key={user.id} className="flex items-center gap-2">
                    <Avatar user={user} size="sm" />
                    <span className="text-sm text-[#1C1C1E]">{user.name}</span>
                  </div>
                ))}
              </div>
              {event.max_participants && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-[#71717A] mb-1">
                    <span>Мест занято</span>
                    <span>{event.participants.length}/{event.max_participants}</span>
                  </div>
                  <div className="h-2 rounded-full bg-[#F5F4F1] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${(event.participants.length / event.max_participants) * 100}%`,
                        background: "linear-gradient(90deg, #0BBFB5, #7C5CFC)",
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Sticky action card */}
          <aside>
            <div
              className="bg-white rounded-2xl p-5 border border-[#E4E4E7] sticky top-24"
              style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}
            >
              {/* Organizer */}
              <div className="flex items-center gap-3 mb-4 pb-4 border-b border-[#F5F4F1]">
                <Avatar user={event.organizer} size="md" />
                <div>
                  <div className="text-xs text-[#71717A]">Организатор</div>
                  <div className="font-medium text-[#1C1C1E]">{event.organizer.name}</div>
                </div>
              </div>

              {/* Quick stats */}
              <div className="space-y-2.5 mb-5">
                <div className="flex justify-between text-sm">
                  <span className="text-[#71717A]">Даты</span>
                  <span className="font-medium text-[#1C1C1E]">{event.start_date}{isMultiDay ? ` — ${event.end_date}` : ""}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#71717A]">Дней</span>
                  <span className="font-medium text-[#1C1C1E]">{event.days.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#71717A]">Всего км</span>
                  <span className="font-medium text-[#1C1C1E]">{totalKm} км</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#71717A]">Сложность</span>
                  <DifficultyBadge difficulty={event.route.difficulty} />
                </div>
                {event.max_participants && (
                  <div className="flex justify-between text-sm">
                    <span className="text-[#71717A]">Мест</span>
                    <span className="font-medium" style={{ color: event.participants.length >= event.max_participants ? "#EF4444" : "#22C55E" }}>
                      {event.max_participants - event.participants.length} свободно
                    </span>
                  </div>
                )}
              </div>

              {/* Participants preview */}
              <div className="mb-5">
                <AvatarGroup
                  users={event.participants}
                  max={5}
                  label={`${event.participants.length} едут`}
                />
              </div>

              {/* CTA */}
              <Button
                variant={going ? "outline" : "secondary"}
                size="lg"
                className="w-full mb-3"
                onClick={() => setGoing(!going)}
              >
                {going ? "✓ Ты едешь!" : "Я поеду →"}
              </Button>

              {/* Route link */}
              <Link
                href={`/routes/${event.route.id}`}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-[#E4E4E7] text-sm text-[#71717A] hover:bg-[#F5F4F1] transition-colors mb-3"
              >
                <Bike size={14} />
                Посмотреть маршрут
              </Link>

              {/* Like + Share */}
              <div className="flex gap-2">
                <button
                  onClick={() => { setLiked(!liked); setLikeCount(liked ? likeCount - 1 : likeCount + 1); }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-[#E4E4E7] text-sm transition-colors hover:bg-[#F5F4F1]"
                  style={{ color: liked ? "#F4632A" : "#71717A" }}
                >
                  <Heart size={14} fill={liked ? "#F4632A" : "none"} />
                  {likeCount}
                </button>
                <button className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-[#E4E4E7] text-sm text-[#71717A] hover:bg-[#F5F4F1] transition-colors">
                  <Share2 size={14} />
                  Поделиться
                </button>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
