import { z } from "zod";
import { Deck, Id } from "@/lib/deck/schema";
import { dbError, handle, HttpError, json, readJson, requireUser } from "@/lib/server/auth";

type Ctx = { params: Promise<{ id: string; vid: string }> };

async function parse(req: Request, ctx: Ctx, limit: "read" | "write") {
  const user = await requireUser(req, limit);
  const { id, vid } = await ctx.params;
  if (!Id.safeParse(id).success || !/^\d{1,18}$/.test(vid)) throw new HttpError(404, "Version not found.", "not_found");
  return { user, id, vid: Number(vid) };
}

// GET /api/decks/:id/versions/:vid — the deck document of one saved version.
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const { user, id, vid } = await parse(req, ctx, "read");
  const { data, error } = await user.db.from("deck_snapshots").select("doc").eq("deck_id", id).eq("id", vid).maybeSingle();
  if (error) dbError(error, "Could not load that version.");
  if (!data) throw new HttpError(404, "Version not found.", "not_found");
  const parsed = Deck.safeParse(data.doc);
  if (!parsed.success) throw new HttpError(422, "That version can't be opened with this version of DeckIQ.", "invalid_version");
  return json({ deck: parsed.data });
});

const RenameBody = z.object({ label: z.string().trim().min(1).max(80) });

// PATCH /api/decks/:id/versions/:vid — name a version. Named versions are kept until deleted.
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { user, id, vid } = await parse(req, ctx, "write");
  const body = RenameBody.safeParse(await readJson(req, 4_000));
  if (!body.success) throw new HttpError(400, "Give the version a name of up to 80 characters.", "invalid_label");
  const { data, error } = await user.db.from("deck_snapshots").update({ label: body.data.label, kind: "named" }).eq("deck_id", id).eq("id", vid).select("id");
  if (error) dbError(error, "Could not rename the version.");
  if (!data?.length) throw new HttpError(404, "Version not found.", "not_found");
  return json({ ok: true });
});

// DELETE /api/decks/:id/versions/:vid
export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const { user, id, vid } = await parse(req, ctx, "write");
  const { error } = await user.db.from("deck_snapshots").delete().eq("deck_id", id).eq("id", vid);
  if (error) dbError(error, "Could not delete the version.");
  return json({ ok: true });
});
