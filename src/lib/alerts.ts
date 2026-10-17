// Wording for share-link alerts (bell, email, Slack). Pure functions so they can be tested.
// Alerts name the link ("Acme investors") or the viewer's email when they gave one; never an IP.

export function fmtMs(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

export function viewerLabel(linkName: string, email?: string | null): string {
  return clip(email?.trim() || linkName.trim() || "Someone", 60);
}

export function openedAlert(a: { linkName: string; email?: string | null; deckTitle: string; device?: string | null }) {
  return {
    title: `${viewerLabel(a.linkName, a.email)} opened "${clip(a.deckTitle || "your deck", 80)}"`,
    body: a.device ? `On a ${a.device}. You'll get a summary when they finish.` : "You'll get a summary when they finish.",
  };
}

/** "Acme investors viewed "Q3 pitch" for 2m 10s" + "Most time on slide 4, Pricing (58s). Saw 9 of 12 slides." */
export function viewedAlert(a: { linkName: string; email?: string | null; deckTitle: string; totalMs: number; slideCount: number; slidesSeen: number; perSlide: { index: number; ms: number }[]; titles: string[] }) {
  const top = [...a.perSlide].sort((x, y) => y.ms - x.ms)[0];
  const parts: string[] = [];
  if (top && top.ms >= 3000) {
    const t = a.titles[top.index]?.trim();
    parts.push(`Most time on slide ${top.index + 1}${t ? `, ${clip(t, 60)}` : ""} (${fmtMs(top.ms)}).`);
  }
  if (a.slideCount > 0) parts.push(a.slidesSeen >= a.slideCount ? `Saw all ${a.slideCount} slides.` : `Saw ${a.slidesSeen} of ${a.slideCount} slides.`);
  return {
    title: `${viewerLabel(a.linkName, a.email)} viewed "${clip(a.deckTitle || "your deck", 80)}" for ${fmtMs(a.totalMs)}`,
    body: parts.join(" "),
  };
}

export function commentAlert(a: { author: string; deckTitle: string; slideNumber: number; body: string }) {
  return {
    title: `${clip(a.author, 60)} commented on slide ${a.slideNumber} of "${clip(a.deckTitle || "your deck", 80)}"`,
    body: clip(a.body.replace(/\s+/g, " ").trim(), 300),
  };
}

/** Slack's mrkdwn treats <, > and & specially. */
export const slackEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const htmlEscape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const SLACK_WEBHOOK_RX = /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]{10,200}$/;

/** First headline of each slide, for "most time on slide 4, Pricing". */
export function slideTitles(slides: unknown): string[] {
  if (!Array.isArray(slides)) return [];
  return slides.map((s) => {
    const els = (s as { elements?: { type?: string; role?: string; content?: string }[] })?.elements ?? [];
    const h = els.find((e) => e.type === "text" && e.role === "h1") ?? els.find((e) => e.type === "text");
    return typeof h?.content === "string" ? h.content : "";
  });
}
