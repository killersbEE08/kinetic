import { adminDb, json } from "@/lib/server/auth";
import { env } from "@/lib/server/env";
import { verifyWebhook } from "@/lib/billing/webhook";
import { profileUpdateFor, type SubscriptionPayload } from "@/lib/billing/plans";
import { productIds } from "@/lib/billing/dodo";

// POST /api/webhooks/dodo — Dodo Payments webhook (Standard Webhooks).
// Public endpoint: authenticity comes only from the signature check below.
export async function POST(req: Request): Promise<Response> {
  const secret = env("DODO_PAYMENTS_WEBHOOK_KEY");
  if (!secret) return json({ error: "not configured" }, 503);

  const raw = await req.text(); // raw body: must not be re-serialized before verification
  if (raw.length > 1_000_000) return json({ error: "too large" }, 413);
  const headers = {
    id: req.headers.get("webhook-id"),
    timestamp: req.headers.get("webhook-timestamp"),
    signature: req.headers.get("webhook-signature"),
  };
  const verified = await verifyWebhook(secret, headers, raw);
  if (!verified.ok) {
    console.warn("[dodo webhook] rejected:", verified.reason);
    return json({ error: "invalid signature" }, 401);
  }

  let event: { type?: string; data?: SubscriptionPayload & { payload_type?: string } };
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ error: "bad json" }, 400);
  }
  const type = String(event.type ?? "");
  const db = adminDb();

  // Idempotency: retries reuse the same webhook-id.
  const { error: dupErr } = await db.from("webhook_events").insert({ id: headers.id, type, payload: event });
  if (dupErr) {
    if (dupErr.code === "23505") return json({ received: true, duplicate: true });
    console.error("[dodo webhook] log insert failed", dupErr.message);
    return json({ error: "storage" }, 500); // 5xx → Dodo retries
  }

  try {
    const sub = event.data ?? {};
    const update = profileUpdateFor(type, sub, productIds());
    if (update) {
      const userId = typeof sub.metadata?.user_id === "string" ? sub.metadata.user_id : null;
      let query = db.from("profiles").update(update);
      if (userId) query = query.eq("user_id", userId);
      else if (sub.subscription_id) query = query.eq("dodo_subscription_id", sub.subscription_id);
      else if (sub.customer?.customer_id) query = query.eq("dodo_customer_id", sub.customer.customer_id);
      else {
        console.warn("[dodo webhook] no way to match user for", type);
        return json({ received: true, matched: false });
      }
      const { data: matched, error } = await query.select("user_id");
      if (error) throw error;
      if (!matched?.length) console.warn("[dodo webhook] no profile matched for", type, sub.subscription_id);
    }
    return json({ received: true });
  } catch (e) {
    // Allow Dodo to retry: remove the idempotency row so the retry is processed.
    await db.from("webhook_events").delete().eq("id", headers.id);
    console.error("[dodo webhook] processing failed", e);
    return json({ error: "processing failed" }, 500);
  }
}
