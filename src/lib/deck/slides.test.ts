import { describe, expect, it } from "vitest";
import { backgroundImage, backgroundVars, copySlides, hiddenCount, luminance, presentable, presentIndex } from "./slides";
import { applyDeckPatch } from "./patch";
import { Slide } from "./schema";
import { templateDeck } from "./templates";

const deck = () => structuredClone(templateDeck("ledgerly-seed")!);

describe("hidden slides", () => {
  it("presentable drops hidden slides but never all of them", () => {
    const d = deck();
    d.slides[1].hidden = true;
    d.slides[3].hidden = true;
    expect(hiddenCount(d)).toBe(2);
    expect(presentable(d).slides.map((s) => s.id)).toEqual(d.slides.filter((_, i) => i !== 1 && i !== 3).map((s) => s.id));
    const all = { ...d, slides: d.slides.map((s) => ({ ...s, hidden: true })) };
    expect(presentable(all).slides).toHaveLength(d.slides.length);
  });

  it("maps an editor slide to its place in the shown deck", () => {
    const d = deck();
    d.slides[1].hidden = true;
    expect(presentIndex(d, 0)).toBe(0);
    expect(presentIndex(d, 1)).toBe(1); // hidden: starts at the next shown slide (editor slide 3)
    expect(presentIndex(d, 2)).toBe(1);
    expect(presentIndex(d, d.slides.length - 1)).toBe(d.slides.length - 2);
  });

  it("hide and show are valid patches", () => {
    const d = deck();
    const hidden = applyDeckPatch(d, [{ op: "add", path: "/slides/2/hidden", value: true }]).doc;
    expect(hidden.slides[2].hidden).toBe(true);
    expect(applyDeckPatch(hidden, [{ op: "remove", path: "/slides/2/hidden" }]).doc.slides[2].hidden).toBeUndefined();
  });
});

describe("slide backgrounds", () => {
  it("picks light text on dark colours and dark text on light ones", () => {
    expect(luminance("#000000")).toBe(0);
    expect(luminance("#ffffff")).toBeCloseTo(1);
    expect(backgroundVars({ color: "#0b0b0c" })["--k-text"]).toBe("#ffffff");
    expect(backgroundVars({ color: "#f5f3ee" })["--k-text"]).toBe("#101114");
    expect(backgroundVars(undefined)).toEqual({});
  });

  it("photo backgrounds use light text and render as an image element", () => {
    const d = deck();
    const s = { ...d.slides[2], background: { image: { src: "/media/leaf", alt: "Leaf", focal: [0.5, 0.5] as [number, number] }, dim: 0.4 } };
    expect(Slide.safeParse(s).success).toBe(true);
    expect(backgroundVars(s.background)["--k-text"]).toBe("#ffffff");
    expect(backgroundImage(s)).toMatchObject({ type: "image", src: "/media/leaf", alt: "Leaf" });
  });

  it("rejects bad colours and too much darkening", () => {
    const s = deck().slides[0];
    expect(Slide.safeParse({ ...s, background: { color: "red" } }).success).toBe(false);
    expect(Slide.safeParse({ ...s, background: { dim: 0.95 } }).success).toBe(false);
  });
});

describe("copying slides", () => {
  it("gives slides, elements and groups new ids and can drop notes", () => {
    const d = deck();
    const src = structuredClone(d.slides[4]);
    src.elements[0].group = "grp1abcd";
    if (src.elements[1]) src.elements[1].group = "grp1abcd";
    const [copy] = copySlides([src], { notes: false });
    expect(copy.id).not.toBe(src.id);
    expect(copy.notes).toBe("");
    copy.elements.forEach((e, i) => expect(e.id).not.toBe(src.elements[i].id));
    if (src.elements[1]) {
      expect(copy.elements[0].group).toBeDefined();
      expect(copy.elements[0].group).not.toBe("grp1abcd");
      expect(copy.elements[1].group).toBe(copy.elements[0].group);
    }
    // Adding the copy to the same deck is still a valid deck.
    expect(() => applyDeckPatch(d, [{ op: "add", path: `/slides/${d.slides.length}`, value: copy }])).not.toThrow();
  });
});
