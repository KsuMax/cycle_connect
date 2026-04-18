"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bike,
  Eye,
  EyeOff,
  CheckCircle,
  Bot,
  Bell,
  MapPin,
  Users,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { supabase } from "@/lib/supabase";

export default function RegisterPage() {
  const router = useRouter();

  // Required fields
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);

  // Optional fields
  const [telegramUsername, setTelegramUsername] = useState("");
  const [stravaUrl, setStravaUrl] = useState("");
  const [showOptional, setShowOptional] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const usernameClean = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (!usernameClean) {
      setError("Никнейм может содержать только латинские буквы, цифры и _");
      setLoading(false);
      return;
    }

    // Validate optional telegram username
    const tgClean = telegramUsername.trim().replace(/^@/, "");
    if (tgClean && !/^[A-Za-z0-9_]{5,32}$/.test(tgClean)) {
      setError("Никнейм Telegram: от 5 до 32 символов, только буквы, цифры и _");
      setLoading(false);
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError) {
      setError(
        signUpError.message === "User already registered"
          ? "Этот email уже зарегистрирован"
          : signUpError.message
      );
      setLoading(false);
      return;
    }

    if (data.user) {
      await supabase.from("profiles").insert({
        id: data.user.id,
        name: name.trim(),
        username: usernameClean,
        bio: null,
        km_total: 0,
        routes_count: 0,
        events_count: 0,
        telegram_username: tgClean || null,
        strava_url: stravaUrl.trim() || null,
      });

      if (data.session) {
        router.push("/");
        router.refresh();
        return;
      }
    }

    setSuccess(true);
    setLoading(false);
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[#F5F4F1] flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div
            className="bg-white rounded-2xl p-8 border border-[#E4E4E7]"
            style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}
          >
            <CheckCircle size={48} className="mx-auto mb-4" style={{ color: "#22C55E" }} />
            <h2 className="text-lg font-bold text-[#1C1C1E] mb-2">Аккаунт создан!</h2>
            <p className="text-sm text-[#71717A] mb-6">
              Мы отправили письмо с подтверждением на <strong>{email}</strong>. Перейди по
              ссылке в письме, затем войди.
            </p>
            <Link href="/auth/login">
              <Button variant="secondary" size="lg" className="w-full">
                Войти
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F4F1] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-4">
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
          <h1 className="text-xl font-bold text-[#1C1C1E]">Создай аккаунт</h1>
          <p className="text-sm text-[#71717A] mt-1">Присоединяйся к велосипедному сообществу</p>
        </div>

        <div
          className="bg-white rounded-2xl p-6 border border-[#E4E4E7]"
          style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            {/* ── Required section label ── */}
            <p className="text-xs font-semibold text-[#A1A1AA] uppercase tracking-wide">
              Обязательные поля
            </p>

            {/* Name */}
            <div>
              <label className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-1.5 flex items-center gap-1">
                Имя <span style={{ color: "#F4632A" }}>*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Как тебя зовут?"
                className="w-full px-4 py-2.5 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors"
              />
            </div>

            {/* Username */}
            <div>
              <label className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-1.5 flex items-center gap-1">
                Никнейм <span style={{ color: "#F4632A" }}>*</span>
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[#A1A1AA]">
                  @
                </span>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="username"
                  className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors"
                />
              </div>
              <p className="text-xs text-[#A1A1AA] mt-1">Только латиница, цифры и _</p>
            </div>

            {/* Email */}
            <div>
              <label className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-1.5 flex items-center gap-1">
                Email <span style={{ color: "#F4632A" }}>*</span>
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-2.5 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors"
              />
            </div>

            {/* Password */}
            <div>
              <label className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-1.5 flex items-center gap-1">
                Пароль <span style={{ color: "#F4632A" }}>*</span>
              </label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Минимум 6 символов"
                  className="w-full px-4 py-2.5 pr-10 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A1A1AA] hover:text-[#71717A]"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* ── Divider ── */}
            <div className="border-t border-[#E4E4E7]" />

            {/* ── Telegram Bot promo card ── */}
            <div className="rounded-xl border border-[#E4E4E7] bg-[#FAFAF9] p-4">
              <div className="flex items-start gap-3">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: "#F4632A1A" }}
                >
                  <Bot size={18} style={{ color: "#F4632A" }} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#1C1C1E]">
                    Привяжи Telegram‑бота
                  </p>
                  <p className="text-xs text-[#71717A] mt-0.5 leading-relaxed">
                    Бот отправляет уведомления прямо в Telegram — не пропустишь ни одного события.
                  </p>
                  <ul className="mt-2 space-y-1">
                    {[
                      { icon: Bell, text: "Напоминания о заездах и событиях" },
                      { icon: Users, text: "Новые участники на твоих маршрутах" },
                      { icon: MapPin, text: "Изменения в маршрутах, которые ты отслеживаешь" },
                    ].map(({ icon: Icon, text }) => (
                      <li key={text} className="flex items-center gap-1.5 text-xs text-[#71717A]">
                        <Icon size={12} style={{ color: "#F4632A" }} className="shrink-0" />
                        {text}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-[#A1A1AA] mt-2">
                    Привязку можно завершить в настройках профиля после регистрации.
                  </p>
                </div>
              </div>
            </div>

            {/* ── Optional section toggle ── */}
            <button
              type="button"
              onClick={() => setShowOptional((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-[#E4E4E7] text-sm text-[#71717A] hover:border-[#F4632A] hover:text-[#F4632A] transition-colors"
            >
              <span className="font-medium">Дополнительные поля (необязательно)</span>
              {showOptional ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {showOptional && (
              <div className="space-y-4">
                {/* Telegram username */}
                <div>
                  <label className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-1.5 block">
                    Telegram
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[#A1A1AA]">
                      @
                    </span>
                    <input
                      type="text"
                      value={telegramUsername}
                      onChange={(e) => setTelegramUsername(e.target.value)}
                      placeholder="telegram_username"
                      className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors"
                    />
                  </div>
                  <p className="text-xs text-[#A1A1AA] mt-1">
                    Нужен для привязки бота и отображения в профиле
                  </p>
                </div>

                {/* Strava URL */}
                <div>
                  <label className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="#FC4C02">
                      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
                    </svg>
                    Strava
                  </label>
                  <input
                    type="url"
                    value={stravaUrl}
                    onChange={(e) => setStravaUrl(e.target.value)}
                    placeholder="https://www.strava.com/athletes/..."
                    className="w-full px-4 py-2.5 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors"
                  />
                  <p className="text-xs text-[#A1A1AA] mt-1">
                    Ссылка на твой профиль в Strava — отображается в профиле
                  </p>
                </div>
              </div>
            )}

            <Button type="submit" variant="secondary" size="lg" loading={loading} className="w-full">
              Зарегистрироваться
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-[#71717A] mt-4">
          Уже есть аккаунт?{" "}
          <Link
            href="/auth/login"
            className="font-medium hover:underline"
            style={{ color: "#F4632A" }}
          >
            Войти
          </Link>
        </p>
      </div>
    </div>
  );
}
