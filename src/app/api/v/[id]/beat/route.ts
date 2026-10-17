import { z } from "zod";
import { adminDb, handle, HttpError } from "@/lib/server/auth";
import { clientIp, enforceLimit } from "@/lib/server/limits";
import { background, logJson } from "@/lib/server/monitor";
import { notifyOwner } from "@/lib/server/notify";
import { slideTitles, viewedAlert } from "@/lib/alerts";
import { SHARE_ID_RX, verifySessionToken } from "@/lib/server/share";
import type { SupabaseClient } from "@supabase/supabase-js";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  token: z.string().max(200),
  beats: z.array(z.object({ slide: z.number().int().min(0).max(199), ms: z.number().int().min(0).max(600_000) })).max(30),
  /** Sent when the viewer leaves the page: triggers the owner's "viewed for 2m" alert. */
  final: z.boolean().optional(),
});

/** Visits shorter than this don't send a summary (someone glancing at the link). */
const SUMMARY_MIN_MS = 10_000;

async function sendSummary(db: SupabaseClient, linkId: string, sessionId: number) {
  // Claim the session first so two "final" beats can't both send an alert.
  const { data: claimed, error } = await db
    .from("view_sessions")
    .update({ alerted_at: new Date().toISOString() })
    .eq("id", sessionId)
    .is("alerted_at", null)
    .gte("total_ms", SUMMARY_MIN_MS)
    .select("total_ms, slides_seen, viewer_email");
  if (error) return logJson("warn", { event: "summary_claim_failed", code: error.code });
  const s = claimed?.[0];
  if (!s) return;
  const { data: link } = await db.from("share_links").select("deck_id, owner_id, name, notify, title:snapshot->title, slides:snapshot->slides").eq("id", linkId).maybeSingle();
  if (!link || link.notify === false) return;
  const { data: times } = await db.from("view_slide_time").select("slide_index, ms").eq("session_id", sessionId);
  const titles = slideTitles(link.slides);
  const text = viewedAlert({
    linkName: link.name as string,
    email: s.viewer_email as string | null,
    deckTitle: typeof link.title === "string" ? link.title : "",
    totalMs: s.total_ms as number,
    slideCount: titles.length,
    slidesSeen: s.slides_seen as number,
    perSlide: (times ?? []).map((t) => ({ index: t.slide_index as number, ms: t.ms as number })),
    titles,
  });
  await notifyOwner(db, { kind: "link_viewed", ownerId: link.owner_id as string, deckId: link.deck_id as string, linkId, sessionId, ...text, url: "/shared" }, { push: true });
}

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
    if (!r.success || (!r.data.beats.length && !r.data.final)) return new Response(null, { status: 400 });
    parsed = r.data;
  } catch {
    return new Response(null, { status: 400 });
  }
  const sessionId = await verifySessionToken(id, parsed.token);
  if (sessionId === null) return new Response(null, { status: 403 });
  // The owner previewing their own link: nothing to record.
  if (sessionId === 0) return new Response(null, { status: 204 });
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
  if (parsed.final) background(sendSummary(db, id, sessionId));
  return new Response(null, { status: 204 });
});
