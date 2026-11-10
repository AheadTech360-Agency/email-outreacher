import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
// The browser only ever talks to this app (its /api/v1 forwards to the backend) and to Supabase for sign-in.
const supabase = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");

// Even if a script were ever injected into a page, it couldn't load code from elsewhere or send anything
// (the sign-in token included) anywhere but here and Supabase. No nonces, so pages stay static
// (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md, "Without Nonces").
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  `connect-src 'self'${supabase ? ` ${supabase} ${supabase.replace(/^https:/, "wss:")}` : ""}${isDev ? " ws:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  // The default bottom-left spot covers the sidebar footer controls.
  devIndicators: { position: "bottom-right" },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  // "/" goes to /home on Coldbrew's address only: proxy.ts does it, since on the sending dashboard's address "/" is
  // the dashboard's overview.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
