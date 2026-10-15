import { describe, expect, it } from "vitest";
import { outlineSlideToSlotted } from "./offline";
import { composeSlide } from "@/lib/deck/compose";

describe("offline slide writer", () => {
  it("finds the number even when it isn't the first point", () => {
    const s = outlineSlideToSlotted({ title: "Our traction", points: [{ text: "Boats using the app" }, { text: "412 boats" }] }, 2, 5);
    expect(s.layout).toBe("bigNumber");
    expect(s.slots.find((x) => x.slot === "number")?.chart?.series[0].values).toEqual([412]);
    expect(composeSlide(s).elements.length).toBeGreaterThan(1);
  });

  it("falls back to points when a number layout is chosen for text without numbers", () => {
    for (const layoutHint of ["bigNumber", "kpiRow"]) {
      const s = outlineSlideToSlotted({ title: "Why now", points: [{ text: "Buyers want traceable fish" }], layoutHint }, 1, 4);
      expect(s.layout).toBe("bullets");
    }
  });
});
