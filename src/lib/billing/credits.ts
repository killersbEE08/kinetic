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

export const creditLabel = (n: number) => `${n} credit${n === 1 ? "" : "s"}`;
