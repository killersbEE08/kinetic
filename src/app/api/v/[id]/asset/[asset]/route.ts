import { adminDb, handle, HttpError } from "@/lib/server/auth";
import { Id } from "@/lib/deck/schema";
import { clientIp, enforceLimit } from "@/lib/server/limits";
import { assetKey, requireBucket } from "@/lib/server/storage";
import { deckDeleted, linkBlocked, linkLive, SHARE_ID_RX, snapshotAssetIds, verifySessionToken } from "@/lib/server/share";

type Ctx = { params: Promise<{ id: string; asset: string }> };

// GET /api/v/:id/asset/:asset?t=<token>: a photo used in a shared deck. Only photos that appear in
// the link's snapshot are served, only while the link is live, and only with a valid viewer token.
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const { id, asset } = await ctx.params;
  if (!SHARE_ID_RX.test(id) || !Id.safeParse(asset).success) throw new HttpError(404, "Not found.", "not_found");
  await enforceLimit("anon", clientIp(req));
  const token = new URL(req.url).searchParams.get("t");
  if ((await verifySessionToken(id, token)) === null) throw new HttpError(403, "Open the link again to load photos.", "bad_token");
  const db = adminDb();
  if (await linkBlocked(db, id)) throw new HttpError(404, "Not found.", "not_found");
  const { data: link } = await db.from("share_links").select("owner_id, snapshot, expires_at, revoked_at, decks!inner(deleted_at)").eq("id", id).maybeSingle();
  if (!link || !linkLive(link) || deckDeleted(link) || !snapshotAssetIds(link.snapshot).has(asset)) throw new HttpError(404, "Not found.", "not_found");
  const { data: meta } = await db.from("assets").select("mime").eq("id", asset).eq("owner_id", link.owner_id).maybeSingle();
  const obj = await requireBucket().get(assetKey(link.owner_id, asset));
  if (!meta || !obj) throw new HttpError(404, "Not found.", "not_found");
  return new Response(obj.body, {
    headers: {
      "Content-Type": meta.mime,
      "Content-Length": String(obj.size),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
});
