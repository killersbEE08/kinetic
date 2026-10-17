import { z } from "zod";
import { adminDb, handle, HttpError, json, optionalUserId, readJson } from "@/lib/server/auth";
import { clientIp, enforceLimit } from "@/lib/server/limits";
import { background } from "@/lib/server/monitor";
import { notifyOwner } from "@/lib/server/notify";
import { openedAlert } from "@/lib/alerts";
import { BLOCKED_MESSAGE, deckDeleted, deviceOf, linkBlocked, linkLive, SHARE_ID_RX, sessionToken, verifyPassword, viewerHash, type LinkRow } from "@/lib/server/share";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  password: z.string().max(100).optional(),
  email: z.string().trim().email().max(200).optional(),
});

/** A reload by the same viewer within this window doesn't send another "opened" alert. */
const REOPEN_QUIET_MS = 30 * 60_000;

type OpenRow = Pick<LinkRow, "id" | "deck_id" | "owner_id" | "name" | "snapshot" | "password_hash" | "allow_download" | "allow_comments" | "notify" | "expires_at" | "revoked_at">;

// POST /api/v/:id: open a shared deck (public). Checks the link is live and the password, starts a
// view session, and returns the snapshot plus a signed token for time beats, photos and comments.
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  if (!SHARE_ID_RX.test(id)) throw new HttpError(404, "This link doesn't exist.", "not_found");
  const ip = clientIp(req);
  await enforceLimit("anon", ip);
  const body = Body.safeParse(await readJson(req, 2_000));
  if (!body.success) throw new HttpError(400, "Check the email address.", "invalid_input");

  const db = adminDb();
  const { data, error } = await db.from("share_links").select("id, deck_id, owner_id, name, snapshot, password_hash, allow_download, allow_comments, notify, expires_at, revoked_at, decks!inner(deleted_at)").eq("id", id).maybeSingle();
  if (error) {
    console.error("[share] load", error.message);
    throw new HttpError(500, "This deck couldn't be loaded. Try again.", "db_error");
  }
  const link = data as OpenRow | null;
  if (!link) throw new HttpError(404, "This link doesn't exist.", "not_found");
  // Links stop working while their deck is in Trash, and start again if it is restored.
  if (deckDeleted(data)) throw new HttpError(410, "The owner deleted this deck.", "link_closed");
  if (!linkLive(link)) throw new HttpError(410, link.revoked_at ? "The owner turned this link off." : "This link has expired.", "link_closed");
  if (link.password_hash) {
    if (!body.data.password) throw new HttpError(401, "This deck is protected with a password.", "password_required");
    if (!(await verifyPassword(body.data.password, link.password_hash))) throw new HttpError(403, "That password isn't right.", "password_wrong");
  }
  if (await linkBlocked(db, id)) throw new HttpError(410, BLOCKED_MESSAGE, "link_blocked");

  // The owner opening their own link (signed in): no view is counted and no alert is sent.
  const ownerPreview = (await optionalUserId(req)) === link.owner_id;
  if (ownerPreview) {
    return json({ deck: link.snapshot, name: link.name, allowDownload: link.allow_download, allowComments: !!link.allow_comments, ownerPreview: true, token: await sessionToken(id, 0) });
  }

  const ua = req.headers.get("user-agent") ?? "";
  const country = req.headers.get("cf-ipcountry") ?? null;
  const hash = await viewerHash(ip, ua);
  const device = deviceOf(ua);
  const { data: session, error: sErr } = await db
    .from("view_sessions")
    .insert({ link_id: id, viewer_hash: hash, viewer_email: body.data.email ?? null, country: country && /^[A-Z]{2}$/.test(country) ? country : null, device })
    .select("id")
    .single();
  if (sErr) console.error("[share] session", sErr.message); // viewing still works without analytics

  if (session && link.notify !== false) {
    background(
      (async () => {
        const since = new Date(Date.now() - REOPEN_QUIET_MS).toISOString();
        const { count } = await db.from("view_sessions").select("id", { count: "exact", head: true }).eq("link_id", id).eq("viewer_hash", hash).gt("started_at", since).neq("id", session.id);
        if (count) return;
        const title = (link.snapshot as { title?: string } | null)?.title ?? "";
        const text = openedAlert({ linkName: link.name, email: body.data.email, deckTitle: title, device });
        await notifyOwner(db, { kind: "link_opened", ownerId: link.owner_id, deckId: link.deck_id, linkId: id, sessionId: session.id, ...text, url: "/shared" }, { push: false });
      })(),
    );
  }

  return json({
    deck: link.snapshot,
    name: link.name,
    allowDownload: link.allow_download,
    allowComments: !!link.allow_comments,
    token: session ? await sessionToken(id, session.id) : null,
  });
});
