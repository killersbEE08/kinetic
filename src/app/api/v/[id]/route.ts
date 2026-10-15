import { z } from "zod";
import { adminDb, handle, HttpError, json, readJson } from "@/lib/server/auth";
import { clientIp, enforceLimit } from "@/lib/server/limits";
import { deviceOf, linkLive, SHARE_ID_RX, sessionToken, verifyPassword, viewerHash, type LinkRow } from "@/lib/server/share";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  password: z.string().max(100).optional(),
  email: z.string().trim().email().max(200).optional(),
});

// POST /api/v/:id: open a shared deck (public). Checks the link is live and the password, starts a
// view session, and returns the snapshot plus a signed token for time beats and photos.
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  if (!SHARE_ID_RX.test(id)) throw new HttpError(404, "This link doesn't exist.", "not_found");
  const ip = clientIp(req);
  await enforceLimit("anon", ip);
  const body = Body.safeParse(await readJson(req, 2_000));
  if (!body.success) throw new HttpError(400, "Check the email address.", "invalid_input");

  const db = adminDb();
  const { data, error } = await db.from("share_links").select("id, owner_id, name, snapshot, password_hash, allow_download, expires_at, revoked_at").eq("id", id).maybeSingle();
  if (error) {
    console.error("[share] load", error.message);
    throw new HttpError(500, "This deck couldn't be loaded. Try again.", "db_error");
  }
  const link = data as (Pick<LinkRow, "id" | "owner_id" | "name" | "snapshot" | "password_hash" | "allow_download" | "expires_at" | "revoked_at">) | null;
  if (!link) throw new HttpError(404, "This link doesn't exist.", "not_found");
  if (!linkLive(link)) throw new HttpError(410, link.revoked_at ? "The owner turned this link off." : "This link has expired.", "link_closed");
  if (link.password_hash) {
    if (!body.data.password) throw new HttpError(401, "This deck is protected with a password.", "password_required");
    if (!(await verifyPassword(body.data.password, link.password_hash))) throw new HttpError(403, "That password isn't right.", "password_wrong");
  }

  const ua = req.headers.get("user-agent") ?? "";
  const country = req.headers.get("cf-ipcountry") ?? null;
  const { data: session, error: sErr } = await db
    .from("view_sessions")
    .insert({ link_id: id, viewer_hash: await viewerHash(ip, ua), viewer_email: body.data.email ?? null, country: country && /^[A-Z]{2}$/.test(country) ? country : null, device: deviceOf(ua) })
    .select("id")
    .single();
  if (sErr) console.error("[share] session", sErr.message); // viewing still works without analytics

  return json({
    deck: link.snapshot,
    name: link.name,
    allowDownload: link.allow_download,
    token: session ? await sessionToken(id, session.id) : null,
  });
});
