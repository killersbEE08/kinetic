import { handle, json, requireUser, ensureProfile } from "@/lib/server/auth";
import { config } from "@/lib/server/env";
import { assetBucket } from "@/lib/server/storage";

// GET /api/me — plan, AI credits left this month, photo storage use, and which services are configured.
export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  await ensureProfile(user);
  const storageOn = !!assetBucket();
  const [{ data: profile }, { data: plan }, { data: credits }, { count }, usage] = await Promise.all([
    user.db.from("profiles").select("plan_status, current_period_end, dodo_customer_id").eq("user_id", user.userId).maybeSingle(),
    user.db.rpc("my_plan"),
    user.db.rpc("ai_credits_remaining"),
    user.db.from("decks").select("id", { count: "exact", head: true }).is("deleted_at", null),
    // Older databases may not have the assets migration yet; treat that as "no usage data".
    storageOn ? user.db.rpc("my_asset_usage").then((r) => r, () => ({ data: null })) : Promise.resolve({ data: null }),
  ]);
  const u = Array.isArray(usage.data) ? (usage.data[0] as { used_bytes: number; limit_bytes: number; asset_count: number } | undefined) : undefined;
  return json({
    userId: user.userId,
    plan: typeof plan === "string" ? plan : "free",
    planStatus: profile?.plan_status ?? "none",
    currentPeriodEnd: profile?.current_period_end ?? null,
    hasBillingAccount: !!profile?.dodo_customer_id,
    creditsRemaining: typeof credits === "number" ? credits : null,
    deckCount: count ?? 0,
    features: { gemini: config.geminiEnabled(), billing: config.dodoEnabled(), storage: storageOn },
    storage: u ? { usedBytes: Number(u.used_bytes), limitBytes: Number(u.limit_bytes), count: u.asset_count } : undefined,
  });
});
