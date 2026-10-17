import { z } from "zod";
import { Deck, Id } from "@/lib/deck/schema";
import { applyDeckPatch, PatchError, type PatchOp } from "@/lib/deck/patch";
import { dbError, handle, HttpError, json, readJson, requireUser } from "@/lib/server/auth";
import { snapshotBefore } from "@/lib/deck/versions";
import { takeSnapshot } from "@/lib/server/versions";

type Ctx = { params: Promise<{ id: string }> };

async function deckId(ctx: Ctx) {
  const { id } = await ctx.params;
  if (!Id.safeParse(id).success) throw new HttpError(404, "Deck not found.", "not_found");
  return id;
}

// GET /api/decks/:id
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req, "read");
  const id = await deckId(ctx);
  const { data, error } = await user.db.from("decks").select("doc, version").eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) dbError(error, "Could not load the deck.");
  if (!data) throw new HttpError(404, "Deck not found.", "not_found");
  return json({ deck: { ...(data.doc as Deck), version: data.version } });
});

const Op = z.union([
  z.object({ op: z.enum(["add", "replace", "test"]), path: z.string().max(200), value: z.unknown() }),
  z.object({ op: z.literal("remove"), path: z.string().max(200) }),
  z.object({ op: z.enum(["move", "copy"]), from: z.string().max(200), path: z.string().max(200) }),
]);
const PatchBody = z.object({
  version: z.number().int().min(0),
  ops: z.array(Op).min(1).max(500),
  author: z.enum(["user", "ai"]).default("user"),
});

// PATCH /api/decks/:id — apply JSON Patch ops with optimistic concurrency. 409 on version conflict.
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req, "write");
  const id = await deckId(ctx);
  const body = PatchBody.safeParse(await readJson(req, 2_000_000));
  if (!body.success) throw new HttpError(400, "That change is not valid.", "invalid_patch");

  const { data, error } = await user.db.from("decks").select("doc, version").eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) dbError(error, "Could not load the deck.");
  if (!data) throw new HttpError(404, "Deck not found.", "not_found");
  if (data.version !== body.data.version) {
    return json({ error: "This deck changed in another tab. Reload to get the latest version.", code: "conflict", version: data.version }, 409);
  }

  let next: Deck;
  try {
    next = applyDeckPatch({ ...(data.doc as Deck), version: data.version }, body.data.ops as PatchOp[]).doc;
  } catch (e) {
    throw new HttpError(422, e instanceof PatchError ? e.message : "That change could not be applied.", "patch_failed");
  }
  const version = data.version + 1;
  next = { ...next, version };

  // Keep a restorable copy of the deck as it was before AI edits, and every 25 saves.
  const kind = snapshotBefore(data.version, body.data.author);
  if (kind) await takeSnapshot(user, id, { ...(data.doc as Deck), version: data.version }, kind);

  // Conditional update: only succeeds if nobody else committed in between.
  const { data: updated, error: upErr } = await user.db
    .from("decks")
    .update({ doc: next, version, title: next.title, theme_id: next.themeId })
    .eq("id", id)
    .eq("version", data.version)
    .select("version");
  if (upErr) dbError(upErr, "Could not save the change.");
  if (!updated?.length) return json({ error: "This deck changed in another tab. Reload to get the latest version.", code: "conflict" }, 409);

  await user.db.from("deck_versions").insert({ deck_id: id, version, patch: body.data.ops, author_type: body.data.author, author_id: user.userId });
  return json({ version });
});

// DELETE /api/decks/:id — moves the deck to Trash. ?permanent=1 deletes a deck that is already in Trash.
export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req, "write");
  const id = await deckId(ctx);
  if (new URL(req.url).searchParams.get("permanent") === "1") {
    const { data, error } = await user.db.from("decks").delete().eq("id", id).not("deleted_at", "is", null).select("id");
    if (error) dbError(error, "Could not delete the deck.");
    if (!data?.length) throw new HttpError(404, "That deck isn't in Trash.", "not_found");
    return json({ ok: true });
  }
  const { error } = await user.db.from("decks").update({ deleted_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null);
  if (error) dbError(error, "Could not delete the deck.");
  return json({ ok: true });
});
