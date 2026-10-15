"use client";

// PowerPoint export. Every slide becomes native, editable objects: text boxes, shapes, pictures
// and real charts (you can edit their data in PowerPoint). Build animations, transitions
// (including Morph) and speaker notes are written too.
import type PptxGenJS from "pptxgenjs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { ChartElement, Deck, ShapeKind } from "@/lib/deck/schema";
import { resolveTimeline } from "@/lib/deck/motion";
import { deckTheme } from "@/lib/deck/themes";
import { captureScene, type Rgba, type SceneItem, type SceneText } from "./scene";
import { forEachRenderedSlide, STAGE_W } from "./render";
import { injectSlideXml, shapeIds, timingXml, transitionXml, uniqueShapeIds, type Effect } from "./timing";

export interface PptxOptions {
  /** "original" uses the deck's web fonts (install them for an exact match); "office" uses Arial and Georgia. */
  fonts: "original" | "office";
  animations: boolean;
  notes: boolean;
}

const IN_PER_PX = 13.333 / STAGE_W; // LAYOUT_WIDE is 13.333 × 7.5 in
const PT_PER_PX = 0.5;
const inch = (v: number) => Math.round(v * IN_PER_PX * 1000) / 1000;

const FONTS = {
  original: { sans: "Inter", serif: "Source Serif 4", grotesk: "Space Grotesk", display: "Fraunces" },
  office: { sans: "Arial", serif: "Georgia", grotesk: "Arial", display: "Georgia" },
} as const;

const transparency = (c: Rgba) => Math.round((1 - c.alpha) * 100);

function numberFormat(el: ChartElement): string {
  const all = el.data.series.flatMap((s) => s.values);
  const decimals = Math.min(2, Math.max(0, ...all.map((v) => (Number.isInteger(v) ? 0 : String(v).split(".")[1]?.length ?? 0))));
  const core = "#,##0" + (decimals ? "." + "0".repeat(decimals) : "");
  const unit = el.unit ?? "";
  const pre = /^[$€£₹]/.test(unit) ? unit[0] : "";
  const suf = pre ? unit.slice(1) : unit;
  return `${pre ? `"${pre}"` : ""}${core}${suf ? `"${suf}"` : ""}`;
}

function addChart(pptx: PptxGenJS, slide: PptxGenJS.Slide, it: Extract<SceneItem, { kind: "chart" }>, colors: { accent: string; accent2: string; text: string; muted: string; rule: string }, font: string, name: string) {
  const el = it.el;
  const pos = { x: inch(it.box.x), y: inch(it.box.y), w: inch(it.box.w), h: inch(it.box.h) };
  const data = el.data.series.map((s) => ({ name: s.name, labels: el.data.labels.slice(0, s.values.length), values: s.values }));
  const hex = (c: string) => c.replace("#", "").toUpperCase();
  const common = {
    ...pos,
    objectName: name,
    altText: `${el.kind} chart: ${el.data.labels.map((l, i) => `${l} ${el.data.series[0]?.values[i] ?? ""}`).join(", ")}`,
    catAxisLabelColor: hex(colors.muted),
    catAxisLabelFontFace: font,
    catAxisLabelFontSize: 14,
    catAxisLineShow: true,
    catAxisLineColor: hex(colors.rule),
    catAxisMajorTickMark: "none" as const,
    valAxisHidden: true,
    valGridLine: { style: "none" as const },
    catGridLine: { style: "none" as const },
    showLegend: el.data.series.length > 1,
    legendPos: "t" as const,
    legendFontFace: font,
    legendColor: hex(colors.muted),
    dataLabelFormatCode: numberFormat(el),
  };
  if (el.kind === "bar") {
    const values = el.data.series[0]?.values ?? [];
    const peak = values.indexOf(Math.max(...values));
    // One series: colour each bar, highlighting the last and the peak like the slide does.
    const perBar = values.map((_, i) => (i === values.length - 1 || i === peak ? hex(colors.accent) : hex(colors.accent2)));
    slide.addChart(pptx.ChartType.bar, data, {
      ...common,
      barDir: "col",
      barGapWidthPct: 60,
      chartColors: el.data.series.length > 1 ? [hex(colors.accent), hex(colors.accent2)] : perBar,
      showValue: true,
      dataLabelPosition: "outEnd",
      dataLabelColor: hex(colors.text),
      dataLabelFontFace: font,
      dataLabelFontSize: 16,
      dataLabelFontBold: true,
    });
  } else {
    slide.addChart(pptx.ChartType.line, data, {
      ...common,
      chartColors: [hex(colors.accent), hex(colors.accent2), hex(colors.muted), hex(colors.text)],
      lineSize: 3.5,
      lineDataSymbol: "circle",
      lineDataSymbolSize: 9,
      showValue: false,
    });
  }
}

