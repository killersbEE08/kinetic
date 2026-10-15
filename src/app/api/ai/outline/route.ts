import { z } from "zod";
import { GenerationInput } from "@/lib/deck/schema";
import { handle, HttpError, json, readJson, requireUser, ensureProfile } from "@/lib/server/auth";
import { makeOutline } from "@/lib/ai/server";

const Body = z.object({ input: GenerationInput });

// POST /api/ai/outline — prompt + notes → editable outline (step 2 of New Deck).
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req);
  await ensureProfile(user);
  const body = Body.safeParse(await readJson(req, 1_000_000));
  if (!body.success) throw new HttpError(400, "Check the deck settings and try again.", "invalid_input");
  if (!body.data.input.prompt.trim() && !body.data.input.notes.trim()) throw new HttpError(400, "Describe the deck or paste your notes first.", "empty_input");
  const { outline, engine } = await makeOutline(user, body.data.input);
  return json({ outline, engine });
});
