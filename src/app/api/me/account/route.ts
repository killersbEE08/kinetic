import { createClerkClient } from "@clerk/nextjs/server";
import { adminDb, dbError, handle, HttpError, json, readJson, requireUser } from "@/lib/server/auth";
import { env } from "@/lib/server/env";
import { assetBucket, deletePrefix } from "@/lib/server/storage";

// GET /api/me/account: everything we store about the signed-in user, as JSON (decks, photo list,
// AI usage). The browser adds the photo files themselves and saves it all as a ZIP.
export const GET = handle(async (req: Request) => {
  const user = await requireUser(req, "write");
  const [profile, decks, assets, usage] = await Promise.all([
    user.db.from("profiles").select("email, plan, plan_status, current_period_end, created_at").eq("user_id", user.userId).maybeSingle(),
    user.db.from("decks").select("id, title, doc, version, created_at, updated_at").is("deleted_at", null).order("updated_at", { ascending: false }),
    user.db.from("assets").select("id, name, alt, mime, bytes, width, height, created_at").order("created_at", { ascending: false }),
    user.db.from("ai_usage").select("task, model, credits, created_at").order("created_at", { ascending: false }).limit(5000),
  ]);
  for (const r of [profile, decks, assets, usage]) if (r.error) dbError(r.error, "Could not collect your data.");
  return json({
    exportedAt: new Date().toISOString(),
    userId: user.userId,
    profile: profile.data,
    decks: decks.data,
    photos: assets.data,
    aiUsage: usage.data,
  });
});

// DELETE /api/me/account: permanently deletes the account and everything in it.
// Order: photos (R2) → database rows → sign-in account, so a failure part-way can be retried.
export const DELETE = handle(async (req: Request) => {
  const user = await requireUser(req, "write");
  const body = (await readJson(req, 2_000)) as { confirm?: unknown };
  if (body?.confirm !== "DELETE") throw new HttpError(400, "Type DELETE to confirm.", "confirm_required");

  const { data: profile } = await user.db.from("profiles").select("plan, plan_status").eq("user_id", user.userId).maybeSingle();
  if (profile && profile.plan !== "free" && profile.plan_status === "active") {
    throw new HttpError(409, "Cancel your subscription on the Plans page first, then delete your account.", "subscription_active");
  }

  const bucket = assetBucket();
  if (bucket) await deletePrefix(bucket, `u/${user.userId}/`);

  // Rows the user owns are deleted as the user (RLS); usage and profile need the service role
  // because users can't delete their own billing history through the public API.
  const own = await Promise.all([user.db.from("assets").delete().eq("owner_id", user.userId), user.db.from("decks").delete().eq("owner_id", user.userId)]);
  for (const r of own) if (r.error) dbError(r.error, "Could not delete your decks.");
  const admin = adminDb();
  const sys = await Promise.all([admin.from("ai_usage").delete().eq("user_id", user.userId), admin.from("profiles").delete().eq("user_id", user.userId)]);
  for (const r of sys) if (r.error) dbError(r.error, "Could not delete your account record.");

  try {
    await createClerkClient({ secretKey: env("CLERK_SECRET_KEY") }).users.deleteUser(user.userId);
  } catch (e) {
    console.error("[account] Clerk delete failed", e);
    throw new HttpError(502, "Your decks and photos were deleted, but the sign-in account couldn't be removed. Try again in a minute.", "auth_delete_failed");
  }
  console.info(JSON.stringify({ event: "account_deleted" }));
  return json({ ok: true });
});
