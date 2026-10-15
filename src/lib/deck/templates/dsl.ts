// Small authoring helpers for hand-written sample decks. Each returns the same "slotted"
// shape the AI produces, so templates go through the same compose + quality-gate path.
import type { SlottedSlide, SlotContent } from "../compose";
import type { Brand, Intensity, Screen } from "../schema";
import type { IconName } from "../icons";
import { getMedia } from "../media";

export type TemplateCategory = "pitch" | "launch" | "sales" | "lesson" | "report";

export interface DeckTemplate {
  id: string; // lowercase, used to build stable ids (≤ 20 chars)
  name: string;
  company: string;
  category: TemplateCategory;
  summary: string;
  themeId: string;
  intensity: Intensity;
  brand: Brand;
  /** Slide indexes shown when a thumbnail auto-plays in galleries. */
  highlights?: number[];
  slides: SlottedSlide[];
}

export interface MockupSpec {
  device: "phone" | "browser";
  url?: string;
  screen: Partial<Screen> & { app: string };
}

const opt = (slot: string, text?: string): SlotContent[] => (text ? [{ slot, text }] : []);

function photo(id: string): SlotContent["image"] {
  const m = getMedia(id);
  if (!m) throw new Error(`Unknown media id: ${id}`);
  return { src: m.src, alt: m.alt, focal: m.focal };
}

export const title = (t: string, subtitle?: string, notes?: string): SlottedSlide => ({ layout: "title", slots: [{ slot: "title", text: t }, ...opt("subtitle", subtitle)], notes });

export const titleImage = (t: string, subtitle: string | undefined, media: string, notes?: string): SlottedSlide => ({
  layout: "titleImage",
  slots: [{ slot: "media", image: photo(media) }, { slot: "title", text: t }, ...opt("subtitle", subtitle)],
  notes,
});

export const statement = (t: string, notes?: string): SlottedSlide => ({ layout: "statement", slots: [{ slot: "statement", text: t }], notes });

export const imageStatement = (t: string, media: string, notes?: string): SlottedSlide => ({ layout: "imageStatement", slots: [{ slot: "media", image: photo(media) }, { slot: "statement", text: t }], notes });

export const body = (t: string, text: string, notes?: string): SlottedSlide => ({ layout: "headlineBody", slots: [{ slot: "title", text: t }, { slot: "body", text }], notes });

/** Points; pass [icon, text] pairs to show an icon per point. */
export const points = (t: string, items: (string | [IconName, string])[], notes?: string): SlottedSlide => {
  const withIcons = items.every((i) => Array.isArray(i));
  return {
    layout: "bullets",
    slots: [{ slot: "title", text: t }, { slot: "points", items: items.map((i) => (Array.isArray(i) ? i[1] : i)), ...(withIcons ? { icons: items.map((i) => (i as [IconName, string])[0]) } : {}) }],
    notes,
  };
};

export const split = (t: string, media: string, items: [IconName, string][], notes?: string): SlottedSlide => ({
  layout: "split",
  slots: [{ slot: "media", image: photo(media) }, { slot: "title", text: t }, { slot: "points", items: items.map((i) => i[1]), icons: items.map((i) => i[0]) }],
  notes,
});

/** cells: [icon, title, one line] */
export const iconGrid = (t: string, cells: [IconName, string, string][], notes?: string): SlottedSlide => ({
  layout: "iconGrid",
  slots: [{ slot: "title", text: t }, { slot: "grid", items: cells.map(([, h, r]) => `${h}: ${r}`), icons: cells.map((c) => c[0]) }],
  notes,
});

export const product = (t: string, mockup: MockupSpec, callouts: [IconName, string][], notes?: string): SlottedSlide => ({
  layout: "product",
  slots: [
    { slot: "title", text: t },
    { slot: "mockup", mockup: { device: mockup.device, url: mockup.url, screen: { rows: [], ...mockup.screen } } },
    { slot: "callouts", items: callouts.map((c) => c[1]), icons: callouts.map((c) => c[0]) },
  ],
  notes,
});

