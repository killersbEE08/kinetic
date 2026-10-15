// Converts between the simple "slotted" shape the AI writes and full Slide documents.
// The AI never writes ids, motion, or arbitrary structure — the server compiles those,
// which keeps output valid and makes layout invention impossible.
import { z } from "zod";
import { CHART_KINDS, isFree, Screen, type Element, type Slide } from "./schema";
import { getLayout, LAYOUT_IDS } from "./layouts";
import { ICON_NAMES } from "./icons";
import { MEDIA_SRC_RX } from "./media";
import { newId } from "./ids";

const ChartContent = z.object({
  kind: z.enum(CHART_KINDS),
  labels: z.array(z.string().max(40)).max(24),
  series: z.array(z.object({ name: z.string().max(40), values: z.array(z.number()).max(24) })).min(1).max(4),
  unit: z.string().max(8).optional(),
  units: z.array(z.string().max(8)).max(24).optional(),
});

export const SlotContent = z.object({
  slot: z.string().max(32),
  text: z.string().max(2000).optional(),
  items: z.array(z.string().max(300)).max(10).optional(),
  icons: z.array(z.enum(ICON_NAMES)).max(6).optional(),
  chart: ChartContent.optional(),
  image: z.object({ src: z.string().regex(MEDIA_SRC_RX), alt: z.string().min(1).max(250), focal: z.tuple([z.number(), z.number()]).optional(), credit: z.object({ name: z.string().max(80), url: z.string().max(300) }).optional() }).optional(),
  mockup: z.object({ device: z.enum(["phone", "browser"]), url: z.string().max(80).optional(), screen: Screen }).optional(),
  suggested: z.boolean().optional(),
});
export type SlotContent = z.infer<typeof SlotContent>;

export const SlottedSlide = z.object({
  layout: z.string().max(32),
  slots: z.array(SlotContent).max(10),
  notes: z.string().max(5000).optional(),
});
export type SlottedSlide = z.infer<typeof SlottedSlide>;

