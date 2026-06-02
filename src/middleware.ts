import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request Content-Security-Policy with a fresh nonce.
 *
 * - The nonce goes on the `x-nonce` request header so Server Components
 *   can read it via `headers()` and pass it to `<Script nonce={...}>`.
 *   Next.js 16 also auto-attaches the same header value to its own inline
 *   bootstrap scripts when CSP contains a matching nonce.
 * - `'strict-dynamic'` lets any script loaded via a nonced root script load
 *   further scripts without explicit host allow-listing — modern, simple.
 * - `'unsafe-inline'` is included as a legacy fallback. CSP3-compliant
 *   browsers ignore it once any `'nonce-*'` or `'strict-dynamic'` is
 *   present, so it only kicks in on very old browsers (and there it just
 *   restores the previous looser policy — no regression).
 * - Dev mode skips strict-dynamic / nonce so Webpack HMR keeps working.
 */
function buildCsp(nonce: string): string {
  const isProd = process.env.NODE_ENV === "production";
  const scriptSrc = isProd
    ? `'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline' https://mc.yandex.ru`
    : `'self' 'unsafe-inline' 'unsafe-eval' https://mc.yandex.ru`;

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.cycleconnect.cc wss://api.cycleconnect.cc https://mc.yandex.ru",
    "frame-src 'self' https://mapmagic.app https://*.mapmagic.app",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** 16-byte cryptographic random encoded as base64 — CSP-compliant nonce. */
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // base64 (not base64url) — CSP nonce-source must be base64.
  return Buffer.from(bytes).toString("base64");
}

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
  // Generate the nonce first and stash it on the *request* headers so it
  // flows through to Server Components via next/headers `headers()`.
  const nonce = generateNonce();
  const csp = buildCsp(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });
  supabaseResponse.headers.set("content-security-policy", csp);

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
          supabaseResponse = NextResponse.next({
            request: { headers: requestHeaders },
          });
          // The fresh NextResponse just clobbered our CSP — re-apply.
          supabaseResponse.headers.set("content-security-policy", csp);
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
    const redirect = NextResponse.redirect(loginUrl);
    redirect.headers.set("content-security-policy", csp);
    return redirect;
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
        const redirect = NextResponse.redirect(url);
        redirect.headers.set("content-security-policy", csp);
        return redirect;
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
