import { z } from "zod";
import { adminDb, handle, HttpError, json, readJson } from "@/lib/server/auth";
import { env } from "@/lib/server/env";
import { clientIp, enforceLimit } from "@/lib/server/limits";
import { background, logJson } from "@/lib/server/monitor";
import { SHARE_ID_RX, viewerHash } from "@/lib/server/share";
import { requireHuman } from "@/lib/server/turnstile";
import { UUID_RX } from "@/lib/server/comments";
import { htmlEscape } from "@/lib/alerts";
import { ABUSE_REASONS } from "@/lib/abuse";

const Body = z.object({
  /** A link id, or a full /v/<id> URL pasted into the report page. */
  link: z.string().trim().min(16).max(300),
  kind: z.enum(["deck", "comment"]).default("deck"),
  commentId: z.string().regex(UUID_RX).optional(),
  reason: z.enum(ABUSE_REASONS),
  details: z.string().trim().max(1000).default(""),
  email: z.string().trim().email().max(200).optional(),
  captcha: z.string().max(2048).optional(),
});

/** Same person reporting the same thing twice in a day counts once. */
const DUP_WINDOW_MS = 24 * 3_600_000;

async function emailTeam(subject: string, text: string) {
  const key = env("RESEND_API_KEY");
  const from = env("ALERT_EMAIL_FROM");
  const to = env("ABUSE_REPORT_EMAIL");
  if (!key || !from || !to) return;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject: subject.slice(0, 150), text, html: `<pre style="font:13px ui-monospace,monospace;white-space:pre-wrap">${htmlEscape(text)}</pre>` }),
  });
  if (!res.ok) logJson("warn", { event: "abuse_email_failed", status: res.status });
}

// POST /api/abuse: report a shared deck or a comment on it (public, no account). Reported
// comments are hidden from other viewers at once; deck reports go to the DeckIQ team, who can
// take the link down (README → "Abuse reports").
export const POST = handle(async (req: Request) => {
  const ip = clientIp(req);
  await enforceLimit("anon", ip);
  const body = Body.safeParse(await readJson(req, 6_000));
  if (!body.success) throw new HttpError(400, "Choose a reason and check the link.", "invalid_input");
  const b = body.data;
  await requireHuman(b.captcha, ip, "report");

  const linkId = b.link.match(/\/v\/([A-Za-z0-9_-]{16,40})/)?.[1] ?? b.link;
  if (!SHARE_ID_RX.test(linkId)) throw new HttpError(400, "That isn't a DeckIQ share link.", "invalid_link");
  if (b.kind === "comment" && !b.commentId) throw new HttpError(400, "Which comment?", "invalid_input");

  const db = adminDb();
  const { data: link } = await db.from("share_links").select("id, deck_id, owner_id").eq("id", linkId).maybeSingle();
  if (!link) throw new HttpError(404, "We couldn't find that link. Check it and try again.", "not_found");
  if (b.commentId) {
    const { data: c } = await db.from("comments").select("id").eq("id", b.commentId).eq("link_id", linkId).maybeSingle();
    if (!c) throw new HttpError(404, "That comment was already removed.", "not_found");
  }

  const hash = await viewerHash(ip, req.headers.get("user-agent") ?? "");
  const since = new Date(Date.now() - DUP_WINDOW_MS).toISOString();
  let dup = db.from("abuse_reports").select("id", { count: "exact", head: true }).eq("link_id", linkId).eq("reporter_hash", hash).eq("kind", b.kind).gt("created_at", since);
  if (b.commentId) dup = dup.eq("comment_id", b.commentId);
  const { count, error: dErr } = await dup;
  if (dErr && (dErr.code === "PGRST205" || dErr.code === "42P01")) throw new HttpError(503, "Reports aren't set up on this server yet. Email the address on the report page instead.", "migration_needed");
  if (count) return json({ ok: true, duplicate: true });

  const { error } = await db.from("abuse_reports").insert({ link_id: linkId, deck_id: link.deck_id, owner_id: link.owner_id, kind: b.kind, comment_id: b.commentId ?? null, reason: b.reason, details: b.details, reporter_email: b.email ?? null, reporter_hash: hash });
  if (error) {
    logJson("error", { event: "abuse_insert_failed", code: error.code });
    throw new HttpError(500, "The report couldn't be saved. Try again.", "db_error");
  }
  logJson("warn", { event: "abuse_report", kind: b.kind, reason: b.reason, link: linkId });
  if (b.kind === "deck") {
    background(emailTeam(`Abuse report (${b.reason}): ${linkId}`, `Kind: deck\nReason: ${b.reason}\nLink: ${linkId}\nDeck: ${link.deck_id}\nOwner: ${link.owner_id}\nReporter: ${b.email ?? "(no email)"}\n\n${b.details}\n\nTake it down:\ninsert into blocked_links (link_id, reason) values ('${linkId}', '${b.reason}');`));
  }
  return json({ ok: true }, 201);
});
