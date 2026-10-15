import { describe, expect, it } from "vitest";
import { signWebhook, verifyWebhook } from "./webhook";
import { profileUpdateFor } from "./plans";

// A valid-format test secret (base64 of "kinetic-test-secret-0123456789ab").
const SECRET = "whsec_" + btoa("kinetic-test-secret-0123456789ab");

describe("webhook signature", () => {
  const body = JSON.stringify({ type: "subscription.active", data: { subscription_id: "sub_1" } });
  const now = 1_760_000_000;

  it("accepts a correctly signed payload", async () => {
    const sig = await signWebhook(SECRET, "msg_1", String(now), body);
    const r = await verifyWebhook(SECRET, { id: "msg_1", timestamp: String(now), signature: `v1,${sig}` }, body, now);
    expect(r.ok).toBe(true);
  });

  it("accepts when one of several signatures matches", async () => {
    const sig = await signWebhook(SECRET, "msg_1", String(now), body);
    const r = await verifyWebhook(SECRET, { id: "msg_1", timestamp: String(now), signature: `v1,AAAA v1,${sig}` }, body, now);
    expect(r.ok).toBe(true);
  });

  it("rejects a tampered body, wrong id, stale timestamp, and missing headers", async () => {
    const sig = await signWebhook(SECRET, "msg_1", String(now), body);
    const h = { id: "msg_1", timestamp: String(now), signature: `v1,${sig}` };
    expect((await verifyWebhook(SECRET, h, body.replace("sub_1", "sub_2"), now)).ok).toBe(false);
    expect((await verifyWebhook(SECRET, { ...h, id: "msg_2" }, body, now)).ok).toBe(false);
    expect((await verifyWebhook(SECRET, h, body, now + 301)).ok).toBe(false);
    expect((await verifyWebhook(SECRET, { ...h, signature: null }, body, now)).ok).toBe(false);
  });
});

describe("plan mapping", () => {
  const products = { pro: "pdt_pro", team: "pdt_team" };

  it("activates the plan for the purchased product", () => {
    const u = profileUpdateFor("subscription.active", { product_id: "pdt_pro", status: "active", subscription_id: "sub_1", next_billing_date: "2026-11-14T00:00:00Z", customer: { customer_id: "cus_1" } }, products);
    expect(u).toMatchObject({ plan: "pro", plan_status: "active", dodo_subscription_id: "sub_1", dodo_customer_id: "cus_1" });
  });

  it("keeps access after cancel until the period ends, drops it on hold/expiry", () => {
    expect(profileUpdateFor("subscription.cancelled", { product_id: "pdt_team", next_billing_date: "2026-11-14T00:00:00Z" }, products)).toEqual(
      expect.objectContaining({ plan_status: "cancelled", current_period_end: "2026-11-14T00:00:00Z" }),
    );
    expect(profileUpdateFor("subscription.cancelled", {}, products)?.plan).toBeUndefined();
    expect(profileUpdateFor("subscription.on_hold", {}, products)?.plan).toBe("free");
    expect(profileUpdateFor("subscription.expired", {}, products)?.plan).toBe("free");
  });

  it("ignores unknown products and non-subscription events", () => {
    expect(profileUpdateFor("subscription.active", { product_id: "pdt_other", status: "active" }, products)).toBeNull();
    expect(profileUpdateFor("payment.succeeded", {}, products)).toBeNull();
  });
});
