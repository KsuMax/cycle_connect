"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search,
  Wind,
  Send,
  Users,
  Map,
  Flag,
  Calendar,
  Bell,
  ArrowRight,
  Bike,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/context/AuthContext";
import { supabase } from "@/lib/supabase";

const CONSENT_VERSION = "2026-05-02";

type Card = {
  href: string;
  icon: typeof Search;
  accent: string;
  bg: string;
  title: string;
  body: string;
};

const RIDER_CARDS: readonly Card[] = [
  {
    href: "/routes",
    icon: Search,
    accent: "#F4632A",
    bg: "#FFF0EB",
    title: "AI-поиск по описанию",
    body: "Напиши «маршрут по гравийке до 60 км недалеко от меня» или «равнинный маршрут на пару часов» — подберём подходящие треки из базы.",
  },
  {
    href: "/routes",
    icon: Wind,
    accent: "#0E9F8B",
    bg: "#E6F6F3",
    title: "Маршруты с попутным ветром",
    body: "Выбираешь день — показываем маршруты, где ветер будет дуть в спину или где лучше поехать в обратную сторону. Прогноз пересчитывается автоматически, не надо самому вертеть карту по компасу.",
  },
  {
    href: "/profile/settings",
    icon: Send,
    accent: "#229ED9",
    bg: "#E5F4FB",
    title: "Telegram-бот и уведомления",
    body: "Привяжи Telegram в настройках профиля — сможешь искать маршруты прямо в боте и получать уведомления, когда меняется маршрут или событие, на которое ты записан.",
  },
  {
    href: "/clubs",
    icon: Users,
    accent: "#7C5CFC",
    bg: "#EFEAFE",
    title: "Клубы и события",
    body: "Подпишись на клуб или запишись на ближайшую покатушку — будешь в курсе всех выездов команды.",
  },
] as const;