const SHAPE_TYPE: Record<ShapeKind, string> = { rect: "rect", roundRect: "roundRect", ellipse: "ellipse", triangle: "triangle", diamond: "diamond", line: "line", arrow: "line", star: "star5" };

type Fonts = (typeof FONTS)[keyof typeof FONTS];
type Pos = { x: number; y: number; w: number; h: number };

function textOpts(t: SceneText, fonts: Fonts) {
  return {
    fontFace: fonts[t.family],
    fontSize: Math.round(t.fontPx * PT_PER_PX * 10) / 10,
    bold: t.weight >= 600,
    italic: t.italic,
    color: t.color.hex,
    transparency: transparency(t.color),
    align: t.align,
    valign: t.valign,
    ...(t.underline ? { underline: { style: "sng" as const } } : {}),
  };
}

function addShape(pptx: PptxGenJS, slide: PptxGenJS.Slide, it: Extract<SceneItem, { kind: "shape" }>, pos: Pos, name: string, fonts: Fonts) {
  const isLine = it.shape === "line" || it.shape === "arrow";
  // Lines are drawn through the middle of their box.
  const p = isLine ? { ...pos, y: pos.y + pos.h / 2, h: 0 } : pos;
  const line = it.line
    ? { color: it.line.color.hex, width: it.line.width * PT_PER_PX, transparency: transparency(it.line.color), ...(it.shape === "arrow" ? { endArrowType: "triangle" as const } : {}) }
    : { type: "none" as const };
  const opts = {
    ...p,
    objectName: name,
    fill: it.fill && !isLine ? { color: it.fill.hex, transparency: transparency(it.fill) } : { type: "none" as const },
    line,
    ...(it.shape === "roundRect" || (it.shape === "rect" && it.radius > 0) ? { rectRadius: inch(Math.min(it.radius, (pos.w / IN_PER_PX) / 2, (pos.h / IN_PER_PX) / 2)) } : {}),
  };
  const type = (it.shape === "rect" && it.radius > 0 ? "roundRect" : SHAPE_TYPE[it.shape]) as PptxGenJS.ShapeType;
  if (it.text && !isLine) slide.addText(it.text.text, { ...opts, shape: type, ...textOpts(it.text, fonts), margin: 18 * PT_PER_PX, fit: "none" });
  else slide.addShape(type, opts);
}

function addTable(slide: PptxGenJS.Slide, it: Extract<SceneItem, { kind: "table" }>, pos: Pos, name: string, fonts: Fonts) {
  const border = { type: "solid" as const, pt: Math.max(0.25, it.border.width * PT_PER_PX), color: it.border.color.hex };
  const rows = it.rows.map((r) =>
    r.cells.map((cell) => ({
      text: cell.text,
      options: { ...textOpts(cell, fonts), valign: "middle" as const, fill: cell.fill ? { color: cell.fill.hex } : undefined, border: [border, border, border, border] as [typeof border, typeof border, typeof border, typeof border], margin: 0.08 },
    })),
  );
  slide.addTable(rows, { x: pos.x, y: pos.y, w: pos.w, colW: it.colW.map((w) => inch(w)), rowH: it.rows.map((r) => inch(r.h)), objectName: name, autoPage: false });
}

