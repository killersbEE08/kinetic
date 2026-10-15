import { z } from "zod";
import { Brand, Id } from "@/lib/deck/schema";
import { dbError, ensureProfile, handle, HttpError, json, readJson, requireUser } from "@/lib/server/auth";

const Body = z.object({ id: Id, kit: Brand, isDefault: z.boolean().default(false) });

// GET /api/brand-kits: the user's brand kits (logo, colours, heading font, pattern).
export const GET = handle(async (req: Request) => {
  const user = await requireUser(req, "read");
  const { data, error } = await user.db.from("brand_kits").select("id, kit, is_default, updated_at").order("created_at", { ascending: true });
  if (error) dbError(error, "Could not load brand kits.");
  return json({ kits: (data ?? []).map((k) => ({ id: k.id, kit: k.kit, isDefault: k.is_default, updatedAt: k.updated_at })) });
});

// PUT /api/brand-kits: create or update one kit. Setting isDefault clears it on the others.
export const PUT = handle(async (req: Request) => {
  const user = await requireUser(req, "write");
  await ensureProfile(user);
  const body = Body.safeParse(await readJson(req, 20_000));
  if (!body.success) throw new HttpError(400, "Check the brand kit: it needs a name, a main colour as #RRGGBB, and an icon.", "invalid_kit");
  const { id, kit, isDefault } = body.data;
  if (isDefault) {
    const { error } = await user.db.from("brand_kits").update({ is_default: false }).neq("id", id);
    if (error) dbError(error, "Could not save the brand kit.");
  }
  const { data: existing } = await user.db.from("brand_kits").select("id").eq("id", id).maybeSingle();
  const res = existing
    ? await user.db.from("brand_kits").update({ kit, is_default: isDefault }).eq("id", id).select("id")
    : await user.db.from("brand_kits").insert({ id, owner_id: user.userId, kit, is_default: isDefault }).select("id");
  if (res.error) dbError(res.error, "Could not save the brand kit.");
  return json({ ok: true });
});

// DELETE /api/brand-kits?id=…
export const DELETE = handle(async (req: Request) => {
  const user = await requireUser(req, "write");
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!Id.safeParse(id).success) throw new HttpError(404, "Brand kit not found.", "not_found");
  const { error } = await user.db.from("brand_kits").delete().eq("id", id);
  if (error) dbError(error, "Could not delete the brand kit.");
  return json({ ok: true });
});
