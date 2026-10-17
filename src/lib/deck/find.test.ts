import { describe, expect, it } from "vitest";
import { findMatches, replaceOps } from "./find";
import { restoreOps, snapshotBefore } from "./versions";
import { applyDeckPatch } from "./patch";
import { templateDeck } from "./templates";
import type { Deck } from "./schema";

const deck = (): Deck => structuredClone(templateDeck("ledgerly-seed")!);

describe("find and replace", () => {
  it("finds text in titles, points and notes, case-insensitive by default", () => {
    const d = deck();
    const all = findMatches(d, "ledgerly");
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((m) => m.hit.toLowerCase() === "ledgerly")).toBe(true);
    expect(findMatches(d, "LEDGERLY", { matchCase: true })).toHaveLength(0);
  });

  it("whole word skips partial matches", () => {
    const d = deck();
    d.slides[0].notes = "shop shops shopping";
    const whole = findMatches(d, "shop", { wholeWord: true }).filter((m) => m.field.kind === "notes" && m.field.slideIndex === 0);
    expect(whole).toHaveLength(1);
  });

  it("treats the query as plain text, not a pattern", () => {
    const d = deck();
    d.slides[0].notes = "Price (USD) is $1.5M.";
    expect(findMatches(d, "$1.5M").filter((m) => m.field.kind === "notes")).toHaveLength(1);
    expect(findMatches(d, "(USD)").filter((m) => m.field.kind === "notes")).toHaveLength(1);
  });

  it("replace all is one valid patch and leaves no matches", () => {
    const d = deck();
    const before = findMatches(d, "Ledgerly").length;
    const r = replaceOps(d, "Ledgerly", "Tallybook");
    expect(r.count).toBe(before);
    const next = applyDeckPatch(d, r.ops).doc;
    expect(findMatches(next, "Ledgerly")).toHaveLength(0);
    expect(findMatches(next, "Tallybook").length).toBe(before);
  });

  it("replaces a single match only", () => {
    const d = deck();
    d.slides[0].notes = "one two one";
    const m = findMatches(d, "one").filter((x) => x.field.kind === "notes" && x.field.slideIndex === 0)[1];
    const next = applyDeckPatch(d, replaceOps(d, "one", "three", {}, m).ops).doc;
    expect(next.slides[0].notes).toBe("one two three");
  });

  it("skips replacements that would make a field too long", () => {
    const d = deck();
    const r = replaceOps(d, "Ledgerly", "x".repeat(3000));
    expect(r.skipped).toBeGreaterThan(0);
    expect(() => applyDeckPatch(d, r.ops)).not.toThrow();
  });
});

describe("version history", () => {
  it("restoreOps rebuilds the old deck in one step", () => {
    const old = deck();
    const cur = applyDeckPatch(old, [
      { op: "replace", path: "/title", value: "Changed" },
      { op: "remove", path: "/slides/1" },
      { op: "replace", path: "/themeId", value: "night" },
    ]).doc;
    const back = applyDeckPatch(cur, restoreOps(cur, old)).doc;
    expect(back.title).toBe(old.title);
    expect(back.themeId).toBe(old.themeId);
    expect(back.slides).toEqual(old.slides);
    expect(back.brand).toEqual(old.brand);
  });

  it("removes a brand the old version didn't have", () => {
    const old = { ...deck(), brand: undefined };
    const cur = deck();
    const back = applyDeckPatch(cur, restoreOps(cur, old)).doc;
    expect(back.brand).toBeUndefined();
  });

  it("snapshots before AI edits and every 25 saves", () => {
    expect(snapshotBefore(3, "ai")).toBe("before-ai");
    expect(snapshotBefore(25, "user")).toBe("auto");
    expect(snapshotBefore(26, "user")).toBeNull();
    expect(snapshotBefore(0, "user")).toBeNull();
  });
});
