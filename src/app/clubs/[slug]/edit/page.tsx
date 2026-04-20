"use client";

import { useState, useEffect, useRef, use } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { useAuth } from "@/lib/context/AuthContext";
import { supabase, proxyImageUrl } from "@/lib/supabase";
import { CLUB_LIST_SELECT } from "@/lib/queries";
import { dbToClub } from "@/lib/transforms";
import type { Club } from "@/types";
import { ArrowLeft, Camera, Shield } from "lucide-react";

export default function EditClubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [club, setClub] = useState<Club | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [visibility, setVisibility] = useState<Club["visibility"]>("open");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/auth/login"); return; }
    loadClub();
  }, [authLoading, user, slug]);

  async function loadClub() {
    const { data } = await supabase
      .from("clubs")
      .select(CLUB_LIST_SELECT)
      .eq("slug", slug)
      .single();

    if (!data) { setNotFound(true); setLoading(false); return; }

    const c = dbToClub(data);

    // Check permissions: must be owner or admin
    const { data: membership } = await supabase
      .from("club_members")
      .select("role")
      .eq("club_id", c.id)
      .eq("user_id", user!.id)
      .eq("status", "active")
      .maybeSingle();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      setForbidden(true);
      setLoading(false);
      return;
    }

    setClub(c);
    setName(c.name);
    setDescription(c.description ?? "");
    setCity(c.city ?? "");
    setVisibility(c.visibility);
    setAvatarUrl(c.avatar_url ?? null);
    setCoverUrl(c.cover_url ?? null);
    setLoading(false);
  }

  async function uploadImage(
    file: File,
    path: string,
    bucket: string,
  ): Promise<string | null> {
    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true, cacheControl: "0" });
    if (error) return null;
    return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !club) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["jpg", "jpeg", "png", "webp"].includes(ext ?? "")) return;
    setAvatarUploading(true);
    const url = await uploadImage(file, `clubs/${club.id}/avatar.${ext}`, "avatars");
    if (url) setAvatarUrl(`${url}?t=${Date.now()}`);
    setAvatarUploading(false);
    e.target.value = "";
  }

  async function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !club) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["jpg", "jpeg", "png", "webp"].includes(ext ?? "")) return;
    setCoverUploading(true);
    const url = await uploadImage(file, `clubs/${club.id}/cover.${ext}`, "avatars");
    if (url) setCoverUrl(`${url}?t=${Date.now()}`);
    setCoverUploading(false);
    e.target.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!club || !name.trim()) return;
    setSaving(true);
    setError(null);

    const { error: err } = await supabase
      .from("clubs")
      .update({
        name: name.trim(),
        description: description.trim() || null,
        city: city.trim() || null,
        visibility,
        avatar_url: avatarUrl || null,
        cover_url: coverUrl || null,
      })
      .eq("id", club.id);

    if (err) {
      setError(err.message);
      setSaving(false);
      return;
    }

    router.push(`/clubs/${slug}`);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F4F1]">
        <Header />
        <main className="max-w-lg mx-auto px-4 py-8">
          <div className="h-64 bg-white rounded-2xl animate-pulse border border-[#E4E4E7]" />
        </main>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#F5F4F1]">
        <Header />
        <main className="max-w-lg mx-auto px-4 py-16 text-center">
          <p className="text-[#71717A] mb-4">Клуб не найден</p>
          <Link href="/clubs" className="text-sm text-[#0BBFB5] hover:underline">← Все клубы</Link>
        </main>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="min-h-screen bg-[#F5F4F1]">
        <Header />
        <main className="max-w-lg mx-auto px-4 py-16 text-center">
          <p className="text-[#71717A] mb-4">Только владелец или администратор клуба может его редактировать</p>
          <Link href={`/clubs/${slug}`} className="text-sm text-[#0BBFB5] hover:underline">← Назад</Link>
        </main>
      </div>
    );
  }

  const initials = name ? name[0].toUpperCase() : "?";

  return (
    <div className="min-h-screen bg-[#F5F4F1]">
      <Header />
      <main className="max-w-lg mx-auto px-4 py-8 pb-24">
        <Link
          href={`/clubs/${slug}`}
          className="inline-flex items-center gap-1.5 text-sm text-[#71717A] hover:text-[#1C1C1E] transition-colors mb-6"
        >
          <ArrowLeft size={14} />
          {club?.name ?? "Клуб"}
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#E8FAF9" }}>
            <Shield size={20} style={{ color: "#0BBFB5" }} />
          </div>
          <h1 className="text-2xl font-bold text-[#1C1C1E]">Редактировать клуб</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Cover */}
          <div
            className="bg-white rounded-2xl border border-[#E4E4E7] overflow-hidden"
            style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}
          >
            {/* Cover image area */}
            <div className="relative">
              <div
                className="h-28 w-full overflow-hidden cursor-pointer group"
                onClick={() => coverInputRef.current?.click()}
              >
                {coverUrl ? (
                  <Image
                    src={proxyImageUrl(coverUrl) ?? coverUrl}
                    alt="Обложка"
                    width={640}
                    height={112}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full" style={{ background: "linear-gradient(135deg, #E8FAF9 0%, #F0ECFF 100%)" }} />
                )}
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  {coverUploading
                    ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Camera size={22} className="text-white" />
                  }
                </div>
              </div>
              <input ref={coverInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleCoverChange} />

              {/* Avatar over cover */}
              <div className="absolute -bottom-7 left-5">
                <div className="relative group cursor-pointer" onClick={() => avatarInputRef.current?.click()}>
                  <div
                    className="w-14 h-14 rounded-xl overflow-hidden border-2 border-white flex items-center justify-center text-white font-bold text-xl"
                    style={{ backgroundColor: "#0BBFB5" }}
                  >
                    {avatarUrl ? (
                      <Image
                        src={proxyImageUrl(avatarUrl) ?? avatarUrl}
                        alt="Аватар"
                        width={56}
                        height={56}
                        className="w-full h-full object-cover"
                      />
                    ) : initials}
                  </div>
                  <div className="absolute inset-0 rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    {avatarUploading
                      ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <Camera size={16} className="text-white" />
                    }
                  </div>
                </div>
                <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarChange} />
              </div>
            </div>

            <div className="pt-10 pb-2 px-5">
              <p className="text-xs text-[#A1A1AA]">Нажми на обложку или аватар чтобы изменить фото</p>
            </div>
          </div>

          {/* Text fields */}
          <div
            className="bg-white rounded-2xl border border-[#E4E4E7] overflow-hidden"
            style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}
          >
            {/* Name */}
            <div className="px-5 py-4 border-b border-[#E4E4E7]">
              <label className="block text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-2">Название *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                required
                className="w-full text-sm text-[#1C1C1E] placeholder-[#A1A1AA] focus:outline-none"
              />
            </div>

            {/* Description */}
            <div className="px-5 py-4 border-b border-[#E4E4E7]">
              <label className="block text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-2">Описание</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={500}
                className="w-full text-sm text-[#1C1C1E] placeholder-[#A1A1AA] focus:outline-none resize-none"
                placeholder="Расскажи о клубе — куда ездите, кто может вступить"
              />
            </div>

            {/* City */}
            <div className="px-5 py-4">
              <label className="block text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-2">Город</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                maxLength={60}
                placeholder="Москва"
                className="w-full text-sm text-[#1C1C1E] placeholder-[#A1A1AA] focus:outline-none"
              />
            </div>
          </div>

          {/* Visibility */}
          <div
            className="bg-white rounded-2xl border border-[#E4E4E7] overflow-hidden"
            style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}
          >
            <div className="px-5 py-4">
              <label className="block text-xs font-semibold text-[#71717A] uppercase tracking-wide mb-3">Вступление</label>
              <div className="space-y-2">
                {(
                  [
                    { value: "open",    label: "Открытый",  desc: "Любой может вступить сразу" },
                    { value: "request", label: "По заявке", desc: "Ты одобряешь каждого участника" },
                    { value: "closed",  label: "Закрытый",  desc: "Только по приглашению" },
                  ] as const
                ).map((opt) => (
                  <label
                    key={opt.value}
                    className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border transition-colors"
                    style={
                      visibility === opt.value
                        ? { borderColor: "#0BBFB5", backgroundColor: "#F0FFFE" }
                        : { borderColor: "#E4E4E7" }
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

          {error && <p className="text-sm text-red-500 px-1">{error}</p>}

          <div className="flex gap-3">
            <Link
              href={`/clubs/${slug}`}
              className="flex-1 py-3 rounded-xl text-sm font-semibold text-center border border-[#E4E4E7] text-[#71717A] hover:bg-[#F5F4F1] transition-colors"
            >
              Отмена
            </Link>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 py-3 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-50"
              style={{ backgroundColor: "#0BBFB5" }}
            >
              {saving ? "Сохраняем…" : "Сохранить"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
