import { describe, expect, it } from "vitest";
import { altOps, densityFix, fixAllOps, nearestRole, opsForChanges, perSlideChanges, reviewDeck, summarize, weakAlt } from "./review";
import { applyDeckPatch } from "./patch";
import { composeSlide } from "./compose";
import { Deck as DeckSchema, type Deck, type Element } from "./schema";
import { deckTheme, getTheme } from "./themes";
import { templateDeck } from "./templates";
import { offlineEdit, shortTitle } from "../ai/edit";

const deck = () => structuredClone(templateDeck("ledgerly-seed")!);
const review = (d: Deck) => reviewDeck(d, deckTheme(d));
const apply = (d: Deck, ops: Parameters<typeof applyDeckPatch>[1]) => DeckSchema.parse(applyDeckPatch(d, ops).doc);

function withSlide(d: Deck, s: ReturnType<typeof composeSlide>): Deck {
  return { ...d, slides: [...d.slides, s] };
}

describe("deck review", () => {
  it("finds nothing to fix on a finished template (tips aside)", () => {
    const items = review(deck()).filter((i) => i.severity !== "tip");
    expect(items).toEqual([]);
  });

  it("lists AI details not in the notes and marks them checked", () => {
    const d = deck();
    const el = d.slides[1].elements.find((e) => e.type === "text")!;
    el.aiSuggested = true;
    const item = review(d).find((i) => i.rule === "numbers")!;
    expect(item.elementId).toBe(el.id);
    const fixed = apply(d, item.fix!.ops);
    expect(review(fixed).some((i) => i.rule === "numbers")).toBe(false);
  });

  it("moves extra text to speaker notes until the slide fits", () => {
    const long = Array.from({ length: 6 }, (_, i) => `Point ${i + 1} explains one more detail of the plan in plain words`);
    const s = composeSlide({ layout: "bullets", slots: [{ slot: "title", text: "Plan" }, { slot: "points", items: long }] });
    const d = withSlide(deck(), s);
    const si = d.slides.length - 1;
    const item = review(d).find((i) => i.rule === "density")!;
    expect(item.slideIndex).toBe(si);
    expect(densityFix(d.slides[si], si).length).toBeGreaterThan(0);
    const fixed = apply(d, item.fix!.ops);
    expect(review(fixed).some((i) => i.rule === "density")).toBe(false);
    expect(fixed.slides[si].notes).toContain("Point 6");
  });

  it("flags weak alt text and sets a description", () => {
    expect(weakAlt("IMG_2041.jpg")).toBe(true);
    expect(weakAlt("Photo")).toBe(true);
    expect(weakAlt("Shop owner checking receipts at the counter")).toBe(false);
    const d = deck();
    const si = d.slides.findIndex((s) => s.elements.some((e) => e.type === "image"));
    const img = d.slides[si].elements.find((e) => e.type === "image")! as Extract<Element, { type: "image" }>;
    img.alt = "IMG_2041.jpg";
    const item = review(d).find((i) => i.rule === "alt")!;
    const fixed = apply(d, altOps(d, item, "Shop owner checking receipts"));
    expect(review(fixed).some((i) => i.rule === "alt")).toBe(false);
  });

  it("catches low-contrast text and resets it to the theme colour", () => {
    const d = deck();
    d.themeId = "mono";
    delete d.brand;
    const el = d.slides[1].elements.find((e) => e.type === "text")!;
    el.style = { color: "#EEEEEE" };
    const item = review(d).find((i) => i.rule === "contrast")!;
    expect(item.message).toMatch(/needs/);
    const fixed = apply(d, item.fix!.ops);
    expect(review(fixed).some((i) => i.rule === "contrast")).toBe(false);
  });

  it("finds placeholders and hype wording", () => {
    const s = composeSlide({ layout: "headlineBody", slots: [{ slot: "title", text: "New slide" }, { slot: "body", text: "A seamless way to leverage your books." }] });
    const items = review(withSlide(deck(), s));
    expect(items.some((i) => i.rule === "placeholder")).toBe(true);
    const banned = items.find((i) => i.rule === "banned")!;
    expect(banned.fix?.label).toBe("Use plain wording");
  });

  it("switches off-brand colours to the nearest theme colour", () => {
    const d = deck();
    expect(d.brand).toBeTruthy();
    const el = d.slides[1].elements.find((e) => e.type === "text")!;
    el.style = { color: "#7A1FA2" };
    const items = review(d);
    const item = items.find((i) => i.rule === "offbrand") ?? items.find((i) => i.rule === "contrast");
    expect(item?.fix).toBeTruthy();
    const fixed = apply(d, item!.fix!.ops);
    const after = fixed.slides[1].elements.find((e) => e.id === el.id)!;
    expect(after.style?.color === undefined || !after.style.color.startsWith("#7A1FA2")).toBe(true);
    expect(nearestRole("#FFFFFF", getTheme("mono"))).toBe("bg");
  });

  it("summarises the list in one line", () => {
    const d = deck();
    d.slides[1].elements[0].aiSuggested = true;
    d.slides[2].elements[0].aiSuggested = true;
    expect(summarize(review(d))).toBe("2 details not found in your notes");
  });

  it("skips hidden slides", () => {
    const d = deck();
    d.slides[1].elements[0].aiSuggested = true;
    d.slides[1].hidden = true;
    expect(review(d).some((i) => i.slideIndex === 1)).toBe(false);
  });

  it("fix all never writes the same path twice", () => {
    const d = deck();
    d.slides[1].elements[0].aiSuggested = true;
    d.slides[2].elements[0].aiSuggested = true;
    const items = review(d).filter((i) => i.rule === "numbers");
    const ops = fixAllOps([...items, ...items]);
    expect(ops).toHaveLength(2);
    expect(review(apply(d, ops)).some((i) => i.rule === "numbers")).toBe(false);
  });
});

