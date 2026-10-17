import { describe, expect, it } from "vitest";
import { isWritingSlide, planFill, WRITING_TEXT } from "./fill";
import { applyDeckPatch } from "./patch";
import { composeSlide } from "./compose";
import { Deck as DeckSchema, type Deck, type Slide } from "./schema";

const ids = ["sl_aaaaaaaa", "sl_bbbbbbbb", "sl_cccccccc"];
const writing = (id: string, t: string): Slide => ({ ...composeSlide({ layout: "headlineBody", slots: [{ slot: "title", text: t }, { slot: "body", text: WRITING_TEXT }] }), id });
const real = (id: string, t: string): Slide => ({ ...composeSlide({ layout: "bullets", slots: [{ slot: "title", text: t }, { slot: "points", items: ["One", "Two"] }] }), id });

function early(): { deck: Deck; inserted: Slide[] } {
  const slides = [real(ids[0], "One"), writing(ids[1], "Two"), writing(ids[2], "Three")];
  const deck = DeckSchema.parse({ id: "dk_testtest", version: 0, title: "T", themeId: "mono", slides });
  return { deck, inserted: structuredClone(slides) };
}
const apply = (d: Deck, ops: Parameters<typeof applyDeckPatch>[1]) => DeckSchema.parse(applyDeckPatch(d, ops).doc);

describe("filling a deck that opened before generation finished", () => {
  it("replaces stand-ins as slides arrive", () => {
    const { deck, inserted } = early();
    const two = real(ids[1], "Two real");
    const r = planFill(deck, { ids, inserted, arrived: new Map([[1, two]]), final: null });
    const out = apply(deck, r.ops);
    expect(out.slides[1]).toEqual(two);
    expect(isWritingSlide(out.slides[2])).toBe(true);
    expect(r.inserted[1]).toEqual(two);
  });

  it("follows slides the user moved, and skips ones they deleted", () => {
    const { deck, inserted } = early();
    const moved = { ...deck, slides: [deck.slides[2], deck.slides[0]] }; // slide 2 deleted, 3 moved to the top
    const r = planFill(moved, { ids, inserted, arrived: new Map([[1, real(ids[1], "x")], [2, real(ids[2], "Three real")]]), final: null });
    const out = apply(moved, r.ops);
    expect(out.slides.map((s) => s.id)).toEqual([ids[2], ids[0]]);
    expect(isWritingSlide(out.slides[0])).toBe(false);
  });

  it("keeps text the user typed into a stand-in and adds the real slide after it", () => {
    const { deck, inserted } = early();
    const edited = structuredClone(deck);
    const t = edited.slides[1].elements.find((e) => e.type === "text" && e.role === "h1")!;
    if (t.type === "text") t.content = "My own title";
    const r = planFill(edited, { ids, inserted, arrived: new Map([[1, real(ids[1], "Two real")]]), final: null });
    const out = apply(edited, r.ops);
    expect(out.slides).toHaveLength(4);
    expect(out.slides[1].id).toBe(ids[1]);
    expect(out.slides[2].elements.some((e) => e.type === "text" && e.content === "Two real")).toBe(true);
  });

  it("gives untouched slides their finished version and leaves edited ones alone", () => {
    const { deck, inserted } = early();
    const step1 = planFill(deck, { ids, inserted, arrived: new Map([[1, real(ids[1], "Two")], [2, real(ids[2], "Three")]]), final: null });
    let d = apply(deck, step1.ops);
    // The user edits slide 1.
    const h = d.slides[0].elements.find((e) => e.type === "text")!;
    if (h.type === "text") h.content = "Edited";
    const final = [real(ids[0], "One"), real(ids[1], "Two"), real(ids[2], "Three")].map((s) => ({ ...s, transition: "push" as const }));
    const step2 = planFill(d, { ids, inserted: step1.inserted, arrived: new Map(), final });
    d = apply(d, step2.ops);
    expect(step2.kept).toBe(1);
    expect(d.slides[0].elements.some((e) => e.type === "text" && e.content === "Edited")).toBe(true);
    expect(d.slides[1].transition).toBe("push");
    expect(d.slides[2].transition).toBe("push");
  });

  it("does nothing when everything is already in place", () => {
    const { deck, inserted } = early();
    expect(planFill(deck, { ids, inserted, arrived: new Map([[0, deck.slides[0]]]), final: null }).ops).toEqual([]);
  });
});
