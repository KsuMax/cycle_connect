"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { useAuth } from "@/lib/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, Shield } from "lucide-react";

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-zа-яё0-9\s-]/gi, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48);
}

export default function NewClubPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [visibility, setVisibility] = useState<"open" | "request" | "closed">("open");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/auth/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!slugManual) setSlug(toSlug(name));
  }, [name, slugManual]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !name.trim() || !slug.trim()) return;
    setSaving(true);
    setError(null);

    const { data, error: err } = await supabase
      .from("clubs")
      .insert({
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim() || null,
        city: city.trim() || null,
        visibility,
        owner_id: user.id,
      })
      .select("slug")
      .single();

    if (err) {
      setError(
        err.code === "23505"
          ? "Клуб с таким адресом уже существует — выбери другой"
          : err.message,
      );
      setSaving(false);
      return;
    }

    router.push(`/clubs/${data.slug}`);
  }

  if (authLoading) return null;
  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#F5F4F1]">
      <Header />
      <main className="max-w-lg mx-auto px-4 py-8">
        <Link
          href="/clubs"
          className="inline-flex items-center gap-1.5 text-sm text-[#71717A] hover:text-[#1C1C1E] transition-colors mb-6"
        >
          <ArrowLeft size={14} />
          Клубы
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: "#E8FAF9" }}
          >
            <Shield size={20} style={{ color: "#0BBFB5" }} />
          </div>
          <h1 className="text-2xl font-bold text-[#1C1C1E]">Новый клуб</h1>
        </div>

        <form onSubmit={handleSubmit}>
          <div
            className="bg-white rounded-2xl border border-[#E4E4E7] overflow-hidden mb-4"
            style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}
          >
            {/* Name */}
            <div className="px-5 py-4 border-b border-[#E4E4E7]">
              <label className="block text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-2">
                Название *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Велоклуб Москвы"
                maxLength={60}
                required
                className="w-full text-sm text-[#1C1C1E] placeholder-[#A1A1AA] focus:outline-none"
              />
            </div>

            {/* Slug */}
            <div className="px-5 py-4 border-b border-[#E4E4E7]">
              <label className="block text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-2">
                Адрес клуба *
              </label>
              <div className="flex items-center gap-1">
                <span className="text-sm text-[#A1A1AA]">cycleconnect.cc/clubs/</span>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => { setSlugManual(true); setSlug(e.target.value.toLowerCase().replace(/[^a-zа-яё0-9-]/gi, "").slice(0, 48)); }}
                  placeholder="moy-klub"
                  maxLength={48}
                  required
                  className="flex-1 text-sm text-[#1C1C1E] placeholder-[#A1A1AA] focus:outline-none"
                />
              </div>
            </div>

            {/* Description */}
            <div className="px-5 py-4 border-b border-[#E4E4E7]">
              <label className="block text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-2">
                Описание
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Расскажи, чем занимается клуб, куда ездите и кто может вступить"
                rows={3}
                maxLength={500}
                className="w-full text-sm text-[#1C1C1E] placeholder-[#A1A1AA] focus:outline-none resize-none"
              />
            </div>

            {/* City */}
            <div className="px-5 py-4 border-b border-[#E4E4E7]">
              <label className="block text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-2">
                Город
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Москва"
                maxLength={60}
                className="w-full text-sm text-[#1C1C1E] placeholder-[#A1A1AA] focus:outline-none"
              />
            </div>

            {/* Visibility */}
            <div className="px-5 py-4">
              <label className="block text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-3">
                Вступление
              </label>
              <div className="space-y-2">
                {(
                  [
                    { value: "open",    label: "Открытый",    desc: "Любой может вступить сразу" },
                    { value: "request", label: "По заявке",   desc: "Ты одобряешь каждого участника" },
                    { value: "closed",  label: "Закрытый",    desc: "Только по приглашению" },
                  ] as const
                ).map((opt) => (
                  <label
                    key={opt.value}
                    className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border transition-colors"
                    style={
                      visibility === opt.value
                        ? { borderColor: "#0BBFB5", backgroundColor: "#F0FFFE" }
                        : { borderColor: "#E4E4E7", backgroundColor: "transparent" }
                    }
                  >
                    <input
                      type="radio"
                      name="visibility"
                      value={opt.value}
                      checked={visibility === opt.value}
                      onChange={() => setVisibility(opt.value)}
                      className="mt-0.5 accent-[#0BBFB5]"
                    />
                    <div>
                      <div className="text-sm font-medium text-[#1C1C1E]">{opt.label}</div>
                      <div className="text-xs text-[#71717A]">{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-500 mb-4 px-1">{error}</div>
          )}

          <button
            type="submit"
            disabled={saving || !name.trim() || !slug.trim()}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-50"
            style={{ backgroundColor: "#0BBFB5" }}
          >
            {saving ? "Создаём…" : "Создать клуб"}
          </button>
        </form>
      </main>
    </div>
  );
}