describe("whole-deck pass", () => {
  it("splits a deck proposal per slide and applies only chosen slides", () => {
    const d = deck();
    const { change } = offlineEdit(d, { kind: "deck" }, "Shorten every title");
    if (change.kind !== "deck") throw new Error("expected deck change");
    const { changes, extra } = perSlideChanges(d, change.slides);
    expect(extra).toBe(0);
    expect(changes.length).toBeGreaterThan(0);
    for (const c of changes) expect(c.titleAfter.split(/\s+/).length).toBeLessThanOrEqual(8);
    const keep = new Set([changes[0].slideId]);
    const out = apply(d, opsForChanges(changes, keep));
    expect(out.slides[changes[0].index]).toEqual(changes[0].after);
    if (changes[1]) expect(out.slides[changes[1].index]).toEqual(d.slides[changes[1].index]);
  });

  it("ignores slides the AI added and keeps slides it dropped", () => {
    const d = deck();
    const proposed = [{ ...d.slides[0], notes: "changed" }, composeSlide({ layout: "statement", slots: [{ slot: "statement", text: "Extra" }] })];
    const { changes, extra } = perSlideChanges(d, proposed);
    expect(changes.map((c) => c.index)).toEqual([0]);
    expect(extra).toBe(1);
  });

  it("shortens titles at a natural break", () => {
    // A one-word lead-in ("Ledgerly:") is too little on its own, so the first 8 words are kept.
    expect(shortTitle("Ledgerly: GST-ready books from receipts and bank SMS for small shops")).toBe("Ledgerly: GST-ready books from receipts and bank SMS");
    expect(shortTitle("Pricing that grows with you: one plan per shop, billed monthly")).toBe("Pricing that grows with you");
    expect(shortTitle("Small shops lose six hours a week, and penalties at filing time")).toBe("Small shops lose six hours a week");
    expect(shortTitle("Short title")).toBe("Short title");
  });
});
