import { describe, expect, it } from "vitest";
import { alignFrames, alignToSlide, angleFrom, boundsOf, centeredFrame, distributeFrames, duplicateElement, intersects, newChart, newIcon, newImage, newShape, newTable, newText, normalizeAngle, outerBox, resizeFrame, resizeRotated, round, snapMove, snapTargets } from "./canvas";
import { Deck, Element, FREE_SLOT, isFree } from "./schema";
import { composeSlide, swapLayout, toSlotted } from "./compose";
import { runQa } from "./qa";
import { templateDeck } from "./templates";
import { applyDeckPatch } from "./patch";

describe("new elements", () => {
  it("are valid, free, and centred", () => {
    const els = [newText("heading"), newText("body"), newText("caption"), newShape("rect"), newShape("arrow"), newShape("star"), newIcon("rocket"), newTable(3, 2), newChart("bar"), newChart("kpi"), newImage("asset:as0123456789", "Team photo", 16 / 9)];
    for (const el of els) {
      expect(Element.safeParse(el).success, el.type).toBe(true);
      expect(isFree(el)).toBe(true);
      const f = el.frame!;
      expect(Math.abs(f.x + f.w / 2 - 960)).toBeLessThan(2);
    }
    expect(newChart("bar").aiSuggested).toBe(true); // placeholder numbers are flagged
    expect(centeredFrame(100, 100, 1).x).toBe(centeredFrame(100, 100, 0).x + 30);
  });

  it("duplicates as a free copy with a new id", () => {
    const t = newText("body");
    const d = duplicateElement({ ...t, slot: "title" }, t.frame!);
    expect(d.id).not.toBe(t.id);
    expect(d.slot).toBe(FREE_SLOT);
    expect(d.frame).toMatchObject({ x: t.frame!.x + 40, y: t.frame!.y + 40 });
  });
});

describe("snapping and resizing", () => {
  it("snaps edges and centres to nearby lines", () => {
    const targets = snapTargets([{ x: 100, y: 100, w: 400, h: 200 }]);
    const r = snapMove({ x: 506, y: 300, w: 200, h: 100 }, targets, 8);
    expect(r.frame.x).toBe(500); // left edge snaps to the other box's right edge
    expect(r.guides.x).toContain(500);
    const c = snapMove({ x: 857, y: 489, w: 200, h: 100 }, targets, 8); // centre near slide centre
    expect(c.frame.x + 100).toBe(960);
    expect(c.frame.y + 50).toBe(540);
    const far = snapMove({ x: 700, y: 700, w: 50, h: 50 }, targets, 4);
    expect(far.guides).toEqual({ x: [], y: [] });
  });

  it("resizes from each handle and keeps the ratio from corners", () => {
    const s = { x: 100, y: 100, w: 400, h: 200 };
    expect(resizeFrame(s, "e", 100, 0, false)).toEqual({ x: 100, y: 100, w: 500, h: 200 });
    expect(resizeFrame(s, "w", 100, 0, false)).toEqual({ x: 200, y: 100, w: 300, h: 200 });
    expect(resizeFrame(s, "n", 0, -50, false)).toEqual({ x: 100, y: 50, w: 400, h: 250 });
    const r = resizeFrame(s, "se", 200, 10, true);
    expect(r.w / r.h).toBeCloseTo(2);
    expect(resizeFrame(s, "e", -1000, 0, false).w).toBe(20);
  });

  it("aligns to the slide", () => {
    const f = { x: 10, y: 10, w: 200, h: 100 };
    expect(alignToSlide(f, "center").x).toBe(860);
    expect(alignToSlide(f, "bottom").y).toBe(980);
    expect(alignToSlide(f, "right").x).toBe(1720);
  });
});

describe("rotation", () => {
  it("normalises angles and snaps to steps", () => {
    expect(normalizeAngle(370)).toBe(10);
    expect(normalizeAngle(-190)).toBe(170);
    const c = { x: 0, y: 0 };
    expect(angleFrom(c, { x: 0, y: -100 }, false)).toBe(0); // handle straight up
    expect(angleFrom(c, { x: 100, y: 0 }, false)).toBe(90);
    expect(angleFrom(c, { x: 100, y: -3 }, false)).toBe(90); // near a right angle snaps
    expect(angleFrom(c, { x: 100, y: -60 }, true) % 15).toBe(0);
  });

  it("keeps the opposite corner fixed on screen when resizing a rotated box", () => {
    const start = { x: 100, y: 100, w: 400, h: 200, r: 90 };
    const corner = (f: { x: number; y: number; w: number; h: number; r?: number }, lx: number, ly: number) => {
      const cx = f.x + f.w / 2, cy = f.y + f.h / 2, a = ((f.r ?? 0) * Math.PI) / 180;
      const vx = lx - cx, vy = ly - cy;
      return { x: cx + vx * Math.cos(a) - vy * Math.sin(a), y: cy + vx * Math.sin(a) + vy * Math.cos(a) };
    };
    const before = corner(start, start.x, start.y); // top-left in local axes = anchor for "se"
    const next = resizeRotated(start, "se", 0, 100, false); // screen-down = local +x when rotated 90°
    expect(next.w).toBeCloseTo(500);
    expect(next.h).toBeCloseTo(200);
    const after = corner(next, next.x, next.y);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(round(next).r).toBe(90);
  });

  it("measures the visible box of a rotated frame", () => {
    const o = outerBox({ x: 0, y: 0, w: 200, h: 100, r: 90 });
    expect(o.w).toBeCloseTo(100);
    expect(o.h).toBeCloseTo(200);
    expect(o.x + o.w / 2).toBeCloseTo(100);
  });
});

