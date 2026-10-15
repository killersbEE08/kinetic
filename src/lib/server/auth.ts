import "server-only";
import { verifyToken } from "@clerk/nextjs/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config, env } from "./env";

import { HttpError } from "./auth-error";
import { enforceLimit, type LimitKind } from "./limits";

export { HttpError };

export interface AuthedUser {
  userId: string;
  email?: string;
  token: string;
  /** Supabase client that acts as this user. RLS policies apply. */
  db: SupabaseClient;
}

/**
 * Verifies the Clerk session token sent as `Authorization: Bearer <token>`.
 * We verify in the route handler (not in proxy/middleware) because OpenNext on
 * Cloudflare doesn't run Next 16's Node.js proxy.
 */
export async function requireUser(req: Request, limit: LimitKind = "read"): Promise<AuthedUser> {
  if (!config.clerkEnabled()) throw new HttpError(503, "Sign-in is not configured on this server.", "auth_disabled");
  if (!config.supabaseEnabled()) throw new HttpError(503, "The database is not configured on this server.", "db_disabled");

  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new HttpError(401, "Sign in to continue.", "unauthenticated");

  const authorizedParties = config.authorizedParties();
  let result: Awaited<ReturnType<typeof verifyToken>>;
  try {
    result = await verifyToken(token, {
      secretKey: env("CLERK_SECRET_KEY"),
      jwtKey: env("CLERK_JWT_KEY"), // optional: networkless verification
      authorizedParties,
    });
  } catch (e) {
    // Malformed tokens and JWKS lookup failures throw; treat them all as "not signed in".
    // The reason (never the token) is logged so setup problems are visible in the server console.
    const reason = (e as { reason?: string; message?: string })?.reason ?? (e as Error)?.message ?? "unknown";
    console.warn(`[auth] session token rejected: ${reason}. Allowed origins: ${authorizedParties.join(", ") || "(any)"}`);
    throw new HttpError(401, "Your session has expired. Sign in again.", "invalid_token");
  }
  // @clerk/backend 3 returns the claims and throws on failure; older versions returned
  // { data, errors }. Accept both so an SDK update can't silently sign everyone out.
  const r = result as unknown as { data?: unknown; errors?: unknown[]; sub?: unknown };
  if (r.errors?.length) throw new HttpError(401, "Your session has expired. Sign in again.", "invalid_token");
  const claims = (r.data ?? r) as { sub?: string; email?: unknown } | undefined;
  if (!claims?.sub || typeof claims.sub !== "string") throw new HttpError(401, "Your session has expired. Sign in again.", "invalid_token");

  const db = createClient(env("NEXT_PUBLIC_SUPABASE_URL")!, env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")!, {
    accessToken: async () => token,
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = typeof claims.email === "string" ? claims.email : undefined;
  // Burst limit per user, checked after the token so anonymous traffic can't use someone's budget.
  await enforceLimit(limit, claims.sub);
  return { userId: claims.sub, email, token, db };
}

/** Service-role client. Bypasses RLS: only for the payment webhook. */
export function adminDb(): SupabaseClient {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new HttpError(503, "Database admin access is not configured.", "db_disabled");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Creates the profile row on first use (free plan). Safe to call on every request. */
export async function ensureProfile(user: AuthedUser): Promise<void> {
  const { error } = await user.db.from("profiles").upsert({ user_id: user.userId, email: user.email ?? null, plan: "free" }, { onConflict: "user_id", ignoreDuplicates: true });
  if (error) throw new HttpError(500, "Could not load your account.", "profile_error");
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/** Wraps a route handler with uniform error responses. Never leaks internal error details. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) {
        const res = json({ error: e.message, code: e.code }, e.status);
        for (const [k, v] of Object.entries(e.headers ?? {})) res.headers.set(k, v);
        return res;
      }
      console.error("[api] unhandled", e);
      return json({ error: "Something went wrong on our side. Try again in a moment.", code: "internal" }, 500);
    }
  };
}

/** Reads and size-limits a JSON body. */
export async function readJson(req: Request, maxBytes = 1_000_000): Promise<unknown> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw new HttpError(413, "Request is too large.", "too_large");
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "Request is too large.", "too_large");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Request body must be JSON.", "bad_json");
  }
}

/** Maps Postgres errors raised by our SQL functions (plan_limit / credit_limit) to 402. */
export function dbError(error: { message?: string; code?: string } | null, fallback: string): never {
  const msg = error?.message ?? "";
  if (msg.startsWith("plan_limit:")) throw new HttpError(402, msg.replace("plan_limit: ", ""), "plan_limit");
  if (msg.startsWith("credit_limit:")) throw new HttpError(402, msg.replace("credit_limit: ", ""), "credit_limit");
  if (msg.startsWith("rate_limit:")) throw new HttpError(429, msg.replace("rate_limit: ", ""), "rate_limited", { "Retry-After": "60" });
  throw new HttpError(500, fallback, "db_error");
}
