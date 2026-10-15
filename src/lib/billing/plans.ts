// Maps Dodo Payments subscription events to the plan stored in `profiles`. Pure (testable).

export type Plan = "free" | "pro" | "team";

export interface SubscriptionPayload {
  subscription_id?: string;
  product_id?: string;
  status?: string;
  next_billing_date?: string | null;
  expires_at?: string | null;
  cancelled_at?: string | null;
  customer?: { customer_id?: string; email?: string };
  metadata?: Record<string, unknown>;
}

export interface ProfileUpdate {
  plan?: Plan;
  plan_status: string;
  dodo_subscription_id?: string;
  dodo_customer_id?: string;
  current_period_end?: string | null;
}

/** product id → plan, from env DODO_PRODUCT_PRO / DODO_PRODUCT_TEAM. */
export function planForProduct(productId: string | undefined, products: { pro?: string; team?: string }): Plan | null {
  if (!productId) return null;
  if (productId === products.pro) return "pro";
  if (productId === products.team) return "team";
  return null;
}

/**
 * Returns the profile update for a subscription event, or null if the event doesn't affect plans.
 * - active / renewed / plan_changed / updated(active): grant the plan for the product.
 * - past_due: keep the plan during Dodo's grace period.
 * - cancelled: keep the plan until the end of the paid period (current_period_end); the SQL
 *   function effective_plan() downgrades after that date.
 * - on_hold / expired / failed: back to free.
 */
export function profileUpdateFor(type: string, sub: SubscriptionPayload, products: { pro?: string; team?: string }): ProfileUpdate | null {
  if (!type.startsWith("subscription.")) return null;
  const plan = planForProduct(sub.product_id, products);
  const ids = {
    dodo_subscription_id: sub.subscription_id,
    dodo_customer_id: sub.customer?.customer_id,
  };
  const event = type.slice("subscription.".length);
  const status = sub.status ?? event;

  switch (event) {
    case "active":
    case "renewed":
    case "plan_changed":
    case "unpaused":
    case "updated":
      if (status === "active" && plan) return { ...ids, plan, plan_status: "active", current_period_end: sub.next_billing_date ?? null };
      if (status === "cancelled") return { ...ids, plan_status: "cancelled", current_period_end: sub.expires_at ?? sub.next_billing_date ?? null };
      if (["on_hold", "expired", "failed", "paused"].includes(status)) return { ...ids, plan: "free", plan_status: status };
      return null;
    case "past_due":
      return { ...ids, plan_status: "past_due" };
    case "cancelled":
      return { ...ids, plan_status: "cancelled", current_period_end: sub.expires_at ?? sub.next_billing_date ?? null };
    case "on_hold":
    case "expired":
    case "failed":
    case "paused":
      return { ...ids, plan: "free", plan_status: event };
    default:
      return null;
  }
}