describe("several elements", () => {
  const fs = [
    { x: 0, y: 0, w: 100, h: 50 },
    { x: 300, y: 100, w: 50, h: 50 },
    { x: 900, y: 40, w: 100, h: 100 },
  ];
  it("computes bounds and overlap", () => {
    expect(boundsOf(fs)).toEqual({ x: 0, y: 0, w: 1000, h: 150 });
    expect(intersects(fs[0], { x: 50, y: 25, w: 10, h: 10 })).toBe(true);
    expect(intersects(fs[0], fs[1])).toBe(false);
  });
  it("aligns to each other", () => {
    expect(alignFrames(fs, "left").map((f) => f.x)).toEqual([0, 0, 0]);
    expect(alignFrames(fs, "bottom").map((f) => f.y + f.h)).toEqual([150, 150, 150]);
    expect(alignFrames(fs, "center").map((f) => f.x + f.w / 2)).toEqual([500, 500, 500]);
  });
  it("distributes with equal gaps", () => {
    const d = distributeFrames(fs, "x");
    expect(d[0].x).toBe(0);
    expect(d[2].x).toBe(900);
    const gap1 = d[1].x - (d[0].x + d[0].w);
    const gap2 = d[2].x - (d[1].x + d[1].w);
    expect(gap1).toBeCloseTo(gap2);
  });
});

describe("free elements survive deck operations", () => {
  const deck = structuredClone(templateDeck("ledgerly-seed")!);
  const slide = deck.slides[1];
  const extra = [newText("body"), newShape("ellipse"), newTable(2, 2)];
  const withFree = { ...slide, elements: [...slide.elements, ...extra] };

  it("validates in a deck", () => {
    expect(Deck.safeParse({ ...deck, slides: [withFree, ...deck.slides.slice(1)] }).success).toBe(true);
  });

  it("are kept when the layout changes, and never pulled into layout slots", () => {
    const swapped = swapLayout(withFree, "statement");
    for (const e of extra) expect(swapped.elements.find((x) => x.id === e.id)).toEqual(e);
    expect(swapped.elements.filter(isFree)).toHaveLength(3);
  });

  it("are kept when AI rewrites the slide, and hidden from the AI", () => {
    expect(toSlotted(withFree).slots.some((s) => s.slot === FREE_SLOT)).toBe(false);
    const rewritten = composeSlide(toSlotted(withFree), withFree);
    expect(rewritten.elements.filter(isFree).map((e) => e.id)).toEqual(extra.map((e) => e.id));
  });

  it("keep a hand-set position through an AI rewrite", () => {
    const moved = { ...withFree, elements: withFree.elements.map((e, i) => (i === 0 ? { ...e, frame: { x: 10, y: 20, w: 500, h: 100 }, style: { fontSize: 50 } } : e)) };
    const rewritten = composeSlide(toSlotted(moved), moved);
    expect(rewritten.elements[0].frame).toEqual({ x: 10, y: 20, w: 500, h: 100 });
    expect(rewritten.elements[0].style).toEqual({ fontSize: 50 });
  });

  it("are not trimmed by the quality gates", () => {
    const long = { ...newText("body"), content: Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ") };
    const d = { ...deck, slides: [{ ...slide, elements: [...slide.elements, long] }] };
    const { deck: out, issues } = runQa(d);
    const kept = out.slides[0].elements.find((e) => e.id === long.id);
    expect(kept && kept.type === "text" && kept.content).toBe(long.content);
    expect(issues.some((i) => i.rule === "slot")).toBe(false);
  });

  it("can be added and moved with patches (undoable)", () => {
    const el = newIcon("rocket");
    const { doc, inverse } = applyDeckPatch(deck, [{ op: "add", path: "/slides/0/elements/-", value: el }]);
    expect(doc.slides[0].elements.at(-1)?.id).toBe(el.id);
    const moved = applyDeckPatch(doc, [{ op: "add", path: `/slides/0/elements/${doc.slides[0].elements.length - 1}/frame`, value: { x: 0, y: 0, w: 100, h: 100 } }]).doc;
    expect(moved.slides[0].elements.at(-1)?.frame).toEqual({ x: 0, y: 0, w: 100, h: 100 });
    expect(applyDeckPatch(doc, inverse).doc.slides[0].elements).toHaveLength(deck.slides[0].elements.length);
  });
});
