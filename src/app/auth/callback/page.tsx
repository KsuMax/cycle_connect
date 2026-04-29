"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Bike } from "lucide-react";

async function ensureProfile(userId: string, userMetadata: Record<string, string>, email: string | undefined) {
  // Check if profile already exists
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .single();

  if (existing) return;

  // Build profile from metadata (email signup) or OAuth data (Google)
  const rawName =
    userMetadata.name ||
    userMetadata.full_name ||
    email?.split("@")[0] ||
    "Велосипедист";

  const rawUsername =
    userMetadata.username ||
    email?.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "") ||
    `user_${userId.slice(0, 8)}`;

  // Ensure username is unique by appending random suffix if needed
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

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "SIGNED_IN" && session) {
          subscription.unsubscribe();
          await ensureProfile(
            session.user.id,
            session.user.user_metadata as Record<string, string>,
            session.user.email,
          );
          router.replace("/");
        }
        if (event === "SIGNED_OUT" || (event !== "INITIAL_SESSION" && !session)) {
          subscription.unsubscribe();
          router.replace("/auth/login?error=oauth");
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

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
