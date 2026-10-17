import { defineConfig, devices } from "@playwright/test";

// Browser tests in demo mode (no keys: decks in the browser, offline AI). Builds the app with the
// sign-in and database keys blanked, then serves it on :3100. `pnpm test:e2e` runs this file;
// signed-in mode has its own config (playwright.cloud.config.ts).
const PORT = Number(process.env.E2E_PORT ?? 3100);

// An empty value stops Next.js from reading the key from .env.local, which forces demo mode.
const BLANK = ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "GEMINI_API_KEY", "UNSPLASH_ACCESS_KEY", "SENTRY_DSN", "RESEND_API_KEY"];

export default defineConfig({
  testDir: "e2e",
  testMatch: ["demo.spec.ts", "a11y.spec.ts"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    acceptDownloads: true,
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: "demo", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: process.env.E2E_SKIP_BUILD ? `pnpm exec next start -p ${PORT}` : `pnpm exec next build && pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: { ...Object.fromEntries(BLANK.map((k) => [k, ""])), NEXT_TELEMETRY_DISABLED: "1" },
  },
});
