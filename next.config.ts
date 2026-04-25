import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co https://api.cycleconnect.cc wss://api.cycleconnect.cc",
      "frame-src 'self' https://mapmagic.app https://*.mapmagic.app",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

const nextConfig: NextConfig = {
  images: {
    // Allow next/image to optimise images from Supabase storage directly
    // (used server-side by the optimiser; browser traffic goes via the /api/supabase proxy)
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.supabase.in" },
      { protocol: "https", hostname: "api.cycleconnect.cc" },
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
    ];
  },
  output: "standalone",
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
