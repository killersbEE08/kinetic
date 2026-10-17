import { z } from "zod";
import { Deck, Id } from "@/lib/deck/schema";
import { dbError, handle, HttpError, json, readJson, requireUser } from "@/lib/server/auth";
import { takeSnapshot, toVersionMeta } from "@/lib/server/versions";

type Ctx = { params: Promise<{ id: string }> };

async function ownDeck(req: Request, ctx: Ctx, limit: "read" | "write") {
  const user = await requireUser(req, limit);
  const { id } = await ctx.params;
  if (!Id.safeParse(id).success) throw new HttpError(404, "Deck not found.", "not_found");
  return { user, id };
}

const COLS = "id, version, kind, label, created_at, title, slide_count";

// GET /api/decks/:id/versions — saved versions, newest first (no documents; fetch one by id).
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const { user, id } = await ownDeck(req, ctx, "read");
  const { data, error } = await user.db.from("deck_snapshots").select(COLS).eq("deck_id", id).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(200);
  if (error) dbError(error, "Could not load the version history.");
  return json({ versions: (data ?? []).map(toVersionMeta) });
});

const SaveBody = z.object({
  label: z.string().trim().max(80).optional(),
  kind: z.enum(["named", "before-restore"]).default("named"),
});

// POST /api/decks/:id/versions — save the deck as it is now (a named version, or "before restoring").
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { user, id } = await ownDeck(req, ctx, "write");
  const body = SaveBody.safeParse(await readJson(req, 4_000));
  if (!body.success) throw new HttpError(400, "Version names can be up to 80 characters.", "invalid_label");
  const { data, error } = await user.db.from("decks").select("doc, version").eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) dbError(error, "Could not load the deck.");
  if (!data) throw new HttpError(404, "Deck not found.", "not_found");
  const doc = { ...(data.doc as Deck), version: data.version };
  const label = body.data.kind === "named" ? body.data.label || null : null;
  const r = await takeSnapshot(user, id, doc, body.data.kind, label);
  if (r.missingTable) throw new HttpError(503, "Version history needs a database update on the server. Run the latest file in supabase/migrations.", "migration_needed");
  if (!r.ok) throw new HttpError(500, "Could not save the version.", "db_error");
  return json({ ok: true }, 201);
});
