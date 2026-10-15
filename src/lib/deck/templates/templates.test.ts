import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { buildDeck } from "../build";
import { Deck } from "../schema";
import { findBanned } from "../banned";
import { runQa } from "../qa";
import { contrastRatio, getTheme } from "../themes";
import { MEDIA } from "../media";
import { CATEGORIES, TEMPLATES, forkDeck, templateDeck } from "./index";

const VISUAL = new Set(["titleImage", "imageStatement", "split", "product", "iconGrid", "chartFocus", "timeline", "team"]);

describe("sample deck templates", () => {
  it("has 20 to 25 decks covering every category", () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(20);
    expect(TEMPLATES.length).toBeLessThanOrEqual(25);
    for (const c of CATEGORIES) expect(TEMPLATES.filter((t) => t.category === c).length).toBeGreaterThanOrEqual(4);
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
  });

  for (const t of TEMPLATES) {
    it(`${t.id} is a complete, visual deck that passes every quality gate unchanged`, () => {
      expect(t.id).toMatch(/^[a-z0-9-]{4,20}$/);
      expect(t.slides.length).toBeGreaterThanOrEqual(7);
      expect(t.slides.length).toBeLessThanOrEqual(12);
      expect(["title", "titleImage"]).toContain(t.slides[0].layout);
      expect(t.slides[t.slides.length - 1].layout).toBe("closing");
      // At least three visual slides (photos, product screens, icon grids, charts with callouts…).
      expect(t.slides.filter((s) => VISUAL.has(s.layout)).length).toBeGreaterThanOrEqual(3);

      // Brand colour must stand out from the theme background (3:1 for large text and graphics).
      const bg = getTheme(t.themeId).colors.bg;
      expect(contrastRatio(t.brand.primary, bg), `${t.id} brand vs ${t.themeId}`).toBeGreaterThanOrEqual(3);

      const { issues } = buildDeck({ title: t.name, slides: t.slides, themeId: t.themeId, intensity: t.intensity });
      const authoring = issues.filter((i) => i.rule !== "factuality");
      expect(authoring, JSON.stringify(authoring)).toEqual([]);

      const deck = templateDeck(t.id)!;
      expect(Deck.safeParse(deck).success).toBe(true);
      expect(deck.brand?.name).toBe(t.brand.name);
      expect(deck.slides.length).toBe(t.slides.length);
      // Every authored slot made it into the deck (nothing dropped by compose).
      deck.slides.forEach((s, i) => expect(s.elements.length, `${t.id} slide ${i + 1}`).toBe(t.slides[i].slots.length));
      // Nothing is marked Suggested: all numbers come from the template's own text.
      expect(deck.slides.flatMap((s) => s.elements).some((e) => e.aiSuggested)).toBe(false);
      expect(runQa(deck).issues.filter((i) => i.rule !== "factuality")).toEqual([]);
      expect(findBanned(JSON.stringify(t))).toEqual([]);
    });
  }

  it("every library photo exists in both sizes", () => {
    for (const m of MEDIA) {
      for (const size of ["640", "1920"]) expect(existsSync(join(process.cwd(), "public", `${m.src}-${size}.jpg`)), `${m.src}-${size}`).toBe(true);
    }
  });

  it("renders with stable ids and forks get a fresh deck id", () => {
    const a = templateDeck("ledgerly-seed")!;
    const b = templateDeck("ledgerly-seed")!;
    expect(a.slides[1].id).toBe(b.slides[1].id);
    const f = forkDeck(a);
    expect(f.id).not.toBe(a.id);
    expect(Deck.safeParse(f).success).toBe(true);
  });
});
