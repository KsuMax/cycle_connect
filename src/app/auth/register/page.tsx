"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bike, Eye, EyeOff, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { supabase } from "@/lib/supabase";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
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

    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError) {
      setError(signUpError.message === "User already registered" ? "Этот email уже зарегистрирован" : signUpError.message);
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
          <div className="bg-white rounded-2xl p-8 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
            <CheckCircle size={48} className="mx-auto mb-4" style={{ color: "#22C55E" }} />
            <h2 className="text-lg font-bold text-[#1C1C1E] mb-2">Аккаунт создан!</h2>
            <p className="text-sm text-[#71717A] mb-6">
              Мы отправили письмо с подтверждением на <strong>{email}</strong>. Перейди по ссылке в письме, затем войди.
            </p>
            <Link href="/auth/login">
              <Button variant="secondary" size="lg" className="w-full">Войти</Button>
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
          <h1 className="text-xl font-bold text-[#1C1C1E]">Создай аккаунт</h1>
          <p className="text-sm text-[#71717A] mt-1">Присоединяйся к велосипедному сообществу</p>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-[#E4E4E7]" style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                {error}
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-1.5 block">Имя</label>
              <input
                type="text" required value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Как тебя зовут?"
                className="w-full px-4 py-2.5 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-1.5 block">Никнейм</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[#A1A1AA]">@</span>
                <input
                  type="text" required value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="username"
                  className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-1.5 block">Email</label>
              <input
                type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-2.5 rounded-xl border border-[#E4E4E7] text-sm outline-none focus:border-[#F4632A] transition-colors"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-1.5 block">Пароль</label>
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
            <Button type="submit" variant="secondary" size="lg" loading={loading} className="w-full">
              Зарегистрироваться
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-[#71717A] mt-4">
          Уже есть аккаунт?{" "}
          <Link href="/auth/login" className="font-medium hover:underline" style={{ color: "#F4632A" }}>
            Войти
          </Link>
        </p>
      </div>
    </div>
  );
}