const ORGANIZER_CARDS: readonly Card[] = [
  {
    href: "/routes/new",
    icon: Map,
    accent: "#F4632A",
    bg: "#FFF0EB",
    title: "Маршруты из любого планировщика",
    body: "Komoot, Strava, RideWithGPS, MapMagic, Bikemap — добавляй маршрут одной ссылкой. Длину, набор и профиль подтянем сами. Свой планировщик строить не нужно — пользуйся тем, к которому привык.",
  },
  {
    href: "/clubs/new",
    icon: Flag,
    accent: "#7C5CFC",
    bg: "#EFEAFE",
    title: "Клубы",
    body: "Собирай команду в одном месте: участники, расписание выездов, лента обсуждений. Видна всем или только своим — решаешь ты.",
  },
  {
    href: "/events/new",
    icon: Calendar,
    accent: "#0E9F8B",
    bg: "#E6F6F3",
    title: "Заезды — открытые или по ссылке",
    body: "Открытая покатушка попадает в общую ленту и видна всем. Закрытая — доступна только по приватной ссылке-приглашению, удобно для своих и для коммерческих туров.",
  },
  {
    href: "/profile/settings",
    icon: Bell,
    accent: "#229ED9",
    bg: "#E5F4FB",
    title: "Связь с участниками",
    body: "Записавшимся автоматом летят напоминания и уведомления об изменениях — в приложение и в Telegram, если они его привязали.",
  },
] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [needsConsent, setNeedsConsent] = useState<boolean | null>(null);
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("consent_given_at")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setNeedsConsent(data ? data.consent_given_at == null : false);
      });
  }, [user]);

  const completeAndGo = async (href: string) => {
    if (!user || busy || needsConsent === null) return;

    if (needsConsent && !consent) {
      setConsentError(true);
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }

    setBusy(href);
    setConsentError(false);

    const updates: Record<string, string> = {
      onboarded_at: new Date().toISOString(),
    };
    if (needsConsent) {
      updates.consent_given_at = new Date().toISOString();
      updates.consent_version = CONSENT_VERSION;
    }

    await supabase.from("profiles").update(updates).eq("id", user.id);
    router.push(href);
    router.refresh();
  };

  if (!loading && !user) {
    if (typeof window !== "undefined") router.replace("/auth/login");
    return null;
  }

  return (
    <div className="min-h-screen bg-[#F5F4F1] px-4 py-10">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 mb-5"
            onClick={(e) => {
              e.preventDefault();
              completeAndGo("/");
            }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: "#F4632A" }}
            >
              <Bike size={22} color="white" strokeWidth={2.5} />
            </div>
            <span className="text-xl font-bold">
              <span style={{ color: "#1C1C1E" }}>Cycle</span>
              <span style={{ color: "#F4632A" }}>Connect</span>
            </span>
          </Link>
          <h1 className="text-2xl font-extrabold text-[#1C1C1E]">
            Добро пожаловать!
          </h1>
          <p className="mt-2 text-sm text-[#71717A] leading-relaxed max-w-md mx-auto">
            Что тебя сюда привело? CycleConnect полезен и тем, кто катается, и
            тем, кто водит группы. Ниже — что ты получишь в каждой роли.
          </p>
        </div>

        {/* Consent block — shown only for OAuth users who skipped the form */}
        {needsConsent && (
          <div
            className={`mb-6 rounded-2xl border p-5 bg-white ${
              consentError ? "border-red-400" : "border-[#E4E4E7]"
            }`}
            style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.04)" }}
          >
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => {
                  setConsent(e.target.checked);
                  if (e.target.checked) setConsentError(false);
                }}
                className="mt-0.5 w-4 h-4 rounded border-[#E4E4E7] accent-[#F4632A] cursor-pointer shrink-0"
              />
              <span className="text-sm text-[#3F3F46] leading-relaxed">
                Я даю{" "}
                <Link
                  href="/legal/consent"
                  target="_blank"
                  className="font-medium hover:underline"
                  style={{ color: "#F4632A" }}
                >
                  согласие на обработку персональных данных
                </Link>{" "}
                и принимаю{" "}
                <Link
                  href="/legal/terms"
                  target="_blank"
                  className="font-medium hover:underline"
                  style={{ color: "#F4632A" }}
                >
                  Пользовательское соглашение
                </Link>
              </span>
            </label>
            {consentError && (
              <p className="mt-2 text-xs text-red-600">
                Пожалуйста, подтвердите согласие на обработку персональных данных, чтобы продолжить
              </p>
            )}
          </div>
        )}

        {/* Section: Riders */}
        <RoleSection
          title="Я катаюсь и ищу маршруты"
          subtitle="Чтобы каждый выезд был новым и в кайф"
          cards={RIDER_CARDS}
          busy={busy}
          disabled={needsConsent === null}
          onPick={completeAndGo}
        />

        {/* Section: Organizers */}
        <div className="mt-8">
          <RoleSection
            title="Я вожу группы или веду клуб"
            subtitle="Здесь вся инфраструктура для покатушек — без самописных таблиц и чатов"
            cards={ORGANIZER_CARDS}
            busy={busy}
            disabled={needsConsent === null}
            onPick={completeAndGo}
          />
        </div>

        <p className="mt-8 text-center text-xs text-[#71717A]">
          Роли не взаимоисключающие — катайся сам и води группы из одного аккаунта.
        </p>

        {/* Skip */}
        <div className="mt-4 flex items-center justify-center">
          <Button
            variant="ghost"
            size="md"
            disabled={!!busy || needsConsent === null}
            onClick={() => completeAndGo("/")}
          >
            Пропустить — я разберусь сам
          </Button>
        </div>

        <p className="mt-6 text-center text-xs text-[#A1A1AA]">
          Этот экран всегда можно открыть снова через значок «?» в шапке.
        </p>
      </div>
    </div>
  );
}

function RoleSection({
  title,
  subtitle,
  cards,
  busy,
  disabled,
  onPick,
}: {
  title: string;
  subtitle: string;
  cards: readonly Card[];
  busy: string | null;
  disabled: boolean;
  onPick: (href: string) => void;
}) {
  return (
    <section>
      <div className="mb-4 px-1">
        <h2 className="text-lg font-bold text-[#1C1C1E]">{title}</h2>
        <p className="mt-1 text-sm text-[#71717A] leading-relaxed">{subtitle}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map(({ href, icon: Icon, accent, bg, title: cardTitle, body }, i) => {
          const key = `${href}-${i}`;
          const isBusy = busy === href;
          return (
            <button
              key={key}
              onClick={() => onPick(href)}
              disabled={!!busy || disabled}
              className="group text-left rounded-2xl border border-[#E4E4E7] bg-white p-5 hover:border-[#F4632A] hover:shadow-sm transition-all disabled:opacity-60"
              style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.04)" }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: bg }}
                >
                  <Icon size={20} style={{ color: accent }} strokeWidth={2.2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-[#1C1C1E]">
                      {cardTitle}
                    </h3>
                    <ArrowRight
                      size={14}
                      className={`text-[#A1A1AA] shrink-0 transition-transform ${
                        isBusy ? "translate-x-0.5" : "group-hover:translate-x-0.5"
                      }`}
                    />
                  </div>
                  <p className="mt-1 text-xs text-[#71717A] leading-relaxed">
                    {body}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
