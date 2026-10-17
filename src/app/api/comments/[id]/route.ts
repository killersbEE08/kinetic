import { z } from "zod";
import { dbError, handle, HttpError, json, readJson, requireUser } from "@/lib/server/auth";
import { COMMENT_COLS, toComment, UUID_RX, type CommentRow } from "@/lib/server/comments";

type Ctx = { params: Promise<{ id: string }> };

async function commentId(ctx: Ctx) {
  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) throw new HttpError(404, "Comment not found.", "not_found");
  return id;
}

const Patch = z.object({
  resolved: z.boolean().optional(),
  body: z.string().trim().min(1).max(2000).optional(),
  /** "Not spam": dismiss open reports, so viewers see the comment again. */
  keep: z.literal(true).optional(),
});

// PATCH /api/comments/:id: resolve / reopen a thread, edit your own comment, or dismiss reports.
// RLS limits this to comments on your decks.
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req, "write");
  const id = await commentId(ctx);
  const body = Patch.safeParse(await readJson(req, 8_000));
  if (!body.success || (body.data.resolved === undefined && body.data.body === undefined && !body.data.keep)) throw new HttpError(400, "Nothing to change.", "invalid_input");
  if (body.data.keep) {
    const { error } = await user.db.from("abuse_reports").update({ status: "dismissed" }).eq("comment_id", id).eq("status", "open");
    if (error) dbError(error, "Could not update the report.");
  }
  const update: Record<string, unknown> = {};
  if (body.data.resolved !== undefined) update.resolved_at = body.data.resolved ? new Date().toISOString() : null;
  if (body.data.body !== undefined) update.body = body.data.body;
  if (!Object.keys(update).length) {
    const { data, error } = await user.db.from("comments").select(`${COMMENT_COLS}, share_links(name)`).eq("id", id).maybeSingle();
    if (error) dbError(error, "Could not load the comment.");
    if (!data) throw new HttpError(404, "Comment not found.", "not_found");
    return json({ comment: { ...toComment(data as CommentRow, user.userId), reported: false } });
  }
  const base = user.db.from("comments").update(update).eq("id", id);
  // Only your own words can be edited; viewers' comments can be resolved or deleted.
  const q = body.data.body !== undefined ? base.eq("author_id", user.userId) : base;
  const { data, error } = await q.select(`${COMMENT_COLS}, share_links(name)`);
  if (error) dbError(error, "Could not update the comment.");
  if (!data?.length) throw new HttpError(404, "Comment not found.", "not_found");
  return json({ comment: toComment(data[0] as CommentRow, user.userId) });
});

// DELETE /api/comments/:id: deletes a comment and its replies.
export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req, "write");
  const id = await commentId(ctx);
  const { data, error } = await user.db.from("comments").delete().eq("id", id).select("id");
  if (error) dbError(error, "Could not delete the comment.");
  if (!data?.length) throw new HttpError(404, "Comment not found.", "not_found");
  return json({ ok: true });
});
