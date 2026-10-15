import { dbError, handle, json, requireUser } from "@/lib/server/auth";
import { LINK_COLS, publicLink, type LinkRow } from "@/lib/server/share";

interface SessionRow {
  id: number;
  link_id: string;
  viewer_hash: string;
  viewer_email: string | null;
  country: string | null;
  device: string | null;
  slides_seen: number;
  total_ms: number;
  started_at: string;
  last_seen_at: string;
}

// GET /api/shares: every link the user owns, with view stats, per-slide time and recent visits.
// Used by the Shared links page and the dashboard activity feed.
export const GET = handle(async (req: Request) => {
  const user = await requireUser(req, "read");
  const { data, error } = await user.db.from("share_links").select(`${LINK_COLS}, snapshot->title, snapshot->slides`).order("created_at", { ascending: false }).limit(200);
  if (error) dbError(error, "Could not load share links.");
  const links = (data ?? []) as unknown as (Omit<LinkRow, "snapshot" | "owner_id"> & { title: string; slides: { id: string }[] })[];
  const ids = links.map((l) => l.id);
  const sessions: SessionRow[] = [];
  if (ids.length) {
    const { data: s, error: sErr } = await user.db.from("view_sessions").select("id, link_id, viewer_hash, viewer_email, country, device, slides_seen, total_ms, started_at, last_seen_at").in("link_id", ids).order("started_at", { ascending: false }).limit(2000);
    if (sErr) dbError(sErr, "Could not load views.");
    sessions.push(...((s ?? []) as SessionRow[]));
  }
  const sessionIds = sessions.map((s) => s.id);
  const times: { session_id: number; slide_index: number; ms: number }[] = [];
  for (let i = 0; i < sessionIds.length; i += 500) {
    const { data: t, error: tErr } = await user.db.from("view_slide_time").select("session_id, slide_index, ms").in("session_id", sessionIds.slice(i, i + 500));
    if (tErr) dbError(tErr, "Could not load views.");
    times.push(...(t ?? []));
  }

  const out = links.map((l) => {
    const s = sessions.filter((x) => x.link_id === l.id);
    const slideCount = Array.isArray(l.slides) ? l.slides.length : 0;
    const perSlide = Array.from({ length: slideCount }, (_, i) => times.filter((t) => t.slide_index === i && s.some((x) => x.id === t.session_id)).reduce((n, t) => n + t.ms, 0));
    const completed = s.filter((x) => slideCount > 0 && x.slides_seen >= slideCount).length;
    return {
      ...publicLink(l, { views: s.length, viewers: new Set(s.map((x) => x.viewer_hash)).size, totalMs: s.reduce((n, x) => n + x.total_ms, 0), lastViewedAt: s[0]?.last_seen_at ?? null }),
      deckTitle: typeof l.title === "string" ? l.title : "Untitled deck",
      slideCount,
      perSlideMs: perSlide,
      completed,
      recent: s.slice(0, 20).map((x) => ({ at: x.started_at, lastSeenAt: x.last_seen_at, email: x.viewer_email, country: x.country, device: x.device, slidesSeen: x.slides_seen, totalMs: x.total_ms })),
    };
  });
  return json({ links: out });
});
