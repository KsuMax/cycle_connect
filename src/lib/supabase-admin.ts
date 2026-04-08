import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Privileged Supabase client that bypasses Row Level Security.
 *
 * **NEVER import this from a client component.** The `server-only` marker
 * above will fail the build if someone tries. This client uses the
 * `service_role` key which has full access to every table, including the
 * `private` schema where Strava OAuth tokens live.
 *
 * Use cases in this project:
 *   • Exchanging Strava OAuth codes for tokens and storing them
 *   • Reading / refreshing Strava tokens to call Strava API on behalf of a user
 *   • Processing webhook events from Strava asynchronously
 *   • Upserting Strava activities and calling recompute_strava_stats()
 *
 * For anything that should respect the signed-in user's RLS, use
 * {@link createServerSupabase} from `@/lib/supabase-server` instead.
 */
let cachedAdmin: SupabaseClient | null = null;

export function createAdminSupabase(): SupabaseClient {
  if (cachedAdmin) return cachedAdmin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is not set — cannot create admin Supabase client",
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set — cannot create admin Supabase client",
    );
  }

  cachedAdmin = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        "x-cycleconnect-client": "admin",
      },
    },
  });

  return cachedAdmin;
}
