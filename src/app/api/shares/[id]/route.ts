import { z } from "zod";
import type { Deck } from "@/lib/deck/schema";
import { dbError, handle, HttpError, json, readJson, requireUser } from "@/lib/server/auth";
import { hashPassword, LINK_COLS, publicLink, SHARE_ID_RX, snapshotOf, type LinkRow } from "@/lib/server/share";

type Ctx = { params: Promise<{ id: string }> };

async function linkId(ctx: Ctx) {
  const { id } = await ctx.params;
  if (!SHARE_ID_RX.test(id)) throw new HttpError(404, "Link not found.", "not_found");
  return id;
}

const Patch = z.object({
  name: z.string().trim().max(80).optional(),
  password: z.string().min(4).max(100).nullable().optional(), // null removes it
  allowDownload: z.boolean().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  revoked: z.boolean().optional(),
  /** Replace the snapshot with the deck as it is now. */
  refresh: z.boolean().optional(),
});

// PATCH /api/shares/:id: change settings, turn off/on, or update to the latest version of the deck.
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req, "write");
  const id = await linkId(ctx);
  const body = Patch.safeParse(await readJson(req, 4_000));
  if (!body.success) throw new HttpError(400, "Check the link settings (passwords need at least 4 characters).", "invalid_input");
  const { data: link, error } = await user.db.from("share_links").select("id, deck_id").eq("id", id).maybeSingle();
  if (error) dbError(error, "Could not load the link.");
  if (!link) throw new HttpError(404, "Link not found.", "not_found");
  const b = body.data;
  const update: Record<string, unknown> = {};
  if (b.name !== undefined) update.name = b.name;
  if (b.allowDownload !== undefined) update.allow_download = b.allowDownload;
  if (b.expiresAt !== undefined) update.expires_at = b.expiresAt;
  if (b.revoked !== undefined) update.revoked_at = b.revoked ? new Date().toISOString() : null;
  if (b.password !== undefined) update.password_hash = b.password ? await hashPassword(b.password) : null;
  if (b.refresh) {
    const { data: deck, error: dErr } = await user.db.from("decks").select("doc, version").eq("id", link.deck_id).is("deleted_at", null).maybeSingle();
    if (dErr) dbError(dErr, "Could not load the deck.");
    if (!deck) throw new HttpError(404, "The deck for this link was deleted.", "not_found");
    update.snapshot = snapshotOf(deck.doc as Deck);
    update.snapshot_version = deck.version;
  }
  if (!Object.keys(update).length) throw new HttpError(400, "Nothing to change.", "no_change");
  const { data, error: uErr } = await user.db.from("share_links").update(update).eq("id", id).select(LINK_COLS).single();
  if (uErr) dbError(uErr, "Could not update the link.");
  return json({ link: publicLink(data as Omit<LinkRow, "snapshot" | "owner_id">) });
});

// DELETE /api/shares/:id: removes the link and its view history.
export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req, "write");
  const id = await linkId(ctx);
  const { data, error } = await user.db.from("share_links").delete().eq("id", id).select("id");
  if (error) dbError(error, "Could not delete the link.");
  if (!data?.length) throw new HttpError(404, "Link not found.", "not_found");
  return json({ ok: true });
});
