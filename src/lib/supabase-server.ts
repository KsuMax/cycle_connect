import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { CookieOptions } from "@supabase/ssr";

/**
 * Supabase client for Route Handlers and Server Components.
 *
 * Uses the anon key but with cookie-based session forwarding — RLS applies
 * as if the request were coming from the signed-in user. Use this when you
 * need to know "who is calling" (e.g. auth.uid() in RLS) but don't need
 * privileged access that bypasses RLS.
 *
 * For privileged writes (storing OAuth tokens, updating rows in the private
 * schema, processing webhook events), use {@link createAdminSupabase}
 * from `@/lib/supabase-admin` instead.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options as CookieOptions);
            }
          } catch {
            // Called from a Server Component where cookies cannot be set.
            // That's fine — middleware.ts already refreshes the session.
          }
        },
      },
    },
  );
}
