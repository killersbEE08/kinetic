import type { Deck } from "./schema";

/** Number of elements still flagged "Suggested" (content the AI added that isn't in the user's notes). */
export function suggestedCount(deck: Pick<Deck, "slides"> | null | undefined): number {
  return deck?.slides?.reduce((n, s) => n + s.elements.filter((e) => e.aiSuggested).length, 0) ?? 0;
}
