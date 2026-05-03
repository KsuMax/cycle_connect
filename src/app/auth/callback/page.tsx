"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Bike } from "lucide-react";

async function ensureProfile(
  userId: string,
  userMetadata: Record<string, string>,
  email: string | undefined,
) {
  const { data: existing } = await supabase
    .from("profiles")
    .select("id, username")
    .eq("id", userId)
    .single();

  const rawUsername =
    userMetadata.username ||
    email?.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "") ||
    `user_${userId.slice(0, 8)}`;

  const rawName =
    userMetadata.name ||
    userMetadata.full_name ||
    email?.split("@")[0] ||
    "Велосипедист";

  if (existing) {
    // Profile was created by the DB trigger but username/extra fields may be missing
    if (!existing.username) {
      // Check uniqueness before updating
      const { data: taken } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", rawUsername)
        .neq("id", userId)
        .single();

      const username = taken ? `${rawUsername}_${userId.slice(0, 4)}` : rawUsername;

      await supabase
        .from("profiles")
        .update({
          username,
          telegram_username: userMetadata.telegram_username || null,
          strava_url: userMetadata.strava_url || null,
        })
        .eq("id", userId);
    }
    return;
  }

  // Rare: profile doesn't exist yet — insert full row
  const { data: taken } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", rawUsername)
    .single();

  const username = taken ? `${rawUsername}_${userId.slice(0, 4)}` : rawUsername;

  await supabase.from("profiles").insert({
    id: userId,
    name: rawName,
    username,
    bio: null,
    km_total: 0,
    routes_count: 0,
    events_count: 0,
    telegram_username: userMetadata.telegram_username || null,
    strava_url: userMetadata.strava_url || null,
  });
}

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const handle = async () => {
      const code = searchParams.get("code");

      if (code) {
        // PKCE flow: exchange the one-time code for a session
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error && data.session) {
          await ensureProfile(
            data.session.user.id,
            data.session.user.user_metadata as Record<string, string>,
            data.session.user.email,
          );
          router.replace("/");
          return;
        }
      }

      // Fallback: implicit flow (hash tokens) or session already set
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await ensureProfile(
          session.user.id,
          session.user.user_metadata as Record<string, string>,
          session.user.email,
        );
        router.replace("/");
        return;
      }

      router.replace("/auth/login?error=callback");
    };

    handle();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-[#F5F4F1] flex items-center justify-center px-4">
      <div className="text-center">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse"
          style={{ backgroundColor: "#F4632A" }}
        >
          <Bike size={28} color="white" strokeWidth={2.5} />
        </div>
        <p className="text-sm text-[#71717A]">Входим в аккаунт...</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#F5F4F1] flex items-center justify-center px-4">
        <div className="text-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse"
            style={{ backgroundColor: "#F4632A" }}
          >
            <Bike size={28} color="white" strokeWidth={2.5} />
          </div>
          <p className="text-sm text-[#71717A]">Входим в аккаунт...</p>
        </div>
      </div>
    }>
      <CallbackHandler />
    </Suspense>
  );
}
