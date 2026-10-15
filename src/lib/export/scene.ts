"use client";

// Turns a rendered slide stage into a flat list of drawable items (boxes, text, pictures,
// charts) in stage pixels. The PowerPoint exporter turns each item into a native, editable shape.
import type { ChartElement, Slide } from "@/lib/deck/schema";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Rgba {
  hex: string; // "RRGGBB"
  alpha: number; // 0..1
}

/** Which deck element (and which item inside it) a shape belongs to, for animations. */
export interface Owner {
  elId: string;
  itemDelay?: number;
  /** "title" / "media" for morph matching between slides. */
  role?: "title" | "media";
}

interface Common {
  box: Box;
  owner?: Owner;
}

export type SceneItem =
  | (Common & { kind: "rect"; fill?: Rgba; line?: { color: Rgba; width: number }; radius: number; ellipse: boolean })
  | (Common & {
      kind: "text";
      text: string;
      fontPx: number;
      lineHeightPx: number;
      letterPx: number;
      weight: number;
      italic: boolean;
      color: Rgba;
      family: "sans" | "serif" | "grotesk" | "display";
      align: "left" | "center" | "right";
      nowrap: boolean;
    })
  | (Common & { kind: "image"; dataUrl: string; alt: string })
  | (Common & { kind: "chart"; el: ChartElement });

const TRANSPARENT: Rgba = { hex: "000000", alpha: 0 };

/** Parses the colour formats getComputedStyle returns: rgb(), rgba(), color(srgb …). */
export function parseColor(v: string): Rgba {
  v = v.trim();
  let m = v.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i);
  let r: number, g: number, b: number, a: number;
  if (m) {
    [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
    a = m[4] === undefined ? 1 : m[4].endsWith("%") ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]);
  } else if ((m = v.match(/^color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/i))) {
    [r, g, b] = [Number(m[1]) * 255, Number(m[2]) * 255, Number(m[3]) * 255];
    a = m[4] === undefined ? 1 : m[4].endsWith("%") ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]);
  } else if ((m = v.match(/^#([0-9a-f]{6})$/i))) {
    return { hex: m[1].toUpperCase(), alpha: 1 };
  } else return TRANSPARENT;
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return { hex: (h(r) + h(g) + h(b)).toUpperCase(), alpha: Math.max(0, Math.min(1, a)) };
}

function family(ff: string): "sans" | "serif" | "grotesk" | "display" {
  if (/fraunces/i.test(ff)) return "display";
  if (/grotesk/i.test(ff)) return "grotesk";
  if (/source.?serif|georgia|serif_4|\bserif\b(?!.*sans)/i.test(ff) && !/inter/i.test(ff.split(",")[0])) return "serif";
  return "sans";
}

const px = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

function intersect(a: Box, b: Box): Box | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.w, b.x + b.w);
  const btm = Math.min(a.y + a.h, b.y + b.h);
  return r - x > 0.5 && btm - y > 0.5 ? { x, y, w: r - x, h: btm - y } : null;
}

interface Ctx {
  origin: DOMRect;
  opacity: number;
  clip: Box;
  owner?: Owner;
  chartFor?: ChartElement;
}

export interface CaptureOptions {
  /** Max pixel width for embedded photos. */
  photoWidth?: number;
}

