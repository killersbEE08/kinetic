import { defineConfig, devices } from "@playwright/test";

// Browser tests in signed-in mode: real Clerk sign-in, Supabase, share links and version history.
// Runs against an app that is already running with real keys (`pnpm dev`, or a preview deploy):
//
//   E2E_CLOUD_URL=http://localhost:3000            app to test (default)
//   E2E_CLERK_USER_EMAIL=e2e+clerk_test@example.com an existing user in a Clerk *development* instance
//   CLERK_SECRET_KEY / NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY (read from .env.local when unset)
//
// The tests create decks and share links in that account and delete them at the end.
// Without E2E_CLERK_USER_EMAIL every test is skipped.
export default defineConfig({
  testDir: "e2e",
  testMatch: ["cloud.spec.ts"],
  globalSetup: "./e2e/cloud.setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never", outputFolder: "playwright-report-cloud" }]] : [["list"]],
  use: {
    baseURL: process.env.E2E_CLOUD_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    acceptDownloads: true,
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: "cloud", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
});
