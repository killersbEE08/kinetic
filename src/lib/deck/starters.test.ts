import { describe, expect, it } from "vitest";
import { NEW_SLIDES } from "./starters";
import { Slide } from "./schema";

describe("new slide starters", () => {
  it("each starter is a valid slide that uses its layout", () => {
    for (const n of NEW_SLIDES) {
      const s = n.make();
      expect(Slide.safeParse(s).success, n.id).toBe(true);
      expect(s.layout).toBe(n.id);
      if (n.id !== "blank") expect(s.elements.length, n.id).toBeGreaterThan(0);
    }
  });

  it("makes fresh ids every time", () => {
    const a = NEW_SLIDES[1].make();
    const b = NEW_SLIDES[1].make();
    expect(a.id).not.toBe(b.id);
    expect(a.elements[0].id).not.toBe(b.elements[0].id);
  });
});
