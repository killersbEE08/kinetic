import { clerkSetup } from "@clerk/testing/playwright";
import { loadEnvConfig } from "@next/env";

// Gets a Clerk testing token so sign-in works without bot checks. Needs the Clerk keys
// (from the environment, or .env.local) and is skipped when no test user is configured.
export default async function setup() {
  loadEnvConfig(process.cwd());
  if (!process.env.E2E_CLERK_USER_EMAIL) {
    console.log("[e2e:cloud] E2E_CLERK_USER_EMAIL is not set: signed-in tests will be skipped.");
    return;
  }
  const publishableKey = process.env.CLERK_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!publishableKey || !secretKey) throw new Error("Signed-in tests need NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY.");
  if (!publishableKey.startsWith("pk_test_")) throw new Error("Signed-in tests must run against a Clerk development instance (pk_test_ key).");
  await clerkSetup({ publishableKey, secretKey });
}
