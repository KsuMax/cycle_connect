"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { useAuth } from "@/lib/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, Eye, EyeOff, Check, X, LogOut, Activity } from "lucide-react";
import Link from "next/link";
import { ConnectStravaButton } from "@/components/strava/ConnectStravaButton";
import { StravaLogo } from "@/components/strava/StravaLogo";

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
  const [stravaUrl, setStravaUrl] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Strava integration state — driven entirely from the profile row.
  // Local optimistic mirror so the toggle reacts instantly.
  const [stravaShowActivities, setStravaShowActivities] = useState(true);
  const [savingStravaToggle, setSavingStravaToggle] = useState(false);
  const [disconnectingStrava, setDisconnectingStrava] = useState(false);
  const [stravaError, setStravaError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/auth/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (profile) {
      setName(profile.name ?? "");
      setUsername(profile.username ?? "");
      setWebsite(profile.website ?? "");
      setStravaUrl(profile.strava_url ?? "");
      setStravaShowActivities(profile.strava_show_activities ?? true);
    }
    if (user) setEmail(user.email ?? "");
  }, [profile, user]);

  const handleStravaToggle = async (next: boolean) => {
    if (!user) return;
    setStravaError(null);
    setStravaShowActivities(next);
    setSavingStravaToggle(true);
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ strava_show_activities: next })
      .eq("id", user.id);
    if (updateError) {
      setStravaError(updateError.message);
      setStravaShowActivities(!next); // revert
    } else {
      await refreshProfile();
    }
    setSavingStravaToggle(false);
  };

  const handleStravaDisconnect = async () => {
    if (!user) return;
    if (!window.confirm("Отключить Strava? История заездов сохранится — при повторном подключении не пропадёт.")) {
      return;
    }
    setStravaError(null);
    setDisconnectingStrava(true);
    try {
      const res = await fetch("/api/strava/disconnect", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      await refreshProfile();
    } catch (err) {
      setStravaError(err instanceof Error ? err.message : "disconnect_failed");
    } finally {
      setDisconnectingStrava(false);
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

    // Update profile table
    const profileUpdate: Record<string, string | null> = {
      name: name.trim(),
      username: username.trim() || null,
      website: website.trim() || null,
      strava_url: stravaUrl.trim() || null,
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
            <Field label="Профиль Strava" htmlFor="strava">
              <input
                id="strava"
                type="url"
                value={stravaUrl}
                onChange={(e) => setStravaUrl(e.target.value)}
                placeholder="https://www.strava.com/athletes/..."
                className={INPUT_CLS}
              />
            </Field>
          </Section>

          {/* Strava integration */}
          <Section title="Интеграция Strava">
            {profile?.strava_connected ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: "#FFF0EB", color: "#FC4C02" }}
                  >
                    <StravaLogo size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-[#1C1C1E]">
                      Strava подключён
                    </div>
                    <div className="text-xs text-[#71717A] mt-0.5">
                      {profile.strava_synced_rides ?? 0} заездов ·{" "}
                      {Math.round(Number(profile.strava_synced_km ?? 0))} км
                    </div>
                  </div>
                </div>

                {/* Visibility toggle */}
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={stravaShowActivities}
                    disabled={savingStravaToggle}
                    onChange={(e) => handleStravaToggle(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded border-[#E4E4E7] accent-[#FC4C02]"
                  />
                  <div>
                    <div className="text-sm font-medium text-[#1C1C1E]">
                      Показывать заезды другим участникам
                    </div>
                    <div className="text-xs text-[#71717A] mt-0.5">
                      Если выключить, твои заезды видишь только ты. Приватные
                      заезды Strava никогда не показываются.
                    </div>
                  </div>
                </label>

                <button
                  type="button"
                  onClick={handleStravaDisconnect}
                  disabled={disconnectingStrava}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[#E4E4E7] bg-white text-sm font-medium text-[#71717A] hover:text-[#1C1C1E] hover:bg-[#F5F4F1] transition-colors disabled:opacity-60"
                >
                  {disconnectingStrava ? "Отключение…" : "Отключить Strava"}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-[#71717A]">
                  <Activity size={14} />
                  Подключи Strava — километры и заезды появятся в профиле автоматически
                </div>
                <ConnectStravaButton variant="compact" />
              </div>
            )}

            {stravaError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-xs">
                {stravaError}
              </div>
            )}
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
