"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bike, Eye, EyeOff, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  // Supabase inserts the recovery token into the URL fragment on redirect.
  // The SDK picks it up automatically via onAuthStateChange("PASSWORD_RECOVERY").
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Listen for the PASSWORD_RECOVERY event which fires when the user
    // arrives via the reset-password email link and the token is valid.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Пароль должен содержать не менее 6 символов");
      return;
    }
    if (password !== confirm) {
      setError("Пароли не совпадают");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError("Не удалось обновить пароль — ссылка могла истечь. Запроси новую.");
      return;
    }

    setDone(true);
    // Redirect to home after 2 s
    setTimeout(() => router.push("/"), 2000);
  };

  if (done) {
    return (
      <div className="min-h-screen bg-[#F5F4F1] flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="bg-white rounded-2xl p-8 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <CheckCircle size={48} className="mx-auto mb-4" style={{ color: "#22C55E" }} />
            <h2 className="text-lg font-bold text-[#1C1C1E] mb-2">Пароль изменён</h2>
            <p className="text-sm text-[#71717A]">Перенаправляем тебя на главную…</p>
          </div>
        </div>
      </div>
    );
  }

  // Show a waiting state until the recovery token is confirmed by the SDK
  if (!ready) {
    return (
      <div className="min-h-screen bg-[#F5F4F1] flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="bg-white rounded-2xl p-8 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <p className="text-sm text-[#71717A] mb-4">Проверяем ссылку…</p>
            <p className="text-xs text-[#A1A1AA]">
              Если страница не обновляется, возможно ссылка истекла.{" "}
              <Link href="/auth/forgot-password" className="underline" style={{ color: "#F4632A" }}>
                Запросить новую
              </Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F4F1] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#F4632A" }}>
              <Bike size={22} color="white" strokeWidth={2.5} />
            </div>
            <span className="text-xl font-bold">
              <span style={{ color: "#1C1C1E" }}>Cycle</span>
              <span style={{ color: "#F4632A" }}>Connect</span>
            </span>
          </Link>
          <h1 className="text-xl font-bold text-[#1C1C1E]">Новый пароль</h1>
          <p className="text-sm text-[#71717A] mt-1">Придумай новый пароль для своего аккаунта</p>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                {error}
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-1.5 block">Новый пароль</label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"} required minLength={6} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Минимум 6 символов"
                  className="w-full px-4 py-2.5 pr-10 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors"
                />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A1A1AA] hover:text-[#71717A]">
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-1.5 block">Повтори пароль</label>
              <input
                type={showPass ? "text" : "password"} required value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors"
              />
            </div>
            <Button type="submit" variant="secondary" size="lg" loading={loading} className="w-full">
              Сохранить пароль
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
