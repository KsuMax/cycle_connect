import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  // X-XSS-Protection: legacy, can introduce XS-Leaks in older Chromium.
  // Modern browsers ignore it; explicitly disable instead of "1; mode=block".
  { key: "X-XSS-Protection", value: "0" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Lock down browser APIs we never use; payment/usb/etc. inherit deny.
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(self), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), interest-cohort=()",
  },
  // NOTE: Content-Security-Policy is set per-request from middleware.ts so
  // we can attach a fresh nonce to each HTML response. Don't add a static
  // CSP here or it will conflict with the dynamic one.
];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

const nextConfig: NextConfig = {
  compress: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  // Next 16 removed the `eslint` key from next.config — lint is no longer
  // wired into `next build`. Run `npm run lint` separately (CI/pre-commit).
  images: {
    // Self-hosted Supabase only — browser traffic goes via the /api/supabase proxy,
    // so remotePatterns only needs the canonical domain plus Google OAuth avatars.
    remotePatterns: [
      { protocol: "https", hostname: "api.cycleconnect.cc" },
      { protocol: "https", hostname: "*.googleusercontent.com" },
    ],
  },
  transpilePackages: [
    "@tiptap/core",
    "@tiptap/react",
    "@tiptap/pm",
    "@tiptap/starter-kit",
    "@tiptap/extension-placeholder",
    "@tiptap/extension-image",
    "@tiptap/extension-gapcursor",
    "@tiptap/extension-bold",
    "@tiptap/extension-italic",
    "@tiptap/extension-heading",
    "@tiptap/extension-bullet-list",
    "@tiptap/extension-ordered-list",
    "@tiptap/extension-list-item",
    "@tiptap/extension-code",
    "@tiptap/extension-code-block",
    "@tiptap/extension-blockquote",
    "@tiptap/extension-hard-break",
    "@tiptap/extension-horizontal-rule",
    "@tiptap/extension-paragraph",
    "@tiptap/extension-text",
    "@tiptap/extension-document",
    "@tiptap/extension-dropcursor",
    "@tiptap/extension-strike",
    "@tiptap/extension-underline",
  ],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        source: "/api/supabase/storage/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=2592000" },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      // Proxy Supabase REST API through our domain to bypass Russian ISP blocks
      {
        source: "/api/supabase/rest/:path*",
        destination: `${supabaseUrl}/rest/:path*`,
      },
      // Proxy Supabase Auth — used by the JS client via /api/supabase/auth/*
      {
        source: "/api/supabase/auth/:path*",
        destination: `${supabaseUrl}/auth/:path*`,
      },
      // Supabase email links (password reset, magic link, etc.) point to
      // /auth/v1/verify on the site domain — proxy them to Supabase so the
      // token verification succeeds before Supabase redirects to redirect_to.
      {
        source: "/auth/v1/:path*",
        destination: `${supabaseUrl}/auth/v1/:path*`,
      },
      // Proxy Supabase Storage
      {
        source: "/api/supabase/storage/:path*",
        destination: `${supabaseUrl}/storage/:path*`,
      },
      // Proxy Supabase Realtime
      {
        source: "/api/supabase/realtime/:path*",
        destination: `${supabaseUrl}/realtime/:path*`,
      },
      // Proxy Supabase Edge Functions
      {
        source: "/api/supabase/functions/:path*",
        destination: `${supabaseUrl}/functions/:path*`,
      },
    ];
  },
  output: "standalone",
  // nodemailer is used in /api/email-send for SMTP delivery.
  // In standalone output it must be explicitly traced so Next.js
  // copies it to .next/standalone/node_modules/.
  serverExternalPackages: ["nodemailer"],
  // Moved out of `experimental` per Next 16 — top-level option now.
  outputFileTracingIncludes: {
    "/api/email-send": ["./node_modules/nodemailer/**/*"],
    // AI route description generator loads few-shot reference pairs from
    // disk at runtime. Standalone output doesn't auto-trace static data.
    "/api/routes/generate-description": ["./data/few-shot/**/*"],
  },
  experimental: {
    optimizePackageImports: [],
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "iceberg-js": false,
    };
    return config;
  },
};

export default nextConfig;
