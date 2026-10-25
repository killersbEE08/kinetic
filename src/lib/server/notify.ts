import "server-only";
import { createClerkClient } from "@clerk/nextjs/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { htmlEscape, SLACK_WEBHOOK_RX, slackEscape } from "@/lib/alerts";
import { config, env } from "./env";
import { background, logJson } from "./monitor";

// Alerts for deck owners: a row in `notifications` (the bell), plus email (Resend) and Slack
// when the owner turned them on. Sending happens after the response, so viewers never wait.

export interface Alert {
  kind: "link_opened" | "link_viewed" | "comment";
  ownerId: string;
  deckId: string;
  linkId?: string;
  sessionId?: number;
  title: string;
  body: string;
  /** In-app path, e.g. /d/<deck>?comments=1 */
  url: string;
}

interface Channels {
  /** Also send email and Slack (the bell always gets the alert). */
  push: boolean;
}

async function ownerEmail(db: SupabaseClient, ownerId: string): Promise<string | null> {
  const { data } = await db.from("profiles").select("email").eq("user_id", ownerId).maybeSingle();
  if (data?.email) return data.email as string;
  // Session tokens don't always carry the email; ask Clerk.
  if (!config.clerkEnabled()) return null;
  try {
    const u = await createClerkClient({ secretKey: env("CLERK_SECRET_KEY") }).users.getUser(ownerId);
    return u.primaryEmailAddress?.emailAddress ?? null;
  } catch {
    return null;
  }
}

async function sendEmail(to: string, a: Alert): Promise<void> {
  const key = env("RESEND_API_KEY");
  const from = env("ALERT_EMAIL_FROM");
  if (!key || !from) return;
  const link = `${config.appUrl()}${a.url}`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: a.title.slice(0, 150),
      text: `${a.title}\n\n${a.body}\n\nOpen in DeckIQ: ${link}\n\nTurn these emails off in Settings → Alerts.`,
      html: `<p style="font:600 16px system-ui">${htmlEscape(a.title)}</p><p style="font:14px system-ui;color:#444">${htmlEscape(a.body)}</p><p><a href="${htmlEscape(link)}" style="font:14px system-ui">Open in DeckIQ</a></p><p style="font:12px system-ui;color:#888">Turn these emails off in Settings → Alerts.</p>`,
    }),
  });
  if (!res.ok) logJson("warn", { event: "alert_email_failed", status: res.status });
}

async function sendSlack(url: string, a: Alert): Promise<void> {
  if (!SLACK_WEBHOOK_RX.test(url)) return;
  const link = `${config.appUrl()}${a.url}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: `*${slackEscape(a.title)}*\n${slackEscape(a.body)}\n<${link}|Open in DeckIQ>` }),
  });
  if (!res.ok) logJson("warn", { event: "alert_slack_failed", status: res.status });
}

/** Sends email and Slack for an alert, using the owner's settings. */
export async function pushAlert(db: SupabaseClient, a: Alert): Promise<void> {
  const { data: p } = await db.from("profiles").select("alert_email, alert_slack_url").eq("user_id", a.ownerId).maybeSingle();
  const jobs: Promise<void>[] = [];
  if (p?.alert_slack_url) jobs.push(sendSlack(p.alert_slack_url as string, a));
  if ((p?.alert_email ?? true) && env("RESEND_API_KEY")) {
    jobs.push(
      ownerEmail(db, a.ownerId).then((to) => {
        if (to) return sendEmail(to, a);
      }),
    );
  }
  await Promise.all(jobs);
}

/**
 * Records an alert for the owner (service-role client) and, when `push` is set, emails / posts
 * it to Slack in the background. A "viewed" summary replaces the "opened" alert of its session.
 */
export async function notifyOwner(db: SupabaseClient, a: Alert, ch: Channels): Promise<void> {
  const row = { user_id: a.ownerId, kind: a.kind, deck_id: a.deckId, link_id: a.linkId ?? null, session_id: a.sessionId ?? null, title: a.title.slice(0, 200), body: a.body.slice(0, 500), url: a.url };
  let error: { code?: string; message?: string } | null = null;
  if (a.kind === "link_viewed" && a.sessionId) {
    const r = await db.from("notifications").update({ ...row, read_at: null, created_at: new Date().toISOString() }).eq("session_id", a.sessionId).eq("user_id", a.ownerId).select("id");
    error = r.error;
    if (!error && !r.data?.length) error = (await db.from("notifications").insert(row)).error;
  } else {
    error = (await db.from("notifications").insert(row)).error;
  }
  if (error) logJson("warn", { event: "notification_insert_failed", code: error.code });
  if (ch.push) background(pushAlert(db, a));
}
