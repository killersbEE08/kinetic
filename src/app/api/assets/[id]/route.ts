import { z } from "zod";
import { Id } from "@/lib/deck/schema";
import { dbError, handle, HttpError, json, readJson, requireUser } from "@/lib/server/auth";
import { assetKey, requireBucket } from "@/lib/server/storage";

type Ctx = { params: Promise<{ id: string }> };

async function assetId(ctx: Ctx) {
  const { id } = await ctx.params;
  if (!Id.safeParse(id).success) throw new HttpError(404, "Photo not found.", "not_found");
  return id;
}

// GET /api/assets/:id — the file itself. Ownership is checked twice: the row must be visible
// under RLS, and the object key contains the verified user id.
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req, "read");
  const bucket = requireBucket();
  const id = await assetId(ctx);
  const { data, error } = await user.db.from("assets").select("mime").eq("id", id).maybeSingle();
  if (error) dbError(error, "Could not load the photo.");
  if (!data) throw new HttpError(404, "Photo not found.", "not_found");
  const obj = await bucket.get(assetKey(user.userId, id));
  if (!obj) throw new HttpError(404, "Photo not found.", "not_found");
  return new Response(obj.body, {
    headers: {
      "Content-Type": data.mime,
      "Content-Length": String(obj.size),
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      ETag: obj.httpEtag,
    },
  });
});

const Patch = z.object({ alt: z.string().trim().min(1).max(250).optional(), name: z.string().trim().min(1).max(120).optional() }).refine((v) => v.alt !== undefined || v.name !== undefined);

// PATCH /api/assets/:id — rename or change the description (alt text).
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req, "write");
  const id = await assetId(ctx);
  const body = Patch.safeParse(await readJson(req, 4_000));
  if (!body.success) throw new HttpError(400, "Give the photo a name or description.", "bad_patch");
  const { data, error } = await user.db.from("assets").update(body.data).eq("id", id).select("id");
  if (error) dbError(error, "Could not update the photo.");
  if (!data?.length) throw new HttpError(404, "Photo not found.", "not_found");
  return json({ ok: true });
});

// DELETE /api/assets/:id — removes the row and the file. Slides that used it show a placeholder.
export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req, "write");
  const bucket = requireBucket();
  const id = await assetId(ctx);
  const { data, error } = await user.db.from("assets").delete().eq("id", id).select("id");
  if (error) dbError(error, "Could not delete the photo.");
  if (!data?.length) throw new HttpError(404, "Photo not found.", "not_found");
  await bucket.delete(assetKey(user.userId, id)).catch((e) => console.error("[assets] R2 delete failed", e));
  return json({ ok: true });
});
