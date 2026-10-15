import { describe, expect, it } from "vitest";
import { CREDIT_COST, MONTHLY_CREDITS, creditLabel, generateCost } from "./credits";
import { suggestedCount } from "@/lib/deck/stats";
import { templateDeck } from "@/lib/deck/templates";

describe("credit prices", () => {
  it("charges one credit per slide, capped", () => {
    expect(generateCost(0)).toBe(1);
    expect(generateCost(12)).toBe(12);
    expect(generateCost(200)).toBe(CREDIT_COST.generateMax);
  });
  it("matches the database's monthly limits", () => {
    // Keep in sync with monthly_credit_limit() in supabase/migrations/20261014000000_init.sql.
    expect(MONTHLY_CREDITS).toEqual({ free: 100, pro: 2000, team: 4000 });
  });
  it("labels singular and plural", () => {
    expect(creditLabel(1)).toBe("1 credit");
    expect(creditLabel(2)).toBe("2 credits");
  });
});

describe("suggested count", () => {
  it("counts elements flagged as suggested", () => {
    const deck = structuredClone(templateDeck("ledgerly-seed")!);
    expect(suggestedCount(deck)).toBe(0);
    deck.slides[1].elements[0].aiSuggested = true;
    deck.slides[2].elements[0].aiSuggested = true;
    expect(suggestedCount(deck)).toBe(2);
    expect(suggestedCount(null)).toBe(0);
  });
});
