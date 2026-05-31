import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Routes that require an authenticated session */
const PROTECTED_PATHS = [
  "/profile/settings",
  "/routes/new",
  "/events/new",
];

/** Routes that require auth when matching a pattern */
const PROTECTED_PATTERNS = [
  /^\/routes\/[^/]+\/edit$/,
  /^\/events\/[^/]+\/edit$/,
];

function isProtectedRoute(pathname: string): boolean {
  if (PROTECTED_PATHS.includes(pathname)) return true;
  return PROTECTED_PATTERNS.some((pattern) => pattern.test(pathname));
}

/**
 * Paths that should NOT redirect to /onboarding even when the user is new.
 * Onboarding itself, auth flows, API/webhooks, and the public landing page
 * must remain reachable so the user can complete the flow or sign out.
 */
function shouldEnforceOnboarding(pathname: string): boolean {
  if (pathname === "/onboarding" || pathname.startsWith("/onboarding/")) return false;
  if (pathname.startsWith("/auth/")) return false;
  if (pathname.startsWith("/api/")) return false;
  if (pathname.startsWith("/legal/")) return false;
  if (pathname === "/welcome") return false;
  return true;
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh the session — this is critical for token rotation
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect unauthenticated users away from protected pages
  if (!user && isProtectedRoute(request.nextUrl.pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/auth/login";
    loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Force first-time users through /onboarding before they can browse the app.
  //
  // To avoid hitting `profiles` on every single navigation (and to make the
  // request latency uniform between onboarded and pending users — small
  // anti-enumeration win), we cache the boolean in a signed-ish cookie.
  //
  // - `cc_onb=1`        → onboarded, skip the DB read entirely.
  // - cookie missing    → fetch once and set it for 24 h.
  // - on /onboarding    → invalidate the cookie so a successful finish makes
  //                       the next nav re-check the DB row.
  if (user && shouldEnforceOnboarding(request.nextUrl.pathname)) {
    const cached = request.cookies.get("cc_onb")?.value;

    if (cached !== "1") {
      const { data: prof } = await supabase
        .from("profiles")
        .select("onboarded_at")
        .eq("id", user.id)
        .maybeSingle();

      if (prof && prof.onboarded_at == null) {
        const url = request.nextUrl.clone();
        url.pathname = "/onboarding";
        url.search = "";
        return NextResponse.redirect(url);
      }

      // Onboarded — cache the answer for a day. httpOnly so the client can't
      // forge it from JS (a tampered cookie would only skip an extra DB read
      // for the attacker themselves, but no reason to leave it tamperable).
      supabaseResponse.cookies.set("cc_onb", "1", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24,
      });
    }
  } else if (
    request.nextUrl.pathname === "/onboarding" ||
    request.nextUrl.pathname.startsWith("/onboarding/") ||
    request.nextUrl.pathname.startsWith("/auth/")
  ) {
    // Drop any stale cache:
    //   • /onboarding/* — completing the flow needs the next nav to re-check.
    //   • /auth/*       — different user may be signing in on the same browser;
    //                     stale `cc_onb=1` from user A would skip the DB check
    //                     and let user B (new account) past /onboarding.
    supabaseResponse.cookies.set("cc_onb", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image (Next.js internals)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - Static assets (svg, png, jpg, etc.)
     */
    "/((?!_next/static|_next/image|api/supabase|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