/** Walks the stage and returns items in paint order. */
export async function captureScene(stage: HTMLElement, slide: Slide, opts: CaptureOptions = {}): Promise<{ bg: Rgba; items: SceneItem[] }> {
  const origin = stage.getBoundingClientRect();
  const items: SceneItem[] = [];
  const pending: Promise<void>[] = [];
  const bg = parseColor(getComputedStyle(stage).backgroundColor);
  const toBox = (r: DOMRect): Box => ({ x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height });
  const byId = new Map(slide.elements.map((e) => [e.id, e]));

  const walk = (node: Element, ctx: Ctx) => {
    if (!(node instanceof HTMLElement || node instanceof SVGSVGElement)) return;
    if (node.classList.contains("k-suggested-tag")) return;
    const cs = getComputedStyle(node);
    if (cs.display === "none" || cs.visibility === "hidden") return;
    const opacity = ctx.opacity * px(cs.opacity || "1");
    if (opacity < 0.01) return;
    const box = toBox(node.getBoundingClientRect());

    // Ownership for animations.
    let owner = ctx.owner;
    let chartFor = ctx.chartFor;
    const elId = node.getAttribute("data-el");
    if (elId) {
      const el = byId.get(elId);
      owner = { elId, role: el?.type === "text" && el.role === "h1" ? "title" : el?.type === "image" ? "media" : undefined };
      chartFor = el?.type === "chart" && el.kind !== "kpi" ? el : undefined;
    }
    const delayAttr = node.getAttribute("data-delay");
    if (delayAttr && owner) owner = { ...owner, itemDelay: Number(delayAttr) };

    if (node instanceof SVGSVGElement) {
      if (chartFor && node.getAttribute("role") === "img") {
        items.push({ kind: "chart", box, el: chartFor, owner });
        return;
      }
      const vis = intersect(box, ctx.clip);
      if (!vis) return;
      const idx = items.length;
      items.push({ kind: "image", box, dataUrl: "", alt: "", owner }); // placeholder keeps paint order
      pending.push(
        rasterizeSvg(node, box, opacity).then((dataUrl) => {
          items[idx] = { kind: "image", box, dataUrl, alt: "", owner };
        }),
      );
      return;
    }

    // Box: background and borders.
    const fill = parseColor(cs.backgroundColor);
    const radius = px(cs.borderTopLeftRadius);
    const ellipse = /%$/.test(cs.borderTopLeftRadius) ? px(cs.borderTopLeftRadius) >= 50 : radius >= Math.min(box.w, box.h) / 2 - 0.5;
    const bw = [px(cs.borderTopWidth), px(cs.borderRightWidth), px(cs.borderBottomWidth), px(cs.borderLeftWidth)];
    const bc = [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor].map(parseColor);
    const styles = [cs.borderTopStyle, cs.borderRightStyle, cs.borderBottomStyle, cs.borderLeftStyle];
    const sides = bw.map((w, i) => (w > 0 && styles[i] !== "none" && bc[i].alpha > 0 ? w : 0));
    const uniform = sides.every((w) => w > 0 && w === sides[0]) && bc.every((c) => c.hex === bc[0].hex);
    const clipped = intersect(box, ctx.clip);
    const fade = (c: Rgba): Rgba => ({ ...c, alpha: c.alpha * opacity });
    if (clipped && (fill.alpha > 0 || uniform)) {
      items.push({
        kind: "rect",
        box: radius > 0 ? box : clipped,
        fill: fill.alpha > 0 ? fade(fill) : undefined,
        line: uniform ? { color: fade(bc[0]), width: sides[0] } : undefined,
        radius: ellipse ? 0 : radius,
        ellipse,
        owner,
      });
    }
    if (!uniform && clipped) {
      const edge = (i: number, b: Box) => sides[i] > 0 && items.push({ kind: "rect", box: b, fill: fade(bc[i]), radius: 0, ellipse: false, owner });
      edge(0, { x: box.x, y: box.y, w: box.w, h: sides[0] });
      edge(1, { x: box.x + box.w - sides[1], y: box.y, w: sides[1], h: box.h });
      edge(2, { x: box.x, y: box.y + box.h - sides[2], w: box.w, h: sides[2] });
      edge(3, { x: box.x, y: box.y, w: sides[3], h: box.h });
    }

    // ::before markers (bullet dashes).
    const before = getComputedStyle(node, "::before");
    if (before.content && before.content !== "none" && before.display !== "none" && before.position === "absolute") {
      const bfill = parseColor(before.backgroundColor);
      if (bfill.alpha > 0) {
        const pl = box.x + px(cs.borderLeftWidth);
        const pt = box.y + px(cs.borderTopWidth);
        items.push({ kind: "rect", box: { x: pl + px(before.left), y: pt + px(before.top), w: px(before.width), h: px(before.height) }, fill: fade(bfill), radius: 0, ellipse: false, owner });
      }
    }

    if (node instanceof HTMLImageElement) {
      const vis = intersect(box, ctx.clip);
      if (!vis || !node.naturalWidth) return;
      const idx = items.length;
      items.push({ kind: "image", box: vis, dataUrl: "", alt: node.alt, owner });
      pending.push(
        cropImage(node, box, vis, cs.objectPosition, opacity, opts.photoWidth ?? 1920).then((dataUrl) => {
          items[idx] = { kind: "image", box: vis, dataUrl, alt: node.alt, owner };
        }),
      );
      return;
    }

    // Text written directly in this element.
    const textNodes = Array.from(node.childNodes).filter((n): n is Text => n.nodeType === Node.TEXT_NODE && !!n.textContent?.trim());
    if (textNodes.length) {
      const range = document.createRange();
      range.setStartBefore(textNodes[0]);
      range.setEndAfter(textNodes[textNodes.length - 1]);
      const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
      if (rects.length) {
        const top = Math.min(...rects.map((r) => r.top)) - origin.top;
        const bottom = Math.max(...rects.map((r) => r.bottom)) - origin.top;
        const left = Math.min(...rects.map((r) => r.left)) - origin.left;
        const right = Math.max(...rects.map((r) => r.right)) - origin.left;
        const inline = cs.display === "inline";
        const padL = px(cs.paddingLeft) + px(cs.borderLeftWidth);
        const padR = px(cs.paddingRight) + px(cs.borderRightWidth);
        const align = cs.textAlign === "center" ? "center" : cs.textAlign === "right" || cs.textAlign === "end" ? "right" : "left";
        const fontPx = px(cs.fontSize);
        let x = inline ? left : box.x + padL;
        let w = inline ? right - left : box.w - padL - padR;
        // Fonts measure a little wider in PowerPoint; give lines room so they don't re-wrap.
        const slack = Math.max(8, w * 0.04);
        if (align === "center") x -= slack / 2;
        else if (align === "right") x -= slack;
        w += slack;
        let text = textNodes.map((t) => t.textContent ?? "").join("").replace(/\s+/g, " ").trim();
        if (cs.textTransform === "uppercase") text = text.toUpperCase();
        const lh = cs.lineHeight === "normal" ? fontPx * 1.2 : px(cs.lineHeight);
        items.push({
          kind: "text",
          box: { x, y: top, w, h: Math.max(bottom - top, lh) },
          text,
          fontPx,
          lineHeightPx: lh,
          letterPx: cs.letterSpacing === "normal" ? 0 : px(cs.letterSpacing),
          weight: Number(cs.fontWeight) || 400,
          italic: cs.fontStyle === "italic",
          color: fade(parseColor(cs.color)),
          family: family(cs.fontFamily),
          align,
          nowrap: cs.whiteSpace === "nowrap",
          owner,
        });
      }
    }

    const clip = cs.overflow === "hidden" || cs.overflowX === "hidden" || cs.overflow === "clip" ? intersect(ctx.clip, box) ?? { x: 0, y: 0, w: 0, h: 0 } : ctx.clip;
    for (const child of Array.from(node.children)) walk(child, { ...ctx, opacity, clip, owner, chartFor });
  };

  const stageBox = { x: 0, y: 0, w: origin.width, h: origin.height };
  for (const child of Array.from(stage.children)) walk(child, { origin, opacity: 1, clip: stageBox });
  await Promise.all(pending);
  return { bg, items: items.filter((it) => it.kind !== "image" || it.dataUrl) };
}

