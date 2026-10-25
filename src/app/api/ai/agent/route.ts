import { z } from "zod";
import { Deck, Id } from "@/lib/deck/schema";
import { handle, HttpError, json, readJson, requireUser } from "@/lib/server/auth";
import { proposeAgentEdit } from "@/lib/ai/server";
import { AgentError } from "@/lib/ai/agent";
import { PatchError } from "@/lib/deck/patch";

const Body = z.object({
  deck: Deck,
  context: z.object({ slideId: Id.optional(), elementId: Id.optional() }).default({}),
  instruction: z.string().trim().min(2).max(2000),
});

// POST /api/ai/agent — full-access AI. The model picks editor tools (add/delete/move slides,
// rewrite content, theme, styles...). Returns a *proposal*; nothing is saved until the user
// accepts it in the editor, which commits it as one undo step.
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req, "ai");
  const body = Body.safeParse(await readJson(req, 2_500_000));
  if (!body.success) throw new HttpError(400, "That request is not valid.", "invalid_input");
  try {
    const p = await proposeAgentEdit(user, body.data.deck, body.data.context, body.data.instruction);
    return json({ summary: p.summary, ops: p.ops, issues: p.issues, changedSlideIds: p.changedSlideIds, skipped: p.skipped, engine: p.engine });
  } catch (e) {
    if (e instanceof AgentError || e instanceof PatchError) throw new HttpError(422, e.message, "edit_rejected");
    throw e;
  }
});
