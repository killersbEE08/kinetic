import "server-only";

// Reads configuration at request time. On Cloudflare, OpenNext copies Worker vars and
// secrets into process.env; locally, Next.js loads .env.local.
export function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

export const config = {
  clerkEnabled: () => !!(env("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY") && env("CLERK_SECRET_KEY")),
  supabaseEnabled: () => !!(env("NEXT_PUBLIC_SUPABASE_URL") && env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")),
  geminiEnabled: () => !!env("GEMINI_API_KEY"),
  dodoEnabled: () => !!(env("DODO_PAYMENTS_API_KEY") && env("DODO_PAYMENTS_WEBHOOK_KEY")),
  geminiModel: () => env("GEMINI_MODEL") ?? "gemini-3.8-flash",
  appUrl: () => env("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000",
};
