"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Bike } from "lucide-react";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    // Supabase automatically handles the code exchange from the URL hash/query.
    // We just need to wait for the session to be set, then redirect.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_IN" && session) {
          subscription.unsubscribe();
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
