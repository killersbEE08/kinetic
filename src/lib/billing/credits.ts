// AI credit prices. Shared by the server (what is charged) and the UI (what is shown before
// the click), so the two can never disagree (docs/08 PAY-3).

export const CREDIT_COST = {
  outline: 2,
  /** One credit per slide, capped. */
  generatePerSlide: 1,
  generateMax: 50,
  edit: 1,
} as const;

export function generateCost(slides: number): number {
  return Math.min(CREDIT_COST.generateMax, Math.max(1, slides) * CREDIT_COST.generatePerSlide);
}

/** Monthly allowance per plan (mirrors monthly_credit_limit() in the database). */
export const MONTHLY_CREDITS = { free: 100, pro: 2000, team: 4000 } as const;

/** One line explaining reduced free credits, or null. */
export function creditNote(c: { reason: string; full: number | null; unlockAt: string | null } | null | undefined): string | null {
  if (!c) return null;
  if (c.reason === "disposable") return "Free AI credits need a permanent email address. The offline engine still works.";
  const when = c.unlockAt ? new Date(c.unlockAt).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : null;
  const full = c.full ?? MONTHLY_CREDITS.free;
  if (c.reason === "crowded") return `Starter credits. You get the full ${full}${when ? ` on ${when}` : " soon"}.`;
  return `Starter credits. You get the full ${full}${when ? ` on ${when}` : " soon"}, or as soon as you share a deck.`;
}

export const creditLabel = (n: number) => `${n} credit${n === 1 ? "" : "s"}`;
