/**
 * POST /api/tg-link
 *
 * Generates a one-time code for linking the current user's profile to
 * their Telegram account via the bot's /start deep link.
 *
 * Returns: { code: string, botUsername: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";

function makeCode(): string {
  // 16 url-safe bytes → 22 base64url chars, no ambiguous characters
  return randomBytes(16).toString("base64url");
}

export async function POST(_req: NextRequest) {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const code = makeCode();
  const exp = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

  const { error } = await supabase
    .from("profiles")
    .update({ tg_link_code: code, tg_link_code_exp: exp })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "";

  return NextResponse.json({ code, botUsername });
}
