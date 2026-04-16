"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { useAuth } from "@/lib/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, Eye, EyeOff, Check, X, LogOut, Send } from "lucide-react";
import Link from "next/link";

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  if (!password) return { score: 0, label: "", color: "" };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 2) return { score, label: "Слабый", color: "#EF4444" };
  if (score <= 4) return { score, label: "Средний", color: "#F59E0B" };
  return { score, label: "Надёжный", color: "#10B981" };
}

const PASSWORD_REQUIREMENTS = [
  { test: (p: string) => p.length >= 8, label: "Не менее 8 символов" },
  { test: (p: string) => /[A-Z]/.test(p), label: "Заглавная буква" },
  { test: (p: string) => /[a-z]/.test(p), label: "Строчная буква" },
  { test: (p: string) => /[0-9]/.test(p), label: "Цифра" },
  { test: (p: string) => /[^A-Za-z0-9]/.test(p), label: "Спецсимвол" },
];

const INPUT_CLS = "w-full px-3 py-2.5 rounded-xl border border-[#E4E4E7] bg-white text-sm text-[#1C1C1E] placeholder-[#A1A1AA] outline-none focus:border-[#F4632A] transition-colors";

export default function SettingsPage() {
  const { user, profile, loading: authLoading, refreshProfile, signOut } = useAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [website, setWebsite] = useState("");
  const [telegramUsername, setTelegramUsername] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [emailPublic, setEmailPublic] = useState(false);
  const [tgLinked, setTgLinked] = useState(false);
  const [tgNotifyIntents, setTgNotifyIntents] = useState(true);
  const [tgLinking, setTgLinking] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push("/auth/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (profile) {
      setName(profile.name ?? "");
      setUsername(profile.username ?? "");
      setWebsite(profile.website ?? "");
      setTelegramUsername(profile.telegram_username ?? "");
      setContactEmail(profile.contact_email ?? "");
      setEmailPublic(profile.email_public ?? false);
      setTgLinked(!!profile.telegram_chat_id);
      setTgNotifyIntents(profile.tg_notify_intents !== false);
    }
    if (user) setEmail(user.email ?? "");
  }, [profile, user]);

  const handleLinkTelegram = async () => {
    setError(null);
    setTgLinking(true);

    // Open a blank window SYNCHRONOUSLY (before any await) so the browser
    // doesn't treat it as a popup and block it. We'll set the URL after fetch.
    const win = window.open("", "_blank");

    try {
      const res = await fetch("/api/tg-link", { method: "POST" });
      const { code, botUsername, error: err } = await res.json();

      if (err || !code || !botUsername) {
        win?.close();
        setError(err ?? "Не удалось сгенерировать ссылку. Убедись, что NEXT_PUBLIC_TELEGRAM_BOT_USERNAME задан в переменных окружения.");
        return;
      }

      const url = `https://t.me/${botUsername}?start=${code}`;
      if (win) {
        win.location.href = url;
      } else {
        // Fallback: link if window was blocked anyway
        setError(`Браузер заблокировал всплывающее окно. Открой вручную: ${url}`);
      }

      // Poll profile every 2 s up to 30 s to detect chat_id being set by bot
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        await refreshProfile();
        if (attempts >= 15) clearInterval(poll);
      }, 2000);
      void poll;
    } catch {
      win?.close();
      setError("Не удалось открыть Telegram");
    } finally {
      setTgLinking(false);
    }
  };

  const strength = getPasswordStrength(password);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setSuccess(false);

    if (password && password !== confirmPassword) {
      setError("Пароли не совпадают");
      return;
    }
    if (password && password.length < 8) {
      setError("Пароль должен быть не менее 8 символов");
      return;
    }

    setSaving(true);

    // Validate TG username format before sending (mirror DB constraint).
    const tgTrimmed = telegramUsername.trim().replace(/^@/, "");
    if (tgTrimmed && !/^[A-Za-z0-9_]{5,32}$/.test(tgTrimmed)) {
      setError("Telegram-никнейм: 5–32 латинских буквы, цифры или _");
      return;
    }
    const contactEmailTrimmed = contactEmail.trim();
    if (contactEmailTrimmed && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmailTrimmed)) {
      setError("Контактный e-mail: проверь формат");
      return;
    }

    // Update profile table
    const profileUpdate: Record<string, string | boolean | null> = {
      name: name.trim(),
      username: username.trim() || null,
      website: website.trim() || null,
      telegram_username: tgTrimmed || null,
      contact_email: contactEmailTrimmed || null,
      email_public: emailPublic && !!contactEmailTrimmed,
      tg_notify_intents: tgNotifyIntents,
    };
    const { error: profileError } = await supabase
      .from("profiles")
      .update(profileUpdate)
      .eq("id", user.id);

    if (profileError) {
      setError(profileError.message);
      setSaving(false);
      return;
    }

    // Update auth email if changed
    if (email.trim() !== user.email) {
      const { error: emailError } = await supabase.auth.updateUser({ email: email.trim() });
      if (emailError) {
        setError(emailError.message);
        setSaving(false);
        return;
      }
    }

    // Update password if provided
    if (password) {
      const { error: pwError } = await supabase.auth.updateUser({ password });
      if (pwError) {
        setError(pwError.message);
        setSaving(false);
        return;
      }
    }

    await refreshProfile();
    setPassword("");
    setConfirmPassword("");
    setSaving(false);
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F5F4F1]">
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-8">
          <div className="h-96 bg-white rounded-2xl animate-pulse border border-[#E4E4E7]" />
        </main>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#F5F4F1]">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/profile"
            className="p-2 rounded-xl hover:bg-white border border-transparent hover:border-[#E4E4E7] transition-all text-[#71717A] hover:text-[#1C1C1E]">
            <ArrowLeft size={18} />
          </Link>
          <h1 className="text-xl font-bold text-[#1C1C1E]">Настройки профиля</h1>
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          {/* Personal info */}
          <Section title="Личные данные">
            <Field label="Имя" htmlFor="name">
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ваше имя"
                className={INPUT_CLS}
                required
              />
            </Field>
            <Field label="Никнейм" htmlFor="username">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1A1AA] text-sm">@</span>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/\s/g, "").toLowerCase())}
                  placeholder="nickname"
                  className={`${INPUT_CLS} pl-7`}
                />
              </div>
            </Field>
          </Section>

          {/* Contacts */}
          <Section title="Контакты">
            <p className="text-xs text-[#71717A] -mt-2">
              Чтобы с тобой могли связаться участники совместных катаний.
            </p>
            <Field label="Telegram" htmlFor="tg">
              <div className="relative">
                <Send size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1A1AA]" />
                <span className="absolute left-9 top-1/2 -translate-y-1/2 text-[#A1A1AA] text-sm">@</span>
                <input
                  id="tg"
                  type="text"
                  value={telegramUsername}
                  onChange={(e) => setTelegramUsername(e.target.value.replace(/^@/, "").replace(/\s/g, ""))}
                  placeholder="ksumax"
                  className={`${INPUT_CLS} pl-14`}
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              </div>
              <p className="text-[11px] text-[#A1A1AA] mt-1">Кнопка «Написать» откроет чат в Telegram</p>
            </Field>
            <Field label="Контактный e-mail" htmlFor="contact-email">
              <input
                id="contact-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="rider@example.com"
                className={INPUT_CLS}
                autoCapitalize="none"
                autoCorrect="off"
              />
              <label className="mt-2 flex items-center gap-2 text-xs text-[#71717A] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={emailPublic}
                  onChange={(e) => setEmailPublic(e.target.checked)}
                  className="w-4 h-4 rounded border-[#E4E4E7] accent-[#F4632A]"
                  disabled={!contactEmail.trim()}
                />
                Показывать другим участникам
              </label>
            </Field>
          </Section>

          {/* TG Bot */}
          <Section title="Telegram-уведомления">
            <p className="text-xs text-[#71717A] -mt-2">
              Привяжи аккаунт, чтобы получать уведомления о совместных покатушках.
            </p>
            {tgLinked ? (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#F0FDF4] border border-[#BBF7D0]">
                <Check size={14} className="text-green-600 shrink-0" />
                <span className="text-sm text-green-700 font-medium">Telegram привязан</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleLinkTelegram}
                disabled={tgLinking}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60"
                style={{ backgroundColor: "#E6F4FB", color: "#0088CC" }}
              >
                <Send size={15} />
                {tgLinking ? "Открываю бот…" : "Привязать Telegram"}
              </button>
            )}
            {tgLinked && (
              <label className="flex items-center gap-2 text-xs text-[#71717A] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={tgNotifyIntents}
                  onChange={(e) => setTgNotifyIntents(e.target.checked)}
                  className="w-4 h-4 rounded border-[#E4E4E7] accent-[#F4632A]"
                />
                Уведомлять о совместных катаниях (ride intents)
              </label>
            )}
          </Section>

          {/* Account */}
          <Section title="Учётная запись">
            <Field label="Почта" htmlFor="email">
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                className={INPUT_CLS}
                required
              />
              {email !== (user.email ?? "") && (
                <p className="text-xs text-[#F59E0B] mt-1">
                  После изменения придёт письмо для подтверждения
                </p>
              )}
            </Field>
          </Section>

          {/* Password */}
          <Section title="Пароль">
            <Field label="Новый пароль" htmlFor="password">
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Оставьте пустым, чтобы не менять"
                  className={`${INPUT_CLS} pr-10`}
                />
                <button type="button" onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A1A1AA] hover:text-[#71717A]">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {password && (
                <div className="mt-2 space-y-2">
                  {/* Strength bar */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-[#E4E4E7] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(100, (strength.score / 6) * 100)}%`,
                          backgroundColor: strength.color,
                        }}
                      />
                    </div>
                    <span className="text-xs font-medium" style={{ color: strength.color }}>
                      {strength.label}
                    </span>
                  </div>
                  {/* Requirements */}
                  <div className="grid grid-cols-2 gap-1">
                    {PASSWORD_REQUIREMENTS.map((req) => {
                      const ok = req.test(password);
                      return (
                        <div key={req.label} className="flex items-center gap-1.5 text-xs"
                          style={{ color: ok ? "#10B981" : "#A1A1AA" }}>
                          {ok ? <Check size={11} /> : <X size={11} />}
                          {req.label}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Field>
            {password && (
              <Field label="Подтверждение пароля" htmlFor="confirm">
                <div className="relative">
                  <input
                    id="confirm"
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Повторите пароль"
                    className={`${INPUT_CLS} pr-10`}
                    style={confirmPassword && confirmPassword !== password
                      ? { borderColor: "#EF4444" }
                      : confirmPassword && confirmPassword === password
                      ? { borderColor: "#10B981" }
                      : {}}
                  />
                  <button type="button" onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A1A1AA] hover:text-[#71717A]">
                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </Field>
            )}
          </Section>

          {/* Links */}
          <Section title="Ссылки">
            <Field label="Сайт" htmlFor="website">
              <input
                id="website"
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://example.com"
                className={INPUT_CLS}
              />
            </Field>
          </Section>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
              <Check size={15} />
              Настройки сохранены
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 rounded-xl text-white text-sm font-semibold transition-opacity disabled:opacity-60"
            style={{ backgroundColor: "#F4632A" }}>
            {saving ? "Сохранение…" : "Сохранить изменения"}
          </button>
        </form>

        <div className="mt-4 mb-24 sm:mb-8">
          <button
            type="button"
            onClick={async () => { await signOut(); router.push("/"); router.refresh(); }}
            className="w-full py-3 rounded-xl border border-[#E4E4E7] bg-white text-sm font-semibold text-[#EF4444] flex items-center justify-center gap-2 hover:bg-red-50 hover:border-red-200 transition-colors">
            <LogOut size={16} />
            Выйти из аккаунта
          </button>
        </div>
      </main>

    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-[#E4E4E7] space-y-4"
      style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
      <h2 className="text-sm font-semibold text-[#1C1C1E]">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-[#71717A] mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
