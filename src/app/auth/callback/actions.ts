"use server";

import { createServerSupabase } from "@/lib/supabase-server";

/**
 * Server-side profile bootstrap for the OAuth/email callback.
 *
 * Replaces the old browser-side `ensureProfile(...)` that called
 * `supabase.from("profiles").insert(...)` with raw values out of
 * `auth.users.user_metadata`. Since user_metadata is freely PATCH-able by
 * the user via GoTrue, that path let an attacker stuff e.g. a `javascript:`
 * URL into `strava_url` and have it rendered as a profile link.
 *
 * The heavy lifting (validation, username dedup, conflict handling) lives
 * inside the SECURITY DEFINER `public.ensure_profile` RPC (migration 057).
 * This action is just the auth-aware shim that pulls `user_metadata` off
 * the verified session and forwards it.
 */
export async function ensureProfileAction(): Promise<{ ok: true } | { error: string }> {
  const sb = await createServerSupabase();
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return { error: "unauthorized" };

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const fallbackName = user.email?.split("@")[0] ?? "Велосипедист";
  const fallbackUsername = user.email?.split("@")[0] ?? "";

  const { error } = await sb.rpc("ensure_profile", {
    p_id:       user.id,
    p_name:     stringOr(meta.name) ?? stringOr(meta.full_name) ?? fallbackName,
    p_username: stringOr(meta.username) ?? fallbackUsername,
    p_telegram: stringOr(meta.telegram_username) ?? "",
    p_strava:   stringOr(meta.strava_url) ?? "",
  });

  if (error) return { error: error.message };
  return { ok: true };
}

function stringOr(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}
