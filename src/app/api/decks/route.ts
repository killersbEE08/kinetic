import { z } from "zod";
import { Deck } from "@/lib/deck/schema";
import { dbError, ensureProfile, handle, HttpError, json, readJson, requireUser } from "@/lib/server/auth";

// GET /api/decks — list the signed-in user's decks (metadata + first slide for the thumbnail).
export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  const { data, error } = await user.db
    .from("decks")
    .select("id, title, theme_id, version, updated_at, doc")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) dbError(error, "Could not load your decks.");
  return json({
    decks: (data ?? []).map((d) => ({
      id: d.id,
      title: d.title,
      themeId: d.theme_id,
      version: d.version,
      updatedAt: d.updated_at,
      firstSlide: (d.doc as Deck)?.slides?.[0] ?? null,
      motionIntensity: (d.doc as Deck)?.motionIntensity ?? "standard",
      slideCount: (d.doc as Deck)?.slides?.length ?? 0,
      brand: (d.doc as Deck)?.brand,
    })),
  });
});

const CreateBody = z.object({ deck: Deck });

// POST /api/decks — save a newly generated deck.
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req);
  await ensureProfile(user);
  const parsed = CreateBody.safeParse(await readJson(req, 2_000_000));
  if (!parsed.success) throw new HttpError(400, "That deck is not valid.", "invalid_deck");
  const deck = { ...parsed.data.deck, version: 0 };
  const { error } = await user.db.from("decks").insert({ id: deck.id, owner_id: user.userId, title: deck.title, theme_id: deck.themeId, doc: deck, version: 0 });
  if (error) dbError(error, "Could not save the deck.");
  return json({ deck }, 201);
});
