import { z } from "zod";
import { Deck } from "@/lib/deck/schema";
import { suggestedCount } from "@/lib/deck/stats";
import { dbError, ensureProfile, handle, HttpError, json, readJson, requireUser } from "@/lib/server/auth";
import { takeSnapshot } from "@/lib/server/versions";
import { recordEvent } from "@/lib/server/events";

/** Decks stay in Trash this long, then they are deleted for good. */
const TRASH_DAYS = 30;

// GET /api/decks — list the signed-in user's decks (metadata + first slide for the thumbnail).
// ?trash=1 lists decks in Trash instead, and first deletes ones older than 30 days.
export const GET = handle(async (req: Request) => {
  const user = await requireUser(req, "read");
  const trash = new URL(req.url).searchParams.get("trash") === "1";
  if (trash) {
    const cutoff = new Date(Date.now() - TRASH_DAYS * 86_400_000).toISOString();
    const { error: purgeErr } = await user.db.from("decks").delete().lt("deleted_at", cutoff);
    if (purgeErr) console.warn("[decks] trash purge failed", purgeErr.code);
  }
  const base = user.db.from("decks").select("id, title, theme_id, version, updated_at, deleted_at, doc");
  const { data, error } = await (trash ? base.not("deleted_at", "is", null).order("deleted_at", { ascending: false }) : base.is("deleted_at", null).order("updated_at", { ascending: false })).limit(100);
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
      suggestedCount: suggestedCount(d.doc as Deck),
      ...(trash && d.deleted_at ? { deletedAt: d.deleted_at, purgeAt: new Date(new Date(d.deleted_at).getTime() + TRASH_DAYS * 86_400_000).toISOString() } : {}),
    })),
  });
});

const CreateBody = z.object({ deck: Deck });

// POST /api/decks — save a newly generated deck.
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req, "write");
  await ensureProfile(user);
  const parsed = CreateBody.safeParse(await readJson(req, 2_000_000));
  if (!parsed.success) throw new HttpError(400, "That deck is not valid.", "invalid_deck");
  const deck = { ...parsed.data.deck, version: 0 };
  const { error } = await user.db.from("decks").insert({ id: deck.id, owner_id: user.userId, title: deck.title, theme_id: deck.themeId, doc: deck, version: 0 });
  if (error) dbError(error, "Could not save the deck.");
  await takeSnapshot(user, deck.id, deck, "created");
  await recordEvent(user, "deck_created", deck.id, { slides: deck.slides.length, suggested: suggestedCount(deck) });
  return json({ deck }, 201);
});