/** Builds the .pptx in the browser and returns it as a Blob. */
export async function exportPptx(deck: Deck, opts: PptxOptions, onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const { default: Pptx } = await import("pptxgenjs");
  const pptx = new Pptx();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = deck.title;
  pptx.subject = deck.title;
  pptx.company = deck.brand?.name ?? "";
  pptx.author = "Kinetic";
  const fonts = FONTS[opts.fonts];
  pptx.theme = { headFontFace: fonts.sans, bodyFontFace: fonts.sans };
  const theme = deckTheme(deck);

  // Per slide: object name → animation, filled while adding shapes.
  const plans: { effects: { name: string; kind: "sp" | "pic" | "chart"; base: Omit<Effect, "shape"> }[] }[] = [];

  await forEachRenderedSlide(
    deck,
    async (stage, ds, index) => {
      const scene = await captureScene(stage, ds);
      const slide = pptx.addSlide();
      slide.background = { color: scene.bg.hex };
      const timeline = resolveTimeline(ds, deck.motionIntensity);
      const prev = deck.slides[index - 1];
      const morphing = ds.transition === "morph" && index > 0;
      const prevHasTitle = !!prev?.elements.some((e) => e.type === "text" && e.role === "h1");
      const fullBleed = ds.layout === "titleImage" || ds.layout === "imageStatement";
      const plan: (typeof plans)[number] = { effects: [] };
      const usedRoles = new Set<string>();
      let n = 0;

      for (const it of scene.items) {
        n++;
        // Morph matches objects by name; "!!" names force a match across slides.
        let name = `k${n}`;
        if (it.owner?.role && !usedRoles.has(it.owner.role) && (it.kind === "text" || it.kind === "image")) {
          name = `!!${it.owner.role}`;
          usedRoles.add(it.owner.role);
        }
        const pos = { x: inch(it.box.x), y: inch(it.box.y), w: Math.max(0.01, inch(it.box.w)), h: Math.max(0.01, inch(it.box.h)) };
        let kind: "sp" | "pic" | "chart" = "sp";

        if (it.kind === "rect") {
          const shape = it.ellipse ? pptx.ShapeType.ellipse : it.radius > 0 ? pptx.ShapeType.roundRect : pptx.ShapeType.rect;
          slide.addShape(shape, {
            ...pos,
            objectName: name,
            fill: it.fill ? { color: it.fill.hex, transparency: transparency(it.fill) } : { type: "none" },
            line: it.line ? { color: it.line.color.hex, width: it.line.width * PT_PER_PX, transparency: transparency(it.line.color) } : { type: "none" },
            ...(it.radius > 0 && !it.ellipse ? { rectRadius: inch(Math.min(it.radius, it.box.w / 2, it.box.h / 2)) } : {}),
          });
        } else if (it.kind === "text") {
          slide.addText(it.text, {
            ...pos,
            objectName: name,
            fontFace: fonts[it.family],
            fontSize: Math.round(it.fontPx * PT_PER_PX * 10) / 10,
            bold: it.weight >= 600,
            italic: it.italic,
            color: it.color.hex,
            transparency: transparency(it.color),
            charSpacing: Math.round(it.letterPx * PT_PER_PX * 10) / 10 || undefined,
            lineSpacing: Math.round(it.lineHeightPx * PT_PER_PX * 10) / 10,
            align: it.align,
            valign: "top",
            margin: 0,
            fit: "none",
            wrap: !it.nowrap,
            isTextBox: true,
            ...(it.underline ? { underline: { style: "sng" as const } } : {}),
          });
        } else if (it.kind === "image") {
          kind = "pic";
          slide.addImage({ data: it.dataUrl.replace(/^data:/, ""), ...pos, objectName: name, altText: it.alt || undefined });
        } else if (it.kind === "shape") {
          addShape(pptx, slide, it, pos, name, fonts);
        } else if (it.kind === "table") {
          kind = "pic"; // a graphic frame: animated as one object, no build entry
          addTable(slide, it, pos, name, fonts);
        } else {
          kind = "chart";
          addChart(pptx, slide, it, theme.colors, fonts.sans, name);
        }

        if (!opts.animations || !it.owner) continue;
        const m = timeline.get(it.owner.elId);
        if (!m || m.preset === "none") continue;
        if (name === "!!title" && morphing && prevHasTitle) continue; // the headline glides in with Morph instead
        plan.effects.push({
          name,
          kind,
          base: {
            preset: m.preset,
            step: m.step,
            delayMs: it.owner.itemDelay ?? m.delayMs,
            durationMs: m.preset === "kenBurns" ? (fullBleed ? 3000 : 600) : m.durationMs,
            fullBleed,
          },
        });
      }

      if (opts.notes && ds.notes.trim()) slide.addNotes(ds.notes);
      plans[index] = plan;
    },
    onProgress,
  );

  const raw = (await pptx.write({ outputType: "uint8array", compression: true })) as Uint8Array;
  const files = unzipSync(raw);
  deck.slides.forEach((ds, i) => {
    const path = `ppt/slides/slide${i + 1}.xml`;
    const xml = files[path] ? uniqueShapeIds(strFromU8(files[path])) : null;
    if (!xml) return;
    const ids = shapeIds(xml);
    const effects: Effect[] = (plans[i]?.effects ?? []).flatMap((e) => {
      const spid = ids.get(e.name);
      return spid ? [{ ...e.base, shape: { spid, kind: e.kind } }] : [];
    });
    files[path] = strToU8(injectSlideXml(xml, transitionXml(ds.transition, i === 0), timingXml(effects)));
  });
  return new Blob([zipSync(files, { level: 6 }) as BlobPart], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
}
