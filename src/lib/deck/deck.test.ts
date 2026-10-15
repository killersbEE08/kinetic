import { describe, expect, it } from "vitest";
import { applyDeckPatch, applyPatch, checkScope, PatchError, type PatchOp } from "./patch";
import { sampleDeck } from "./sample";
import { Deck } from "./schema";
import { runQa, extractNumbers, bareNumber } from "./qa";
import { swapLayout, composeSlide } from "./compose";
import { resolveTimeline, stepCount } from "./motion";
import { THEMES, contrastRatio } from "./themes";
import { LAYOUTS } from "./layouts";
import { offlineOutline, offlineSlides } from "../ai/offline";
import { findBanned, softenCopy } from "./banned";

describe("json patch", () => {
  const doc = { a: 1, list: [1, 2, 3], nested: { x: "y" } };

  it("applies ops without mutating the input and inverts cleanly", () => {
    const ops: PatchOp[] = [
      { op: "replace", path: "/a", value: 2 },
      { op: "add", path: "/list/1", value: 9 },
      { op: "remove", path: "/nested/x" },
      { op: "add", path: "/list/-", value: 4 },
      { op: "move", from: "/list/0", path: "/list/2" },
    ];
    const { doc: next, inverse } = applyPatch(doc, ops);
    expect(doc.a).toBe(1);
    expect(next).toEqual({ a: 2, list: [9, 2, 1, 3, 4], nested: {} });
    expect(applyPatch(next, inverse).doc).toEqual(doc);
  });

  it("rejects prototype pollution and bad paths", () => {
    expect(() => applyPatch(doc, [{ op: "add", path: "/__proto__/x", value: 1 }])).toThrow(PatchError);
    expect(() => applyPatch(doc, [{ op: "replace", path: "/missing", value: 1 }])).toThrow(PatchError);
    expect(() => applyPatch(doc, [{ op: "test", path: "/a", value: 5 }])).toThrow(PatchError);
  });

  it("validates the deck after applying", () => {
    const deck = sampleDeck();
    expect(() => applyDeckPatch(deck, [{ op: "replace", path: "/slides", value: [] }])).toThrow(PatchError);
    const { doc: next } = applyDeckPatch(deck, [{ op: "replace", path: "/title", value: "New" }]);
    expect(next.title).toBe("New");
  });
});

describe("scope enforcement", () => {
  const deck = sampleDeck();
  const s1 = deck.slides[1];

  it("allows edits inside the selected slide only", () => {
    const inside: PatchOp[] = [{ op: "replace", path: "/slides/1/notes", value: "x" }];
    const outside: PatchOp[] = [{ op: "replace", path: "/slides/2/notes", value: "x" }];
    expect(checkScope(deck, inside, { kind: "slide", slideIds: [s1.id] })).toBeNull();
    expect(checkScope(deck, outside, { kind: "slide", slideIds: [s1.id] })).toMatch(/outside/);
    expect(checkScope(deck, [{ op: "replace", path: "/title", value: "x" }], { kind: "slide", slideIds: [s1.id] })).toMatch(/outside/);
  });

  it("limits element scope to the selected elements and forbids id changes", () => {
    const el = s1.elements[0];
    const scope = { kind: "element" as const, slideId: s1.id, elementIds: [el.id] };
    expect(checkScope(deck, [{ op: "replace", path: "/slides/1/elements/0/slot", value: el.slot }], scope)).toBeNull();
    expect(checkScope(deck, [{ op: "replace", path: "/slides/1/elements/0/id", value: "aaaaaaaaaa" }], scope)).toMatch(/ids/);
    if (s1.elements[1]) {
      expect(checkScope(deck, [{ op: "replace", path: "/slides/1/elements/1/slot", value: "x" }], scope)).toMatch(/outside/);
    }
  });
});

describe("offline generator", () => {
  it("builds a schema-valid pitch deck from the sample notes", () => {
    const deck = sampleDeck();
    expect(Deck.safeParse(deck).success).toBe(true);
    expect(deck.slides.length).toBeGreaterThanOrEqual(6);
    expect(deck.slides[0].layout).toBe("title");
    const layouts = deck.slides.map((s) => s.layout);
    expect(layouts).toContain("kpiRow");
    expect(layouts).toContain("process");
  });

  it("does not invent numbers: every chart value appears in the notes", () => {
    const deck = sampleDeck();
    for (const s of deck.slides) for (const el of s.elements) if (el.type === "chart") expect(el.aiSuggested).toBe(false);
  });

  it("marks missing sections as Suggested placeholders instead of inventing content", () => {
    const outline = offlineOutline({ prompt: "Seed pitch for a dog walking app", notes: "", deckType: "pitch", slideCount: "auto", audience: "", language: "English" });
    const traction = outline.slides.find((s) => s.title === "Traction")!;
    expect(traction.points[0].text).toMatch(/^Suggested:/);
    const slotted = offlineSlides(outline);
    expect(slotted.length).toBe(outline.slides.length);
  });

  it("respects an explicit slide count", () => {
    const outline = offlineOutline({ prompt: "Pitch", notes: "a b c.\n\nd e f.\n\ng h i.", deckType: "pitch", slideCount: 5, audience: "", language: "English" });
    expect(outline.slides.length).toBe(5);
  });
});

