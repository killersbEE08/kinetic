import { z } from "zod";
import { Id } from "@/lib/deck/schema";
import { dbError, ensureProfile, handle, HttpError, json, requireUser } from "@/lib/server/auth";
import { assetKey, requireBucket, sniffImage } from "@/lib/server/storage";

const MAX_BYTES = 5 * 1024 * 1024;
const COLUMNS = "id, name, alt, mime, bytes, width, height, created_at";

interface AssetRow {
  id: string;
  name: string;
  alt: string;
  mime: string;
  bytes: number;
  width: number;
  height: number;
  created_at: string;
}

const toMeta = (r: AssetRow) => ({ id: r.id, name: r.name, alt: r.alt, mime: r.mime, bytes: r.bytes, width: r.width, height: r.height, createdAt: r.created_at });

// GET /api/assets — the signed-in user's photos, newest first.
export const GET = handle(async (req: Request) => {
  const user = await requireUser(req, "read");
  requireBucket();
  const { data, error } = await user.db.from("assets").select(COLUMNS).order("created_at", { ascending: false }).limit(500);
  if (error) dbError(error, "Could not load your photos.");
  return json({ assets: (data as AssetRow[]).map(toMeta) });
});

const Meta = z.object({
  id: Id,
  name: z.string().trim().min(1).max(120),
  alt: z.string().trim().max(250).default(""),
  width: z.number().int().min(1).max(10000),
  height: z.number().int().min(1).max(10000),
});

// POST /api/assets — multipart form: `file` (image) + `meta` (JSON). The browser has already
// resized the image and stripped its metadata; we still check size and file signature here.
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req, "upload");
  const bucket = requireBucket();
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES + 64_000) throw new HttpError(413, "That photo is too large (5 MB max).", "too_large");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "Upload a photo as a form file.", "bad_form");
  }
  const file = form.get("file");
  if (!(file instanceof Blob)) throw new HttpError(400, "No photo was attached.", "no_file");
  if (file.size > MAX_BYTES) throw new HttpError(413, "That photo is too large (5 MB max).", "too_large");
  let metaRaw: unknown;
  try {
    metaRaw = JSON.parse(String(form.get("meta") ?? "{}"));
  } catch {
    metaRaw = null;
  }
  const meta = Meta.safeParse(metaRaw);
  if (!meta.success) throw new HttpError(400, "The photo details are not valid.", "bad_meta");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImage(bytes);
  if (!mime) throw new HttpError(415, "Only JPG, PNG, WebP and GIF images can be uploaded.", "bad_type");

  await ensureProfile(user);
  // Row first: RLS and the storage quota trigger decide whether the upload is allowed.
  const { data, error } = await user.db
    .from("assets")
    .insert({ id: meta.data.id, name: meta.data.name, alt: meta.data.alt || meta.data.name, mime, bytes: bytes.byteLength, width: meta.data.width, height: meta.data.height })
    .select(COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") throw new HttpError(409, "That photo was already uploaded.", "duplicate");
    dbError(error, "Could not save the photo.");
  }
  try {
    await bucket.put(assetKey(user.userId, meta.data.id), bytes.buffer as ArrayBuffer, { httpMetadata: { contentType: mime } });
  } catch (e) {
    await user.db.from("assets").delete().eq("id", meta.data.id);
    console.error("[assets] R2 put failed", e);
    throw new HttpError(502, "The photo couldn't be stored. Try again.", "storage_error");
  }
  return json({ asset: toMeta(data as AssetRow) }, 201);
});
