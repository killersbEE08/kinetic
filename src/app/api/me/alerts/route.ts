import { z } from "zod";
import { dbError, ensureProfile, handle, HttpError, json, readJson, requireUser } from "@/lib/server/auth";
import { env } from "@/lib/server/env";
import { pushAlert } from "@/lib/server/notify";
import { SLACK_WEBHOOK_RX } from "@/lib/alerts";

// GET /api/me/alerts: how share-link alerts reach you. The Slack URL is shown masked.
export const GET = handle(async (req: Request) => {
  const user = await requireUser(req, "read");
  await ensureProfile(user);
  const { data, error } = await user.db.from("profiles").select("alert_email, alert_slack_url").eq("user_id", user.userId).maybeSingle();
  if (error) dbError(error, "Could not load your alert settings.");
  const slack = (data?.alert_slack_url as string | null) ?? null;
  return json({ email: data?.alert_email ?? true, emailAvailable: !!env("RESEND_API_KEY") && !!env("ALERT_EMAIL_FROM"), slack: !!slack, slackHint: slack ? `…${slack.slice(-6)}` : null });
});

const Put = z.object({
  email: z.boolean().optional(),
  /** null removes the Slack webhook. */
  slackUrl: z.string().trim().regex(SLACK_WEBHOOK_RX).nullable().optional(),
});

// PUT /api/me/alerts
export const PUT = handle(async (req: Request) => {
  const user = await requireUser(req, "write");
  await ensureProfile(user);
  const body = Put.safeParse(await readJson(req, 2_000));
  if (!body.success) throw new HttpError(400, "That isn't a Slack incoming webhook URL. It starts with https://hooks.slack.com/services/.", "invalid_input");
  const update: Record<string, unknown> = {};
  if (body.data.email !== undefined) update.alert_email = body.data.email;
  if (body.data.slackUrl !== undefined) update.alert_slack_url = body.data.slackUrl;
  if (!Object.keys(update).length) throw new HttpError(400, "Nothing to change.", "no_change");
  const { error } = await user.db.from("profiles").update(update).eq("user_id", user.userId);
  if (error) dbError(error, "Could not save your alert settings.");
  return json({ ok: true });
});

// POST /api/me/alerts: sends a test alert to your email and Slack.
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req, "write");
  // pushAlert reads only your own profile row, which RLS allows.
  await pushAlert(user.db, { kind: "link_opened", ownerId: user.userId, deckId: "test", title: "Test alert from Kinetic", body: "Share-link alerts will look like this.", url: "/settings" });
  return json({ ok: true });
});
