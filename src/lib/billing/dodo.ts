import "server-only";
import { env } from "../server/env";
import { HttpError } from "../server/auth";
import type { Plan } from "./plans";

// Dodo Payments REST client (fetch only, Workers-friendly).

function baseUrl(): string {
  return env("DODO_PAYMENTS_ENVIRONMENT") === "live_mode" ? "https://live.dodopayments.com" : "https://test.dodopayments.com";
}

async function dodo<T>(path: string, init: { method: string; body?: unknown }): Promise<T> {
  const key = env("DODO_PAYMENTS_API_KEY");
  if (!key) throw new HttpError(503, "Payments are not configured yet.", "billing_disabled");
  const res = await fetch(baseUrl() + path, {
    method: init.method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string; code?: string };
  if (!res.ok) {
    console.error("[dodo]", path, res.status, data?.code, data?.message);
    throw new HttpError(502, "The payment provider returned an error. Try again in a moment.", "billing_error");
  }
  return data;
}

export function productIds() {
  return { pro: env("DODO_PRODUCT_PRO"), team: env("DODO_PRODUCT_TEAM") };
}

export async function createCheckout(opts: { plan: Exclude<Plan, "free">; userId: string; email?: string; returnUrl: string; cancelUrl: string; seats?: number }) {
  const productId = productIds()[opts.plan];
  if (!productId) throw new HttpError(503, `The ${opts.plan} plan is not set up yet.`, "billing_disabled");
  const body: Record<string, unknown> = {
    product_cart: [{ product_id: productId, quantity: opts.plan === "team" ? Math.max(1, Math.min(500, opts.seats ?? 1)) : 1 }],
    return_url: opts.returnUrl,
    cancel_url: opts.cancelUrl,
    // Read back by the webhook to find the user. Never trust the client for this.
    metadata: { user_id: opts.userId, plan: opts.plan },
  };
  if (opts.email) body.customer = { email: opts.email, name: opts.email.split("@")[0] };
  const session = await dodo<{ session_id: string; checkout_url?: string | null }>("/checkouts", { method: "POST", body });
  if (!session.checkout_url) throw new HttpError(502, "The payment provider did not return a checkout link.", "billing_error");
  return session.checkout_url;
}

export async function createPortalLink(customerId: string, returnUrl: string): Promise<string> {
  const q = new URLSearchParams({ return_url: returnUrl });
  const r = await dodo<{ link: string }>(`/customers/${encodeURIComponent(customerId)}/customer-portal/session?${q}`, { method: "POST" });
  return r.link;
}
