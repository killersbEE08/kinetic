import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { HttpError } from "./auth-error";

// Burst limits per signed-in user (or per IP for anonymous routes), using Cloudflare's
// rate-limiting binding. Monthly AI budgets are enforced separately in Postgres (ai_usage).
// Limits are per Cloudflare location and approximate, which is fine for abuse protection.

export type LimitKind = "ai" | "upload" | "write" | "read" | "anon";

interface RateLimiter {
  limit(opts: { key: string }): Promise<{ success: boolean }>;
}

const BINDING: Record<LimitKind, string> = {
  ai: "RL_AI", // 20 / minute: outline, generate, edit
  upload: "RL_UPLOAD", // 30 / minute: photo uploads
  write: "RL_WRITE", // 120 / minute: autosave, deck create/delete
  read: "RL_READ", // 300 / minute: lists, photo downloads
  anon: "RL_ANON", // 60 / minute per IP: public endpoints
};

/** Retry hint per kind, in seconds (the binding uses 60 s windows). */
const RETRY_S = 60;

function limiter(kind: LimitKind): RateLimiter | null {
  try {
    const env = getCloudflareContext().env as unknown as Record<string, RateLimiter | undefined>;
    const b = env[BINDING[kind]];
    return b && typeof b.limit === "function" ? b : null;
  } catch {
    return null; // `next dev` without bindings, or unit tests
  }
}

/** Throws 429 when `key` has used its budget for `kind`. No-op when the binding is missing. */
export async function enforceLimit(kind: LimitKind, key: string): Promise<void> {
  const rl = limiter(kind);
  if (!rl) return;
  let ok = true;
  try {
    ok = (await rl.limit({ key: `${kind}:${key}` })).success;
  } catch (e) {
    // Fail open: a limiter outage must not take the app down.
    console.warn("[limits] limiter error", e);
  }
  if (!ok) {
    const label = kind === "ai" ? "AI requests" : kind === "upload" ? "uploads" : "requests";
    throw new HttpError(429, `Too many ${label} in a short time. Wait a minute and try again.`, "rate_limited", { "Retry-After": String(RETRY_S) });
  }
}

/** Client IP as seen by Cloudflare. */
export function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