// ---------------------------------------------------------------------------

const SVG_PROPS = ["fill", "stroke", "stroke-width", "stroke-opacity", "fill-opacity", "opacity", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset", "font-size", "font-weight", "font-family", "text-anchor", "color", "visibility"] as const;

async function rasterizeSvg(svg: SVGSVGElement, box: Box, opacity: number): Promise<string> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const src = [svg, ...Array.from(svg.querySelectorAll("*"))];
  const dst = [clone, ...Array.from(clone.querySelectorAll("*"))];
  src.forEach((s, i) => {
    const cs = getComputedStyle(s);
    const d = dst[i] as SVGElement;
    d.removeAttribute("class");
    const style = SVG_PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(";");
    d.setAttribute("style", style + ";animation:none;transition:none");
  });
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(box.w));
  clone.setAttribute("height", String(box.h));
  const scale = 2;
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.ceil(box.w * scale));
    c.height = Math.max(1, Math.ceil(box.h * scale));
    const ctx = c.getContext("2d")!;
    ctx.globalAlpha = opacity;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  } catch {
    return "";
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Crops an object-fit: cover image to the part that is visible on the slide. */
async function cropImage(img: HTMLImageElement, box: Box, vis: Box, objectPosition: string, opacity: number, maxW: number): Promise<string> {
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  const s = Math.max(box.w / nw, box.h / nh);
  const [fx, fy] = objectPosition.split(/\s+/).map((v) => (v.endsWith("%") ? parseFloat(v) / 100 : 0.5));
  const offX = (box.w - nw * s) * (fx ?? 0.5);
  const offY = (box.h - nh * s) * (fy ?? 0.5);
  const sx = (vis.x - box.x - offX) / s;
  const sy = (vis.y - box.y - offY) / s;
  const sw = vis.w / s;
  const sh = vis.h / s;
  const outW = Math.min(maxW, Math.round(Math.min(sw, vis.w * 1.5)));
  const outH = Math.round((outW * vis.h) / vis.w);
  const c = document.createElement("canvas");
  c.width = Math.max(1, outW);
  c.height = Math.max(1, outH);
  const ctx = c.getContext("2d")!;
  ctx.globalAlpha = opacity;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.9);
}
