"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Bike } from "lucide-react";
import { ensureProfileAction } from "./actions";

/**
 * Profile bootstrap moved to a Server Action — see ./actions.ts.
 *
 * Previously this file held a browser-side `ensureProfile(...)` that
 * SELECT/INSERT/UPDATEd `public.profiles` with raw values from
 * `user_metadata`. That trusted attacker-controlled data (a user can PATCH
 * their own metadata via GoTrue) — closing it required a SECURITY DEFINER
 * RPC + a server-side action so the values are validated where the user
 * can't reach.
 */
async function ensureProfile(): Promise<void> {
  const res = await ensureProfileAction();
  if ("error" in res) {
    // Soft-fail: log but don't block the redirect. The next page render
    // will surface any missing-profile state (e.g. /onboarding will catch).
    console.warn("[auth/callback] ensureProfileAction failed:", res.error);
  }
}

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const handle = async () => {
      const code = searchParams.get("code");
      const tokenHash = searchParams.get("token_hash");
      const type = searchParams.get("type");

      if (tokenHash && type) {
        // OTP / magiclink flow — used by Telegram login
        const { data, error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as "magiclink" | "email",
        });
        if (!error && data.session) {
          await ensureProfile();
          router.replace("/");
          return;
        }
      }

      if (code) {
        // PKCE flow: exchange the one-time code for a session
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error && data.session) {
          await ensureProfile();
          router.replace("/");
          return;
        }
      }

      // Fallback: implicit flow (hash tokens) or session already set
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await ensureProfile();
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
