// Pure helpers for hand editing on the canvas: new elements, frames, snapping, resizing.
// Everything is in slide units (1920 × 1080). No DOM here, so it is unit-tested.
import { FREE_SLOT, SLIDE_H, SLIDE_W, type ChartElement, type Element, type Frame, type ShapeKind } from "./schema";
import type { IconName } from "./icons";
import { newId } from "./ids";

const base = () => ({ id: newId("el"), slot: FREE_SLOT, source: [] as { ref: string; span?: string }[], aiSuggested: false });

/** A frame of the given size, centred on the slide (nudged so repeated inserts don't stack exactly). */
export function centeredFrame(w: number, h: number, nudge = 0): Frame {
  const off = (nudge % 6) * 30;
  return { x: Math.round((SLIDE_W - w) / 2 + off), y: Math.round((SLIDE_H - h) / 2 + off), w, h };
}

export type TextPreset = "heading" | "body" | "caption";

export function newText(preset: TextPreset, nudge = 0): Element {
  const p = {
    heading: { role: "h2" as const, content: "Heading", size: 72, w: 1100, h: 110, font: "heading" as const, bold: true },
    body: { role: "body" as const, content: "Type your text here", size: 38, w: 900, h: 120, font: "body" as const, bold: false },
    caption: { role: "caption" as const, content: "Caption", size: 28, w: 700, h: 60, font: "body" as const, bold: false },
  }[preset];
  return { ...base(), type: "text", role: p.role, content: p.content, frame: centeredFrame(p.w, p.h, nudge), style: { fontSize: p.size, font: p.font, ...(p.bold ? { bold: true } : {}) } };
}

export function newShape(shape: ShapeKind, nudge = 0): Element {
  const line = shape === "line" || shape === "arrow";
  const size = line ? { w: 600, h: 40 } : shape === "ellipse" || shape === "star" ? { w: 360, h: 360 } : { w: 480, h: 300 };
  return { ...base(), type: "shape", shape, text: "", frame: centeredFrame(size.w, size.h, nudge), style: line ? { stroke: "accent", strokeWidth: 6 } : { fill: "accent" } };
}

export function newIcon(name: IconName, nudge = 0): Element {
  return { ...base(), type: "icon", name, frame: centeredFrame(180, 180, nudge), style: { color: "accent" } };
}

export function newTable(rows = 4, cols = 3, nudge = 0): Element {
  const r = Math.max(1, Math.min(12, rows));
  const c = Math.max(1, Math.min(8, cols));
  const cells = Array.from({ length: r }, (_, i) => Array.from({ length: c }, (_, k) => (i === 0 ? `Column ${k + 1}` : "")));
  return { ...base(), type: "table", rows: cells, header: true, frame: centeredFrame(Math.min(1500, 300 * c + 100), Math.min(820, 90 * r), nudge), style: { fontSize: 28 } };
}

/** Charts start with placeholder numbers, flagged as Suggested until the user enters real data. */
export function newChart(kind: ChartElement["kind"], nudge = 0): Element {
  const data =
    kind === "kpi"
      ? { labels: ["Your number"], series: [{ name: "Value", values: [100] }] }
      : { labels: ["Q1", "Q2", "Q3", "Q4"], series: [{ name: "Series 1", values: [12, 19, 26, 34] }] };
  const size = kind === "kpi" ? { w: 700, h: 300 } : { w: 1200, h: 560 };
  return { ...base(), type: "chart", kind, data, aiSuggested: true, frame: centeredFrame(size.w, size.h, nudge) };
}

/** A photo sized to its aspect ratio, about half the slide wide. */
export function newImage(src: string, alt: string, aspect = 4 / 3, nudge = 0): Element {
  const w = aspect >= 1 ? 900 : Math.round(600 * aspect);
  const h = Math.round(w / aspect);
  return { ...base(), type: "image", src, alt: alt.slice(0, 250) || "Photo", focal: [0.5, 0.5], frame: centeredFrame(w, Math.min(h, 1000), nudge) };
}

/** Copy of an element as a free element, shifted down-right, with a new id. */
export function duplicateElement(el: Element, frame: Frame): Element {
  const copy = structuredClone(el);
  return { ...copy, id: newId("el"), slot: FREE_SLOT, frame: { ...frame, x: frame.x + 40, y: frame.y + 40 } };
}

export const round = (f: Frame): Frame => {
  const r = f.r ? normalizeAngle(Math.round(f.r * 10) / 10) : 0;
  return { x: Math.round(f.x), y: Math.round(f.y), w: Math.max(8, Math.round(f.w)), h: Math.max(4, Math.round(f.h)), ...(r ? { r } : {}) };
};