/** Builds a valid Slide. Reuses element ids/motion from `existing` for slots that persist. */
export function composeSlide(input: SlottedSlide, existing?: Slide): Slide {
  const layoutId = LAYOUT_IDS.includes(input.layout) ? input.layout : "headlineBody";
  const layout = getLayout(layoutId);
  const prevBySlot = new Map(existing?.elements.map((e) => [e.slot, e]) ?? []);
  const elements: Element[] = [];

  for (const [slotName, def] of Object.entries(layout.slots)) {
    const c = input.slots.find((s) => s.slot === slotName);
    if (!c) continue;
    const prev = prevBySlot.get(slotName);
    const keep = prev && prev.type === def.accepts ? prev : undefined;
    const base = {
      id: keep?.id ?? newId("el"),
      slot: slotName,
      motion: keep?.motion,
      source: keep?.source ?? [],
      aiSuggested: c.suggested ?? false,
      // A hand-placed position and look survive content rewrites.
      ...(keep?.frame ? { frame: keep.frame } : {}),
      ...(keep?.style ? { style: keep.style } : {}),
      ...(keep?.group ? { group: keep.group } : {}),
    };

    if (def.accepts === "text") {
      const text = (c.text ?? c.items?.join(" ") ?? "").trim();
      if (!text) continue;
      elements.push({ ...base, type: "text", role: def.role ?? "body", content: text });
    } else if (def.accepts === "bullets") {
      // Strip list markers ("- ", "• ", "1. ") but keep leading numbers like "81% gross margin".
      const items = (c.items ?? (c.text ? c.text.split(/\n+/) : [])).map((s) => s.replace(/^\s*(?:[-•*]|\d+[.)])\s+/, "").trim()).filter(Boolean);
      if (!items.length) continue;
      const icons = c.icons?.slice(0, Math.min(6, items.length));
      elements.push({ ...base, type: "bullets", items: items.slice(0, 6).map((s) => s.slice(0, 160)), ...(icons?.length ? { icons } : {}) });
    } else if (def.accepts === "chart" && c.chart) {
      const kind = def.chartKind ?? c.chart.kind;
      const labels = c.chart.labels.slice(0, 24);
      const series = c.chart.series.slice(0, 4).map((s) => ({ name: s.name, values: s.values.filter(Number.isFinite).slice(0, 24) }));
      if (!series[0]?.values.length) continue;
      elements.push({ ...base, type: "chart", kind, data: { labels, series }, unit: c.chart.unit, units: c.chart.units?.slice(0, 24) });
    } else if (def.accepts === "image" && c.image) {
      elements.push({ ...base, type: "image", src: c.image.src, alt: c.image.alt, focal: c.image.focal ?? [0.5, 0.5], ...(c.image.credit && /^https:\/\/unsplash\.com\//.test(c.image.credit.url) ? { credit: c.image.credit } : {}) });
    } else if (def.accepts === "mockup" && c.mockup) {
      elements.push({ ...base, type: "mockup", device: c.mockup.device, url: c.mockup.url, screen: c.mockup.screen });
    }
  }

  // Boxes the user added by hand are not part of the layout; keep them as they are.
  if (existing) elements.push(...existing.elements.filter(isFree));

  return {
    id: existing?.id ?? newId("sl"),
    layout: layoutId,
    elements,
    transition: existing?.transition ?? "fade",
    notes: (input.notes ?? existing?.notes ?? "").slice(0, 5000),
  };
}

/** One element back to slot content. */
export function elementToSlot(el: Element): SlotContent {
  const base = { slot: el.slot, suggested: el.aiSuggested };
  switch (el.type) {
    case "text":
      return { ...base, text: el.content };
    case "bullets":
      return { ...base, items: el.items, icons: el.icons };
    case "chart":
      return { ...base, chart: { kind: el.kind, labels: el.data.labels, series: el.data.series, unit: el.unit, units: el.units } };
    case "image":
      return { ...base, image: { src: el.src, alt: el.alt, focal: el.focal, credit: el.credit } };
    case "mockup":
      return { ...base, mockup: { device: el.device, url: el.url, screen: el.screen } };
    case "shape":
      return { ...base, text: el.text };
    case "icon":
      return { ...base };
    case "table":
      return { ...base, text: el.rows.map((r) => r.join(" | ")).join("\n") };
  }
}

/** Reverse of composeSlide: used to give the AI the current content of a slide. */
export function toSlotted(slide: Slide): SlottedSlide {
  return { layout: slide.layout, notes: slide.notes, slots: slide.elements.filter((e) => !isFree(e)).map(elementToSlot) };
}

/**
 * Swaps a slide to another layout while keeping its content (ED-3). Content is matched by
 * kind: headline → headline slot, points → points slot, numbers → chart slot, photo → photo
 * slot. Text that doesn't fit goes to speaker notes so nothing the user wrote is lost.
 */
export function swapLayout(slide: Slide, layoutId: string): Slide {
  const target = getLayout(layoutId);
  const pool = slide.elements.filter((e) => !isFree(e));
  const take = (pred: (e: Element) => boolean) => {
    const i = pool.findIndex(pred);
    return i === -1 ? undefined : pool.splice(i, 1)[0];
  };
  const slots: SlotContent[] = [];

  for (const [name, def] of Object.entries(target.slots)) {
    let el: Element | undefined;
    if (def.accepts === "text") {
      el =
        take((e) => e.type === "text" && e.role === def.role) ??
        (def.role === "h1" ? take((e) => e.type === "text" && (e.role === "h2" || e.role === "quote")) : undefined) ??
        take((e) => e.type === "text" && def.role !== "h1" && e.role !== "h1");
      if (!el && def.required && def.role !== "h1") {
        const b = take((e) => e.type === "bullets");
        if (b && b.type === "bullets") slots.push({ slot: name, text: b.items.join(" "), suggested: b.aiSuggested });
        continue;
      }
      if (el?.type === "text") slots.push({ slot: name, text: el.content, suggested: el.aiSuggested });
    } else if (def.accepts === "bullets") {
      el = take((e) => e.type === "bullets");
      if (el?.type === "bullets") slots.push({ slot: name, items: el.items, icons: el.icons, suggested: el.aiSuggested });
      else {
        const t = take((e) => e.type === "text" && e.role !== "h1");
        if (t?.type === "text") slots.push({ slot: name, items: t.content.split(/(?<=[.?])\s+/).filter(Boolean), suggested: t.aiSuggested });
      }
    } else if (def.accepts === "chart") {
      // Prefer a chart of the right kind (KPI slots take KPIs first).
      el = take((e) => e.type === "chart" && (!def.chartKind || e.kind === def.chartKind)) ?? take((e) => e.type === "chart");
      if (el?.type === "chart") {
        slots.push({ slot: name, chart: { kind: def.chartKind ?? el.kind, labels: el.data.labels, series: el.data.series, unit: el.unit, units: el.units }, suggested: el.aiSuggested });
      }
    } else if (def.accepts === "image" || def.accepts === "mockup") {
      el = take((e) => e.type === def.accepts);
      if (el) slots.push({ ...elementToSlot(el), slot: name });
    }
  }

  const leftovers = pool
    .map((e) => (e.type === "text" ? e.content : e.type === "bullets" ? e.items.map((i) => "- " + i).join("\n") : e.type === "image" ? `(Photo removed: ${e.alt})` : ""))
    .filter(Boolean);
  const notes = [slide.notes, ...leftovers].filter(Boolean).join("\n\n");

  // Reuse ids by slot name only when the element type matches (handled in composeSlide).
  const next = composeSlide({ layout: layoutId, slots, notes }, { ...slide, elements: slide.elements.filter(isFree) });
  return { ...next, id: slide.id, transition: slide.transition };
}