export const compare = (t: string, left: [string, string[]], right: [string, string[]], notes?: string): SlottedSlide => ({
  layout: "twoColumn",
  slots: [
    { slot: "title", text: t },
    { slot: "leftLabel", text: left[0] },
    { slot: "left", items: left[1] },
    { slot: "rightLabel", text: right[0] },
    { slot: "right", items: right[1] },
  ],
  notes,
});

export const big = (value: number, unit: string | undefined, label: string, context?: string, notes?: string): SlottedSlide => ({
  layout: "bigNumber",
  slots: [{ slot: "number", chart: { kind: "kpi", labels: [label], series: [{ name: "Value", values: [value] }], unit } }, { slot: "label", text: label }, ...opt("context", context)],
  notes,
});

/** items: [label, value, unit?] */
export const kpis = (t: string, items: [string, number, string?][], notes?: string): SlottedSlide => ({
  layout: "kpiRow",
  slots: [
    { slot: "title", text: t },
    { slot: "kpis", chart: { kind: "kpi", labels: items.map((i) => i[0]), series: [{ name: "Value", values: items.map((i) => i[1]) }], units: items.map((i) => i[2] ?? "") } },
  ],
  notes,
});

export const bars = (t: string, labels: string[], values: number[], unit: string | undefined, caption?: string, notes?: string): SlottedSlide => ({
  layout: "barChart",
  slots: [{ slot: "title", text: t }, { slot: "chart", chart: { kind: "bar", labels, series: [{ name: "Value", values }], unit } }, ...opt("caption", caption)],
  notes,
});

export const lines = (t: string, labels: string[], values: number[], unit: string | undefined, caption?: string, notes?: string): SlottedSlide => ({
  layout: "lineChart",
  slots: [{ slot: "title", text: t }, { slot: "chart", chart: { kind: "line", labels, series: [{ name: "Value", values }], unit } }, ...opt("caption", caption)],
  notes,
});

/** A bar or line chart with one highlighted number beside it. callout: [value, unit, label] */
export const chartFocus = (
  t: string,
  kind: "bar" | "line",
  labels: string[],
  values: number[],
  unit: string | undefined,
  callout: [number, string | undefined, string],
  notes?: string,
): SlottedSlide => ({
  layout: "chartFocus",
  slots: [
    { slot: "title", text: t },
    { slot: "chart", chart: { kind, labels, series: [{ name: "Value", values }], unit } },
    { slot: "number", chart: { kind: "kpi", labels: [callout[2].slice(0, 40)], series: [{ name: "Value", values: [callout[0]] }], unit: callout[1] } },
    { slot: "caption", text: callout[2] },
  ],
  notes,
});

export const steps = (t: string, items: (string | [IconName, string])[], notes?: string): SlottedSlide => {
  const withIcons = items.every((i) => Array.isArray(i));
  return {
    layout: "process",
    slots: [{ slot: "title", text: t }, { slot: "steps", items: items.map((i) => (Array.isArray(i) ? i[1] : i)), ...(withIcons ? { icons: items.map((i) => (i as [IconName, string])[0]) } : {}) }],
    notes,
  };
};

/** milestones: [when, what] */
export const timeline = (t: string, milestones: [string, string][], notes?: string): SlottedSlide => ({
  layout: "timeline",
  slots: [{ slot: "title", text: t }, { slot: "milestones", items: milestones.map(([w, x]) => `${w}: ${x}`) }],
  notes,
});

/** people: [name, role, one line] */
export const team = (t: string, people: [string, string, string][], notes?: string): SlottedSlide => ({
  layout: "team",
  slots: [{ slot: "title", text: t }, { slot: "people", items: people.map(([n, r, d]) => `${n}: ${r}. ${d}`) }],
  notes,
});

export const quote = (text: string, attribution: string, notes?: string): SlottedSlide => ({ layout: "quote", slots: [{ slot: "quote", text }, { slot: "attribution", text: attribution }], notes });

export const close = (t: string, text?: string, contact?: string, notes?: string): SlottedSlide => ({ layout: "closing", slots: [{ slot: "title", text: t }, ...opt("body", text), ...opt("contact", contact)], notes });
