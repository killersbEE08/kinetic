import { z } from "zod";
import { Id } from "@/lib/deck/schema";
import { dbError, ensureProfile, handle, HttpError, json, readJson, requireUser } from "@/lib/server/auth";
import { COMMENT_COLS, NewComment, toComment, type CommentRow } from "@/lib/server/comments";
import { recordEvent } from "@/lib/server/events";

type Ctx = { params: Promise<{ id: string }> };

async function deckId(ctx: Ctx) {
  const { id } = await ctx.params;
  if (!Id.safeParse(id).success) throw new HttpError(404, "Deck not found.", "not_found");
  return id;
}

// GET /api/decks/:id/comments: every comment on the deck (yours and from share links), oldest first.
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req, "read");
  const id = await deckId(ctx);
  const { data, error } = await user.db.from("comments").select(`${COMMENT_COLS}, share_links(name)`).eq("deck_id", id).order("created_at", { ascending: true }).limit(1000);
  if (error) dbError(error, "Could not load comments.");
  // Open abuse reports (viewers hide these until you review them). Older databases: none.
  const { data: reports } = await user.db.from("abuse_reports").select("comment_id").eq("deck_id", id).eq("kind", "comment").eq("status", "open");
  const reported = new Set((reports ?? []).map((r) => r.comment_id as string));
  return json({ comments: ((data ?? []) as CommentRow[]).map((r) => ({ ...toComment(r, user.userId), reported: reported.has(r.id) })) });
});

const Body = NewComment.extend({ authorName: z.string().trim().min(1).max(80).default("Deck owner") });

// POST /api/decks/:id/comments: add a comment or a reply. Replies to a share-link comment are
// tied to the same link, so the person who asked sees the answer on their link.
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req, "write");
  await ensureProfile(user);
  const id = await deckId(ctx);
  const body = Body.safeParse(await readJson(req, 8_000));
  if (!body.success) throw new HttpError(400, "Write a comment first (up to 2,000 characters).", "invalid_input");
  const { data: deck, error: dErr } = await user.db.from("decks").select("id").eq("id", id).is("deleted_at", null).maybeSingle();
  if (dErr) dbError(dErr, "Could not load the deck.");
  if (!deck) throw new HttpError(404, "Deck not found.", "not_found");
  let linkId: string | null = null;
  if (body.data.parentId) {
    const { data: parent, error: pErr } = await user.db.from("comments").select("id, link_id, parent_id").eq("id", body.data.parentId).eq("deck_id", id).maybeSingle();
    if (pErr) dbError(pErr, "Could not load the comment.");
    if (!parent) throw new HttpError(404, "That comment was deleted.", "not_found");
    if (parent.parent_id) throw new HttpError(400, "Reply to the first comment of the thread.", "invalid_input");
    linkId = parent.link_id as string | null;
  }
  const { data, error } = await user.db
    .from("comments")
    .insert({ deck_id: id, slide_id: body.data.slideId, element_id: body.data.elementId ?? null, parent_id: body.data.parentId ?? null, link_id: linkId, author_id: user.userId, author_name: body.data.authorName, author_email: user.email ?? null, body: body.data.body })
    .select(`${COMMENT_COLS}, share_links(name)`)
    .single();
  if (error) dbError(error, "Could not save the comment.");
  await recordEvent(user, "comment_added", id, { reply: !!body.data.parentId, by: "owner" });
  return json({ comment: toComment(data as CommentRow, user.userId) }, 201);
});
