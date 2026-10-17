import { z } from "zod";
import { adminDb, handle, HttpError, json, readJson } from "@/lib/server/auth";
import { clientIp, enforceLimit } from "@/lib/server/limits";
import { COMMENT_COLS, forViewer, MAX_COMMENTS_PER_LINK, NewComment, type CommentRow } from "@/lib/server/comments";
import { deckDeleted, linkBlocked, linkLive, SHARE_ID_RX, verifySessionToken } from "@/lib/server/share";
import { requireHuman, turnstileEnabled } from "@/lib/server/turnstile";
import { notifyOwner } from "@/lib/server/notify";
import { commentAlert } from "@/lib/alerts";
import { logJson } from "@/lib/server/monitor";
import type { SupabaseClient } from "@supabase/supabase-js";

type Ctx = { params: Promise<{ id: string }> };

interface LinkForComments {
  id: string;
  deck_id: string;
  owner_id: string;
  name: string;
  allow_comments: boolean;
  expires_at: string | null;
  revoked_at: string | null;
  slides: { id: string }[] | null;
  title: string | null;
}

/** The link must be live, allow comments, and the token must come from opening it. Returns the session id too (0 = owner preview). */
async function openLink(db: SupabaseClient, id: string, token: string | null): Promise<LinkForComments & { session: number }> {
  if (!SHARE_ID_RX.test(id)) throw new HttpError(404, "This link doesn't exist.", "not_found");
  const session = await verifySessionToken(id, token);
  if (session === null) throw new HttpError(403, "Open the link again to comment.", "invalid_token");
  const { data, error } = await db.from("share_links").select("id, deck_id, owner_id, name, allow_comments, expires_at, revoked_at, title:snapshot->title, slides:snapshot->slides, decks!inner(deleted_at)").eq("id", id).maybeSingle();
  if (error) {
    logJson("warn", { event: "viewer_comments_load_failed", code: error.code });
    throw new HttpError(500, "Comments couldn't be loaded.", "db_error");
  }
  const link = data as unknown as LinkForComments | null;
  if (!link || deckDeleted(data) || !linkLive(link) || (await linkBlocked(db, id))) throw new HttpError(410, "This link isn't available.", "link_closed");
  if (!link.allow_comments) throw new HttpError(403, "The owner hasn't turned on comments for this link.", "comments_off");
  return { ...link, session };
}

/** Comments with an open abuse report are hidden from viewers until the owner reviews them. */
async function reportedIds(db: SupabaseClient, linkId: string): Promise<Set<string>> {
  const { data, error } = await db.from("abuse_reports").select("comment_id").eq("link_id", linkId).eq("kind", "comment").eq("status", "open");
  if (error) return new Set();
  return new Set((data ?? []).map((r) => r.comment_id as string));
}

// GET /api/v/:id/comments?t=<token>: comments left through this link, with the owner's replies.
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  await enforceLimit("anon", clientIp(req));
  const db = adminDb();
  await openLink(db, id, new URL(req.url).searchParams.get("t"));
  const [{ data, error }, hidden] = await Promise.all([db.from("comments").select(COMMENT_COLS).eq("link_id", id).order("created_at", { ascending: true }).limit(MAX_COMMENTS_PER_LINK), reportedIds(db, id)]);
  if (error) throw new HttpError(500, "Comments couldn't be loaded.", "db_error");
  const rows = ((data ?? []) as CommentRow[]).filter((r) => !hidden.has(r.id) && !(r.parent_id && hidden.has(r.parent_id)));
  return json({ comments: rows.map(forViewer), captcha: turnstileEnabled() });
});

const Body = NewComment.omit({ elementId: true }).extend({
  token: z.string().max(200),
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(200).optional(),
  captcha: z.string().max(2048).optional(),
});

// POST /api/v/:id/comments: a viewer leaves a comment on a slide. The owner gets an alert.
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const ip = clientIp(req);
  await enforceLimit("anon", ip);
  const body = Body.safeParse(await readJson(req, 10_000));
  if (!body.success) throw new HttpError(400, "Add your name and a comment (up to 2,000 characters).", "invalid_input");
  const db = adminDb();
  const link = await openLink(db, id, body.data.token);
  // The owner previewing their own link is already signed in; no robot check for them.
  if (link.session !== 0) await requireHuman(body.data.captcha, ip, "comment");
  const slideIndex = (link.slides ?? []).findIndex((s) => s?.id === body.data.slideId);
  if (slideIndex < 0) throw new HttpError(400, "That slide isn't in this deck.", "invalid_input");

  const { count } = await db.from("comments").select("id", { count: "exact", head: true }).eq("link_id", id);
  if ((count ?? 0) >= MAX_COMMENTS_PER_LINK) throw new HttpError(429, "This link has reached its comment limit.", "comment_limit");
  if (body.data.parentId) {
    const { data: parent } = await db.from("comments").select("id, parent_id").eq("id", body.data.parentId).eq("link_id", id).maybeSingle();
    if (!parent || parent.parent_id) throw new HttpError(400, "Reply to the first comment of the thread.", "invalid_input");
  }

  const { data, error } = await db
    .from("comments")
    .insert({ deck_id: link.deck_id, slide_id: body.data.slideId, parent_id: body.data.parentId ?? null, link_id: id, author_id: null, author_name: body.data.name, author_email: body.data.email ?? null, body: body.data.body })
    .select(COMMENT_COLS)
    .single();
  if (error) throw new HttpError(500, "The comment couldn't be saved. Try again.", "db_error");

  const text = commentAlert({ author: body.data.name, deckTitle: link.title ?? "", slideNumber: slideIndex + 1, body: body.data.body });
  if (link.session !== 0) {
    await notifyOwner(db, { kind: "comment", ownerId: link.owner_id, deckId: link.deck_id, linkId: id, ...text, url: `/d/${link.deck_id}?comments=1` }, { push: true });
    await db.from("product_events").insert({ user_id: link.owner_id, name: "comment_added", deck_id: link.deck_id, props: { by: "viewer", reply: !!body.data.parentId } }).then(() => undefined, () => undefined);
  }
  return json({ comment: forViewer(data as CommentRow) }, 201);
});
