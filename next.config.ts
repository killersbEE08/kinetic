import type { NextConfig } from "next";

// Clerk loads its UI from the instance's Frontend API (*.clerk.accounts.dev in development,
// clerk.<your domain> in production) and uses Cloudflare Turnstile for bot checks.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://*.clerk.accounts.dev https://*.clerk.com https://clerk.* https://challenges.cloudflare.com",
  "connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://clerk.* https://*.supabase.co",
  "img-src 'self' data: blob: https://img.clerk.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "frame-src https://challenges.cloudflare.com https://*.clerk.accounts.dev",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "report-uri /api/report",
].join("; ");

const nextConfig: NextConfig = {
  // Cache Components is off on purpose: the app area is client-rendered behind Clerk,
  // and keeping request-time behaviour simple makes the OpenNext/Workers build predictable.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          // Report-only for now: violations are sent to /api/report and logged, nothing is blocked.
          // Switch the key to Content-Security-Policy once reports are clean (docs/10 §2.3).
          { key: "Content-Security-Policy-Report-Only", value: CSP },
        ],
      },
    ];
  },
};

export default nextConfig;

// Lets `next dev` access Cloudflare bindings (R2, rate limits) locally. Skipped for builds:
// the remote R2 binding would otherwise need Cloudflare credentials just to compile (CI).
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
// (`next dev` loads this file in a child process, so check NODE_ENV rather than argv.)
if (process.env.NODE_ENV === "development" || process.argv.includes("dev")) initOpenNextCloudflareForDev();