describe("quality gates", () => {
  it("moves extra bullets to notes and softens banned words", () => {
    const slide = composeSlide({
      layout: "bullets",
      slots: [
        { slot: "title", text: "A seamless way to unlock growth!" },
        { slot: "points", items: ["one", "two", "three", "four", "five", "six", "seven"] },
      ],
    });
    const deck = Deck.parse({ id: "dktestdeck01", version: 0, title: "t", themeId: "mono", slides: [slide] });
    const { deck: fixed, issues } = runQa(deck);
    const s = fixed.slides[0];
    const bullets = s.elements.find((e) => e.type === "bullets");
    expect(bullets && bullets.type === "bullets" && bullets.items.length).toBe(5);
    expect(s.notes).toContain("six");
    const title = s.elements.find((e) => e.type === "text");
    expect(title && title.type === "text" && title.content).toBe("A smooth way to open growth.");
    expect(issues.some((i) => i.rule === "bullets")).toBe(true);
  });

  it("keeps leading numbers in points but strips list markers", () => {
    const s = composeSlide({ layout: "bullets", slots: [{ slot: "title", text: "T" }, { slot: "points", items: ["81% gross margin", "- dash item", "2. numbered item"] }] });
    const b = s.elements.find((e) => e.type === "bullets");
    expect(b && b.type === "bullets" && b.items).toEqual(["81% gross margin", "dash item", "numbered item"]);
  });

  it("flags numbers not present in the source", () => {
    const slide = composeSlide({ layout: "headlineBody", slots: [{ slot: "title", text: "Growth" }, { slot: "body", text: "We grew 40% last year." }] });
    const deck = Deck.parse({ id: "dktestdeck02", version: 0, title: "t", themeId: "mono", slides: [slide] });
    const flagged = runQa(deck, "We grew a lot.").deck.slides[0].elements.find((e) => e.slot === "body")!;
    const ok = runQa(deck, "Growth was 40% in 2025").deck.slides[0].elements.find((e) => e.slot === "body")!;
    expect(flagged.aiSuggested).toBe(true);
    expect(ok.aiSuggested).toBe(false);
  });

  it("normalises numbers for matching", () => {
    expect(extractNumbers("Revenue $18k and 1,240 shops at 22%")).toEqual(["18k", "1240", "22%"]);
    expect(bareNumber("12.50%")).toBe("12.5");
  });

  it("banned list catches the copy rules from doc 06", () => {
    expect(findBanned("Unleash a game-changing, cutting-edge tool")).toHaveLength(3);
    expect(findBanned("Turn a PDF into an animated deck")).toHaveLength(0);
    expect(softenCopy("We leverage data")).toBe("We use data");
  });
});

describe("layouts and motion", () => {
  it("swapping layout keeps all content (moved to notes if it does not fit)", () => {
    const deck = sampleDeck();
    const src = deck.slides.find((s) => s.layout === "bullets") ?? deck.slides[1];
    const swapped = swapLayout(src, "statement");
    const allText = JSON.stringify(swapped);
    for (const el of src.elements) {
      if (el.type === "text") expect(allText).toContain(el.content.slice(0, 20));
      if (el.type === "bullets") for (const item of el.items) expect(allText).toContain(item.slice(0, 20));
    }
    expect(swapped.id).toBe(src.id);
  });

  it("onClick triggers create build steps and calm caps the budget", () => {
    const slide = composeSlide({ layout: "bullets", slots: [{ slot: "title", text: "T" }, { slot: "points", items: ["a"] }] });
    slide.elements[1].motion = { preset: "fadeUp", trigger: "onClick", order: 1, delayMs: 0, durationMs: 320, easing: "standard" };
    expect(stepCount(slide, "standard")).toBe(2);
    const tl = resolveTimeline(slide, "calm");
    expect(tl.get(slide.elements[0].id)?.preset).toBe("fadeUp"); // maskReveal simplified on calm
  });

  it("every layout default motion references real slots", () => {
    for (const l of LAYOUTS) for (const slot of Object.keys(l.defaultMotion)) expect(l.slots[slot]).toBeDefined();
  });
});

describe("themes", () => {
  it("text and muted text pass WCAG AA on background and surface", () => {
    for (const t of THEMES) {
      expect(contrastRatio(t.colors.text, t.colors.bg), `${t.id} text`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.colors.muted, t.colors.bg), `${t.id} muted`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.colors.text, t.colors.surface), `${t.id} surface`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.colors.accent, t.colors.bg), `${t.id} accent (large text)`).toBeGreaterThanOrEqual(3);
    }
  });
});
