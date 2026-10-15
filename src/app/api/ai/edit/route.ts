import { z } from "zod";
import { Deck, Id } from "@/lib/deck/schema";
import { handle, HttpError, json, readJson, requireUser } from "@/lib/server/auth";
import { proposeEdit } from "@/lib/ai/server";
import { EditError } from "@/lib/ai/edit";
import { PatchError } from "@/lib/deck/patch";

const Scope = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("deck") }),
  z.object({ kind: z.literal("slide"), slideIds: z.array(Id).min(1).max(20) }),
  z.object({ kind: z.literal("element"), slideId: Id, elementIds: z.array(Id).min(1).max(20) }),
]);

const Body = z.object({
  deck: Deck,
  scope: Scope,
  instruction: z.string().trim().min(2).max(1000),
});

// POST /api/ai/edit — scoped AI edit. Returns a *proposal* (patch ops + summary); nothing is saved
// until the client accepts and commits it through PATCH /api/decks/:id with author "ai".
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req);
  const body = Body.safeParse(await readJson(req, 2_500_000));
  if (!body.success) throw new HttpError(400, "That request is not valid.", "invalid_input");
  try {
    const p = await proposeEdit(user, body.data.deck, body.data.scope, body.data.instruction);
    return json({ summary: p.summary, ops: p.ops, issues: p.issues, changedSlideIds: p.changedSlideIds, engine: p.engine });
  } catch (e) {
    if (e instanceof EditError || e instanceof PatchError) throw new HttpError(422, e.message, "edit_rejected");
    throw e;
  }
});
