import { Id } from "@/lib/deck/schema";
import { dbError, handle, HttpError, json, requireUser } from "@/lib/server/auth";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/decks/:id/restore — takes a deck out of Trash. The Free plan's deck limit applies (402).
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req, "write");
  const { id } = await ctx.params;
  if (!Id.safeParse(id).success) throw new HttpError(404, "Deck not found.", "not_found");
  const { data, error } = await user.db.from("decks").update({ deleted_at: null }).eq("id", id).not("deleted_at", "is", null).select("id");
  if (error) dbError(error, "Could not restore the deck.");
  if (!data?.length) throw new HttpError(404, "That deck isn't in Trash.", "not_found");
  return json({ ok: true });
});
