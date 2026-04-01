"use client";

import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Shield, ArrowLeft, Bell, Map, Users, Calendar } from "lucide-react";

export default function ClubsPage() {
  return (
    <div className="min-h-screen bg-[#F5F4F1]">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <Link
          href="/profile"
          className="inline-flex items-center gap-1.5 text-sm text-[#71717A] hover:text-[#1C1C1E] transition-colors mb-6"
        >
          <ArrowLeft size={14} />
          Профиль
        </Link>

        {/* Hero */}
        <div
          className="bg-white rounded-2xl p-8 border border-[#E4E4E7] text-center mb-6"
          style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}
        >
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: "#E8FAF9" }}
          >
            <Shield size={28} style={{ color: "#0BBFB5" }} />
          </div>
          <h1 className="text-2xl font-bold text-[#1C1C1E] mb-2">Клубы</h1>
          <p className="text-sm text-[#71717A] max-w-sm mx-auto">
            Объединяйтесь с единомышленниками, планируйте совместные поездки и следите за новостями клуба в ленте
          </p>
        </div>

        {/* What's coming */}
        <div
          className="bg-white rounded-2xl border border-[#E4E4E7] overflow-hidden mb-6"
          style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}
        >
          <div className="px-5 py-3 border-b border-[#E4E4E7]">
            <h2 className="text-sm font-semibold text-[#1C1C1E]">Что будет в клубах</h2>
          </div>
          <div className="divide-y divide-[#E4E4E7]">
            {[
              {
                icon: <Users size={16} />,
                color: "#7C5CFC",
                bg: "#F0ECFF",
                title: "Участники клуба",
                desc: "Собирайте команду и знакомьтесь с новыми велосипедистами",
              },
              {
                icon: <Map size={16} />,
                color: "#F4632A",
                bg: "#FFF0EB",
                title: "Клубные маршруты",
                desc: "Общая коллекция маршрутов, проверенных участниками клуба",
              },
              {
                icon: <Calendar size={16} />,
                color: "#0BBFB5",
                bg: "#E8FAF9",
                title: "Совместные поездки",
                desc: "Организуйте групповые выезды и приглашайте участников",
              },
              {
                icon: <Bell size={16} />,
                color: "#F4632A",
                bg: "#FFF0EB",
                title: "Новости в ленте",
                desc: "Активность вашего клуба будет появляться в ленте",
              },
            ].map(({ icon, color, bg, title, desc }) => (
              <div key={title} className="flex items-start gap-3 px-5 py-4">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                  style={{ backgroundColor: bg, color }}
                >
                  {icon}
                </div>
                <div>
                  <div className="text-sm font-medium text-[#1C1C1E]">{title}</div>
                  <div className="text-xs text-[#71717A] mt-0.5">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div
          className="bg-gradient-to-r from-[#E8FAF9] to-[#F0ECFF] rounded-2xl p-6 border border-[#E4E4E7] text-center"
          style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}
        >
          <p className="text-sm font-semibold text-[#1C1C1E] mb-1">Клубы скоро появятся</p>
          <p className="text-xs text-[#71717A]">
            Мы работаем над этой функцией. А пока — находите велосипедистов через раздел Участники
          </p>
          <Link
            href="/users"
            className="inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl text-white mt-4"
            style={{ backgroundColor: "#7C5CFC" }}
          >
            <Users size={16} />
            Найти участников
          </Link>
        </div>
      </main>
    </div>
  );
}
