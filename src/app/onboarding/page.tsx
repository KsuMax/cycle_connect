"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Map, Calendar, Users, Send, ArrowRight, Bike } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/context/AuthContext";
import { supabase } from "@/lib/supabase";

const CONSENT_VERSION = "2026-05-02";

const ACTIONS = [
  {
    href: "/routes",
    icon: Map,
    accent: "#F4632A",
    bg: "#FFF0EB",
    title: "Найди маршрут рядом",
    body: "Сотни проверенных треков с GPX, фильтрами и AI‑поиском по описанию.",
  },
  {
    href: "/events",
    icon: Calendar,
    accent: "#0E9F8B",
    bg: "#E6F6F3",
    title: "Запишись на ближайший выезд",
    body: "Покатушки выходного дня и многодневные туры. Регистрация в один клик.",
  },
  {
    href: "/clubs",
    icon: Users,
    accent: "#7C5CFC",
    bg: "#EFEAFE",
    title: "Вступай в клуб",
    body: "Гревел, шоссе, MTB или городские покатушки — найди свою команду.",
  },
  {
    href: "/profile/settings",
    icon: Send,
    accent: "#229ED9",
    bg: "#E5F4FB",
    title: "Подключи Telegram",
    body: "Уведомления о событиях и новых заездах прямо в мессенджер.",
  },
] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [needsConsent, setNeedsConsent] = useState(false);
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
        if (data && data.consent_given_at == null) {
          setNeedsConsent(true);
        }
      });
  }, [user]);

  const completeAndGo = async (href: string) => {
    if (!user || busy) return;

    if (needsConsent && !consent) {
      setConsentError(true);
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
            CycleConnect — место, где велосипедисты находят маршруты, собирают
            заезды и встречают единомышленников. С чего начнёшь?
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

        {/* Action cards */}
        <div className="grid gap-3 sm:grid-cols-2">
          {ACTIONS.map(({ href, icon: Icon, accent, bg, title, body }) => {
            const isBusy = busy === href;
            return (
              <button
                key={href}
                onClick={() => completeAndGo(href)}
                disabled={!!busy}
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
                        {title}
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

        {/* Skip */}
        <div className="mt-6 flex items-center justify-center">
          <Button
            variant="ghost"
            size="md"
            disabled={!!busy}
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
