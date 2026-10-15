import { z } from "zod";
import { config, env } from "@/lib/server/env";
import { handle, HttpError, readJson, requireUser } from "@/lib/server/auth";

// POST /api/photos/unsplash/download — tells Unsplash a photo was used (API guideline 2). Called
// when a user places a stock photo on a slide.
const Body = z.object({ downloadLocation: z.string().url().max(500).regex(/^https:\/\/api\.unsplash\.com\/photos\/[A-Za-z0-9_-]+\/download(\?[A-Za-z0-9_=&%.-]*)?$/) });

export const POST = handle(async (req: Request) => {
  await requireUser(req, "write");
  if (!config.unsplashEnabled()) throw new HttpError(503, "Stock photos aren't set up on this server yet.", "unsplash_disabled");
  const body = Body.safeParse(await readJson(req, 2_000));
  if (!body.success) throw new HttpError(400, "That isn't an Unsplash photo.", "invalid_input");
  const res = await fetch(body.data.downloadLocation, { headers: { Authorization: `Client-ID ${env("UNSPLASH_ACCESS_KEY")}`, "Accept-Version": "v1" }, signal: AbortSignal.timeout(8_000) }).catch(() => null);
  if (!res?.ok) console.warn("[unsplash] download ping failed", res?.status);
  return new Response(null, { status: 204 });
});
