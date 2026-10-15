import { z } from "zod";
import { adminDb, handle, HttpError } from "@/lib/server/auth";
import { clientIp, enforceLimit } from "@/lib/server/limits";
import { SHARE_ID_RX, verifySessionToken } from "@/lib/server/share";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  token: z.string().max(200),
  beats: z.array(z.object({ slide: z.number().int().min(0).max(199), ms: z.number().int().min(0).max(600_000) })).min(1).max(30),
});

// POST /api/v/:id/beat: time spent per slide, sent by the viewer every few seconds and on leave
// (navigator.sendBeacon). Only accepted with the signed token from opening the link.
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  if (!SHARE_ID_RX.test(id)) throw new HttpError(404, "Not found.", "not_found");
  await enforceLimit("anon", clientIp(req));
  const text = (await req.text()).slice(0, 8_000);
  let parsed: z.infer<typeof Body>;
  try {
    const r = Body.safeParse(JSON.parse(text));
    if (!r.success) return new Response(null, { status: 400 });
    parsed = r.data;
  } catch {
    return new Response(null, { status: 400 });
  }
  const sessionId = await verifySessionToken(id, parsed.token);
  if (!sessionId) return new Response(null, { status: 403 });
  const db = adminDb();
  // Merge beats for the same slide, then record.
  const bySlide = new Map<number, number>();
  for (const b of parsed.beats) bySlide.set(b.slide, (bySlide.get(b.slide) ?? 0) + b.ms);
  for (const [slide, ms] of bySlide) {
    const { error } = await db.rpc("record_view_time", { p_session: sessionId, p_slide: slide, p_ms: ms });
    if (error) {
      console.error("[share] beat", error.message);
      break;
    }
  }
  return new Response(null, { status: 204 });
});