// ---------------------------------------------------------------------------
// Rotation

/** Angle in (-180, 180]. */
export function normalizeAngle(a: number): number {
  let x = a % 360;
  if (x <= -180) x += 360;
  if (x > 180) x -= 360;
  return Math.abs(x) < 1e-9 ? 0 : x;
}

const rad = (d: number) => (d * Math.PI) / 180;
function rot(p: { x: number; y: number }, deg: number) {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/**
 * Rotation angle for a pointer at `point` dragging the handle above `center`.
 * Snaps to 15? steps with `step`, otherwise to 0/90/180/270 when within 4?.
 */
export function angleFrom(center: { x: number; y: number }, point: { x: number; y: number }, step: boolean): number {
  const a = (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI + 90;
  if (step) return normalizeAngle(Math.round(a / 15) * 15);
  for (const t of [0, 90, 180, -90, 270, -180]) if (Math.abs(normalizeAngle(a - t)) < 4) return normalizeAngle(t);
  return normalizeAngle(Math.round(a));
}

/** Resize a rotated frame: the handle follows the pointer in the element's own axes, the opposite side stays put on screen. */
export function resizeRotated(start: Frame, handle: Handle, dx: number, dy: number, keepRatio: boolean, min = 20): Frame {
  const r = start.r ?? 0;
  if (!r) return resizeFrame(start, handle, dx, dy, keepRatio, min);
  const local = rot({ x: dx, y: dy }, -r);
  const nf = resizeFrame({ ...start, r: undefined }, handle, local.x, local.y, keepRatio, min);
  // Anchor = the point opposite the handle (fixed in local coordinates by resizeFrame).
  const ax = handle.includes("e") ? start.x : handle.includes("w") ? start.x + start.w : start.x + start.w / 2;
  const ay = handle.includes("s") ? start.y : handle.includes("n") ? start.y + start.h : start.y + start.h / 2;
  const c0 = { x: start.x + start.w / 2, y: start.y + start.h / 2 };
  const world = (p: { x: number; y: number }, c: { x: number; y: number }) => {
    const v = rot({ x: p.x - c.x, y: p.y - c.y }, r);
    return { x: c.x + v.x, y: c.y + v.y };
  };
  const anchorWorld = world({ x: ax, y: ay }, c0);
  const c1 = { x: nf.x + nf.w / 2, y: nf.y + nf.h / 2 };
  const v = rot({ x: ax - c1.x, y: ay - c1.y }, r);
  const newCenter = { x: anchorWorld.x - v.x, y: anchorWorld.y - v.y };
  return { x: newCenter.x - nf.w / 2, y: newCenter.y - nf.h / 2, w: nf.w, h: nf.h, r };
}

/** Axis-aligned box around a (possibly rotated) frame. */
export function outerBox(f: Frame): Frame {
  if (!f.r) return { x: f.x, y: f.y, w: f.w, h: f.h };
  const c = Math.abs(Math.cos(rad(f.r)));
  const s = Math.abs(Math.sin(rad(f.r)));
  const w = f.w * c + f.h * s;
  const h = f.w * s + f.h * c;
  return { x: f.x + f.w / 2 - w / 2, y: f.y + f.h / 2 - h / 2, w, h };
}

// ---------------------------------------------------------------------------
// Several elements at once

export function boundsOf(frames: Frame[]): Frame {
  const boxes = frames.map(outerBox);
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const r = Math.max(...boxes.map((b) => b.x + b.w));
  const btm = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: r - x, h: btm - y };
}

export const intersects = (a: Frame, b: Frame) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export type AlignWhere = "left" | "center" | "right" | "top" | "middle" | "bottom";

/** Aligns frames to each other (to the selection's bounds), using their visible boxes. */
export function alignFrames(frames: Frame[], where: AlignWhere): Frame[] {
  const b = boundsOf(frames);
  return frames.map((f) => {
    const o = outerBox(f);
    const dx = where === "left" ? b.x - o.x : where === "center" ? b.x + b.w / 2 - (o.x + o.w / 2) : where === "right" ? b.x + b.w - (o.x + o.w) : 0;
    const dy = where === "top" ? b.y - o.y : where === "middle" ? b.y + b.h / 2 - (o.y + o.h / 2) : where === "bottom" ? b.y + b.h - (o.y + o.h) : 0;
    return { ...f, x: f.x + dx, y: f.y + dy };
  });
}

/** Spreads frames so the gaps between them are equal (first and last stay put). Order is preserved. */
export function distributeFrames(frames: Frame[], axis: "x" | "y"): Frame[] {
  if (frames.length < 3) return frames;
  const boxes = frames.map(outerBox);
  const order = boxes.map((b, i) => ({ b, i })).sort((p, q) => (axis === "x" ? p.b.x - q.b.x : p.b.y - q.b.y));
  const size = (b: Frame) => (axis === "x" ? b.w : b.h);
  const start = axis === "x" ? order[0].b.x : order[0].b.y;
  const last = order[order.length - 1].b;
  const end = axis === "x" ? last.x + last.w : last.y + last.h;
  const gap = (end - start - order.reduce((n, o) => n + size(o.b), 0)) / (order.length - 1);
  const out = [...frames];
  let cursor = start;
  for (const { b, i } of order) {
    const delta = cursor - (axis === "x" ? b.x : b.y);
    out[i] = axis === "x" ? { ...frames[i], x: frames[i].x + delta } : { ...frames[i], y: frames[i].y + delta };
    cursor += size(b) + gap;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Snapping

export interface Guides {
  x: number[];
  y: number[];
}

/** Lines other elements and the slide offer for snapping: edges and centres. */
export function snapTargets(others: Frame[]): Guides {
  const x = [0, SLIDE_W / 2, SLIDE_W];
  const y = [0, SLIDE_H / 2, SLIDE_H];
  for (const f of others) {
    x.push(f.x, f.x + f.w / 2, f.x + f.w);
    y.push(f.y, f.y + f.h / 2, f.y + f.h);
  }
  return { x, y };
}

function snapAxis(starts: number[], targets: number[], threshold: number): { delta: number; at: number[] } {
  let best: { delta: number; at: number[] } = { delta: 0, at: [] };
  let bestDist = threshold + 1;
  for (const s of starts) {
    for (const t of targets) {
      const d = t - s;
      if (Math.abs(d) < bestDist) {
        bestDist = Math.abs(d);
        best = { delta: d, at: [t] };
      } else if (Math.abs(d) === bestDist && Math.abs(d - best.delta) < 0.5) best.at.push(t);
    }
  }
  return bestDist <= threshold ? best : { delta: 0, at: [] };
}

/** Moves a frame and snaps its edges or centre to the nearest target within `threshold`. */
export function snapMove(frame: Frame, targets: Guides, threshold: number): { frame: Frame; guides: Guides } {
  const sx = snapAxis([frame.x, frame.x + frame.w / 2, frame.x + frame.w], targets.x, threshold);
  const sy = snapAxis([frame.y, frame.y + frame.h / 2, frame.y + frame.h], targets.y, threshold);
  return { frame: { ...frame, x: frame.x + sx.delta, y: frame.y + sy.delta }, guides: { x: sx.at, y: sy.at } };
}

// ---------------------------------------------------------------------------
// Resizing

export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/**
 * New frame after dragging `handle` by (dx, dy). Corners keep the aspect ratio when `keepRatio`.
 * The opposite edge or corner stays put; sizes never go below the minimum.
 */
export function resizeFrame(start: Frame, handle: Handle, dx: number, dy: number, keepRatio: boolean, min = 20): Frame {
  let { x, y, w, h } = start;
  if (handle.includes("e")) w = start.w + dx;
  if (handle.includes("w")) w = start.w - dx;
  if (handle.includes("s")) h = start.h + dy;
  if (handle.includes("n")) h = start.h - dy;
  w = Math.max(min, w);
  h = Math.max(min / 2, h);
  if (keepRatio && handle.length === 2) {
    const ratio = start.w / start.h;
    // Follow whichever axis moved more, relative to the box.
    if (Math.abs(w - start.w) / start.w > Math.abs(h - start.h) / start.h) h = w / ratio;
    else w = h * ratio;
  }
  if (handle.includes("w")) x = start.x + start.w - w;
  if (handle.includes("n")) y = start.y + start.h - h;
  return { x, y, w, h };
}

/** Frame aligned to an edge or the centre of the slide. */
export function alignToSlide(f: Frame, where: "left" | "center" | "right" | "top" | "middle" | "bottom"): Frame {
  switch (where) {
    case "left":
      return { ...f, x: 0 };
    case "center":
      return { ...f, x: Math.round((SLIDE_W - f.w) / 2) };
    case "right":
      return { ...f, x: SLIDE_W - f.w };
    case "top":
      return { ...f, y: 0 };
    case "middle":
      return { ...f, y: Math.round((SLIDE_H - f.h) / 2) };
    case "bottom":
      return { ...f, y: SLIDE_H - f.h };
  }
}

/** Elements that keep their aspect ratio when resized from a corner (Shift inverts this). */
export const keepsRatio = (el: Element) => el.type === "image" || el.type === "icon" || (el.type === "shape" && (el.shape === "ellipse" || el.shape === "star"));
