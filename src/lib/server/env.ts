import "server-only";

// Reads configuration at request time. On Cloudflare, OpenNext copies Worker vars and
// secrets into process.env; locally, Next.js loads .env.local.
export function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

/** "https://x.dev/" → "https://x.dev". Origins must match exactly (Clerk's azp check, return links). */
export function normalizeOrigin(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export const config = {
  clerkEnabled: () => !!(env("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY") && env("CLERK_SECRET_KEY")),
  supabaseEnabled: () => !!(env("NEXT_PUBLIC_SUPABASE_URL") && env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")),
  geminiEnabled: () => !!env("GEMINI_API_KEY"),
  dodoEnabled: () => !!(env("DODO_PAYMENTS_API_KEY") && env("DODO_PAYMENTS_WEBHOOK_KEY")),
  unsplashEnabled: () => !!env("UNSPLASH_ACCESS_KEY"),
  geminiModel: () => env("GEMINI_MODEL") ?? "gemini-3.8-flash",
  /** Optional cheaper model for free-plan users (e.g. a Flash-Lite model). */
  geminiFreeModel: () => env("GEMINI_MODEL_FREE"),
  appUrl: () => normalizeOrigin(env("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000"),
  /** Origins allowed to send session tokens. */
  authorizedParties: () => (env("CLERK_AUTHORIZED_PARTIES") ?? env("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000").split(",").map(normalizeOrigin).filter(Boolean),
};
