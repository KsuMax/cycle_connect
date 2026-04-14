"use client";

import { useState } from "react";
import Link from "next/link";
import { Bike, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { supabase } from "@/lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const redirectTo = `${window.location.origin}/auth/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

    setLoading(false);

    if (error) {
      setError("Не удалось отправить письмо — проверь адрес и попробуй ещё раз");
      return;
    }

    setSent(true);
  };

  if (sent) {
    return (
      <div className="min-h-screen bg-[#F5F4F1] flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="bg-white rounded-2xl p-8 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <CheckCircle size={48} className="mx-auto mb-4" style={{ color: "#22C55E" }} />
            <h2 className="text-lg font-bold text-[#1C1C1E] mb-2">Письмо отправлено</h2>
            <p className="text-sm text-[#71717A] mb-6">
              Мы отправили ссылку для сброса пароля на <strong>{email}</strong>.
              Проверь почту и перейди по ссылке.
            </p>
            <Link href="/auth/login">
              <Button variant="secondary" size="lg" className="w-full">Вернуться ко входу</Button>
            </Link>
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
          <h1 className="text-xl font-bold text-[#1C1C1E]">Сброс пароля</h1>
          <p className="text-sm text-[#71717A] mt-1">Укажи email — пришлём ссылку для создания нового пароля</p>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                {error}
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-1.5 block">Email</label>
              <input
                type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-2.5 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors"
              />
            </div>
            <Button type="submit" variant="secondary" size="lg" loading={loading} className="w-full">
              Отправить письмо
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-[#71717A] mt-4">
          Вспомнил пароль?{" "}
          <Link href="/auth/login" className="font-medium hover:underline" style={{ color: "#F4632A" }}>
            Войти
          </Link>
        </p>
      </div>
    </div>
  );
}
