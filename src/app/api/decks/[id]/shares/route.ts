import { z } from "zod";
import { Id, type Deck } from "@/lib/deck/schema";
import { dbError, ensureProfile, handle, HttpError, json, readJson, requireUser } from "@/lib/server/auth";
import { hashPassword, newShareId, publicLink, snapshotOf, LINK_COLS as COLS, type LinkRow } from "@/lib/server/share";
import { recordEvent } from "@/lib/server/events";

type Ctx = { params: Promise<{ id: string }> };


async function deckId(ctx: Ctx) {
  const { id } = await ctx.params;
  if (!Id.safeParse(id).success) throw new HttpError(404, "Deck not found.", "not_found");
  return id;
}

// GET /api/decks/:id/shares: this deck's links with view counts.
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req, "read");
  const id = await deckId(ctx);
  const { data, error } = await user.db.from("share_links").select(COLS).eq("deck_id", id).order("created_at", { ascending: false });
  if (error) dbError(error, "Could not load share links.");
  const links = (data ?? []) as Omit<LinkRow, "snapshot" | "owner_id">[];
  const ids = links.map((l) => l.id);
  const { data: sessions, error: sErr } = ids.length ? await user.db.from("view_sessions").select("link_id, viewer_hash, total_ms, last_seen_at").in("link_id", ids).limit(5000) : { data: [], error: null };
  if (sErr) dbError(sErr, "Could not load view counts.");
  return json({
    links: links.map((l) => {
      const s = (sessions ?? []).filter((x) => x.link_id === l.id);
      return publicLink(l, { views: s.length, viewers: new Set(s.map((x) => x.viewer_hash)).size, totalMs: s.reduce((n, x) => n + (x.total_ms ?? 0), 0), lastViewedAt: s.map((x) => x.last_seen_at).sort().at(-1) ?? null });
    }),
  });
});

const Create = z.object({
  name: z.string().trim().max(80).default(""),
  password: z.string().min(4).max(100).optional(),
  allowDownload: z.boolean().default(false),
  allowComments: z.boolean().default(false),
  notify: z.boolean().default(true),
  expiresAt: z.string().datetime().optional(),
});

// POST /api/decks/:id/shares: new link with a snapshot of the deck as it is now.
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req, "write");
  await ensureProfile(user);
  const id = await deckId(ctx);
  const body = Create.safeParse(await readJson(req, 4_000));
  if (!body.success) throw new HttpError(400, "Check the link settings (passwords need at least 4 characters).", "invalid_input");
  const { data: deck, error } = await user.db.from("decks").select("doc, version").eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) dbError(error, "Could not load the deck.");
  if (!deck) throw new HttpError(404, "Deck not found.", "not_found");
  if (body.data.expiresAt && new Date(body.data.expiresAt).getTime() <= Date.now()) throw new HttpError(400, "The expiry date must be in the future.", "invalid_expiry");
  const row = {
    id: newShareId(),
    deck_id: id,
    owner_id: user.userId,
    name: body.data.name,
    snapshot: snapshotOf(deck.doc as Deck),
    snapshot_version: deck.version,
    password_hash: body.data.password ? await hashPassword(body.data.password) : null,
    allow_download: body.data.allowDownload,
    allow_comments: body.data.allowComments,
    notify: body.data.notify,
    expires_at: body.data.expiresAt ?? null,
  };
  const { data, error: insErr } = await user.db.from("share_links").insert(row).select(COLS).single();
  if (insErr) dbError(insErr, "Could not create the link.");
  await recordEvent(user, "deck_shared", id, { password: !!row.password_hash, comments: row.allow_comments, expires: !!row.expires_at });
  return json({ link: publicLink(data as Omit<LinkRow, "snapshot" | "owner_id">) }, 201);
});
