// Layout registry data (docs/02 §6.2). Pure data so it can be used by the server
// (AI prompts, validation, QA) and the client renderer alike.
import type { Element, Motion } from "./schema";

export interface SlotDef {
  accepts: Element["type"];
  role?: "h1" | "h2" | "body" | "caption" | "quote" | "label";
  chartKind?: "bar" | "line" | "kpi";
  required: boolean;
  maxWords?: number;
  maxItems?: number;
}

export interface LayoutDef {
  id: string;
  name: string;
  category: "Opening" | "Narrative" | "Data" | "Structure" | "Visual" | "People" | "Closing";
  description: string; // used in the AI prompt
  /** False for layouts that need assets the AI can't supply (photos, product screens). */
  ai: boolean;
  slots: Record<string, SlotDef>;
  // Default build per slot. Order is the build order.
  defaultMotion: Record<string, Pick<Motion, "preset" | "trigger" | "order">>;
}

const fade = (order: number, trigger: Motion["trigger"] = "afterPrevious") => ({ preset: "fadeUp" as const, trigger, order });
const mask = (order: number) => ({ preset: "maskReveal" as const, trigger: "afterPrevious" as const, order });
const ken = (order = 0) => ({ preset: "kenBurns" as const, trigger: "withPrevious" as const, order });

export const LAYOUTS: LayoutDef[] = [
  {
    id: "title",
    name: "Title",
    category: "Opening",
    description: "Opening slide: deck title and one short subtitle line.",
    ai: true,
    slots: {
      title: { accepts: "text", role: "h1", required: true, maxWords: 10 },
      subtitle: { accepts: "text", role: "caption", required: false, maxWords: 20 },
    },
    defaultMotion: { title: mask(0), subtitle: fade(1) },
  },
  {
    id: "titleImage",
    name: "Title on photo",
    category: "Opening",
    description: "Opening slide with a full-bleed photo behind the title.",
    ai: false,
    slots: {
      media: { accepts: "image", required: true },
      title: { accepts: "text", role: "h1", required: true, maxWords: 10 },
      subtitle: { accepts: "text", role: "caption", required: false, maxWords: 20 },
    },
    defaultMotion: { media: ken(0), title: mask(1), subtitle: fade(2) },
  },
  {
    id: "statement",
    name: "Big statement",
    category: "Narrative",
    description: "One strong sentence alone on the slide. Use for a thesis or a turning point.",
    ai: true,
    slots: { statement: { accepts: "text", role: "h1", required: true, maxWords: 16 } },
    defaultMotion: { statement: { preset: "typeOn", trigger: "afterPrevious", order: 0 } },
  },
  {
    id: "imageStatement",
    name: "Statement on photo",
    category: "Visual",
    description: "One strong sentence over a full-bleed photo.",
    ai: false,
    slots: {
      media: { accepts: "image", required: true },
      statement: { accepts: "text", role: "h1", required: true, maxWords: 16 },
    },
    defaultMotion: { media: ken(0), statement: { preset: "typeOn", trigger: "afterPrevious", order: 1 } },
  },
  {
    id: "headlineBody",
    name: "Headline + body",
    category: "Narrative",
    description: "Headline with a short paragraph (max 40 words).",
    ai: true,
    slots: {
      title: { accepts: "text", role: "h1", required: true, maxWords: 12 },
      body: { accepts: "text", role: "body", required: true, maxWords: 40 },
    },
    defaultMotion: { title: mask(0), body: fade(1) },
  },
  {
    id: "bullets",
    name: "Headline + points",
    category: "Narrative",
    description: "Headline with 2–5 short points. Each point max 12 words.",
    ai: true,
    slots: {
      title: { accepts: "text", role: "h1", required: true, maxWords: 12 },
      points: { accepts: "bullets", required: true, maxItems: 5, maxWords: 12 },
    },
    defaultMotion: { title: mask(0), points: fade(1) },
  },
  {
    id: "split",
    name: "Photo + points",
    category: "Visual",
    description: "A photo filling the left half, with a headline and 2–4 points on the right.",
    ai: false,
    slots: {
      media: { accepts: "image", required: true },
      title: { accepts: "text", role: "h1", required: true, maxWords: 12 },
      points: { accepts: "bullets", required: true, maxItems: 4, maxWords: 12 },
    },
    defaultMotion: { media: ken(0), title: mask(1), points: fade(2) },
  },
  {
    id: "iconGrid",
    name: "Icon grid",
    category: "Structure",
    description: "Headline and 3–6 cards, each with an icon, a short title and one line. Write each item as 'Title: one line'.",
    ai: true,
    slots: {
      title: { accepts: "text", role: "h1", required: true, maxWords: 12 },
      grid: { accepts: "bullets", required: true, maxItems: 6, maxWords: 14 },
    },
    defaultMotion: { title: mask(0), grid: { preset: "scaleIn", trigger: "afterPrevious", order: 1 } },
  },
  {
    id: "product",
    name: "Product screen",
    category: "Visual",
    description: "A product screen in a phone or browser frame, with up to 3 callouts.",
    ai: false,
    slots: {
      title: { accepts: "text", role: "h1", required: true, maxWords: 10 },
      mockup: { accepts: "mockup", required: true },
      callouts: { accepts: "bullets", required: false, maxItems: 3, maxWords: 10 },
    },
    defaultMotion: { title: mask(0), mockup: { preset: "rise", trigger: "afterPrevious", order: 1 }, callouts: fade(2) },
  },
  {
    id: "twoColumn",
    name: "Two column",
    category: "Narrative",
    description: "Compare two things side by side (before/after, us/them, problem/solution).",
    ai: true,
    slots: {
      title: { accepts: "text", role: "h1", required: true, maxWords: 12 },
      leftLabel: { accepts: "text", role: "label", required: true, maxWords: 4 },
      left: { accepts: "bullets", required: true, maxItems: 4, maxWords: 10 },
      rightLabel: { accepts: "text", role: "label", required: true, maxWords: 4 },
      right: { accepts: "bullets", required: true, maxItems: 4, maxWords: 10 },
    },
    defaultMotion: {
      title: mask(0),
      leftLabel: fade(1),
      left: { preset: "fadeUp", trigger: "withPrevious", order: 2 },
      rightLabel: fade(3),
      right: { preset: "fadeUp", trigger: "withPrevious", order: 4 },
    },
  },
  {
    id: "bigNumber",
    name: "Big number",
    category: "Data",
    description: "One key metric shown huge, with a label and one line of context.",
    ai: true,
    slots: {
      number: { accepts: "chart", chartKind: "kpi", required: true },
      label: { accepts: "text", role: "h1", required: true, maxWords: 8 },
      context: { accepts: "text", role: "caption", required: false, maxWords: 24 },
    },
    defaultMotion: {
      number: { preset: "countUp", trigger: "afterPrevious", order: 0 },
      label: fade(1),
      context: fade(2),
    },
  },
  {
    id: "kpiRow",
    name: "KPI row",
    category: "Data",
    description: "Headline plus 3–4 metrics in a row, each with a short label.",
    ai: true,
    slots: {
      title: { accepts: "text", role: "h1", required: true, maxWords: 12 },
      kpis: { accepts: "chart", chartKind: "kpi", required: true },
    },
    defaultMotion: { title: mask(0), kpis: { preset: "countUp", trigger: "afterPrevious", order: 1 } },
  },
  {
    id: "chartFocus",
    name: "Chart + key number",
    category: "Data",
    description: "Headline, a bar or line chart, and one highlighted number with a short label beside it.",
    ai: true,
    slots: {
      title: { accepts: "text", role: "h1", required: true, maxWords: 12 },
      chart: { accepts: "chart", required: true },
      number: { accepts: "chart", chartKind: "kpi", required: true },
      caption: { accepts: "text", role: "caption", required: false, maxWords: 16 },
    },
    defaultMotion: {
      title: mask(0),
      chart: { preset: "grow", trigger: "afterPrevious", order: 1 },
      number: { preset: "countUp", trigger: "afterPrevious", order: 2 },
      caption: { preset: "fadeUp", trigger: "withPrevious", order: 3 },
    },
  },
  {
    id: "barChart",
    name: "Bar chart",
    category: "Data",
    description: "Headline that states the takeaway, a bar chart (up to 12 bars), and a source caption.",
    ai: true,
    slots: {
      title: { accepts: "text", role: "h1", required: true, maxWords: 12 },
      chart: { accepts: "chart", chartKind: "bar", required: true },
      caption: { accepts: "text", role: "caption", required: false, maxWords: 16 },
    },
    defaultMotion: { title: mask(0), chart: { preset: "grow", trigger: "afterPrevious", order: 1 }, caption: fade(2) },
  },
  {
    id: "lineChart",
    name: "Line chart",
    category: "Data",
    description: "Headline that states the trend, a line chart over time, and a source caption.",
    ai: true,
    slots: {
      title: { accepts: "text", role: "h1", required: true, maxWords: 12 },
      chart: { accepts: "chart", chartKind: "line", required: true },
      caption: { accepts: "text", role: "caption", required: false, maxWords: 16 },
    },
    defaultMotion: { title: mask(0), chart: { preset: "draw", trigger: "afterPrevious", order: 1 }, caption: fade(2) },
  },
  {
    id: "process",
    name: "3-step process",
    category: "Structure",
    description: "Headline with 3–4 sequential steps. Each step max 10 words.",
    ai: true,
    slots: {
      title: { accepts: "text", role: "h1", required: true, maxWords: 12 },
      steps: { accepts: "bullets", required: true, maxItems: 4, maxWords: 10 },
    },
    defaultMotion: { title: mask(0), steps: fade(1) },
  },
  {
    id: "timeline",
    name: "Timeline",
    category: "Structure",
    description: "Headline and 3–5 dated milestones on a line. Write each as 'When: what happens'.",
    ai: true,
    slots: {
      title: { accepts: "text", role: "h1", required: true, maxWords: 12 },
      milestones: { accepts: "bullets", required: true, maxItems: 5, maxWords: 10 },
    },
    defaultMotion: { title: mask(0), milestones: { preset: "draw", trigger: "afterPrevious", order: 1 } },
  },
  {
    id: "team",
    name: "Team",
    category: "People",
    description: "Headline and 2–4 people. Write each as 'Name: Role. One line of background'.",
    ai: true,
    slots: {
      title: { accepts: "text", role: "h1", required: true, maxWords: 8 },
      people: { accepts: "bullets", required: true, maxItems: 4, maxWords: 14 },
    },
    defaultMotion: { title: mask(0), people: { preset: "scaleIn", trigger: "afterPrevious", order: 1 } },
  },
  {
    id: "quote",
    name: "Quote",
    category: "Narrative",
    description: "A quote taken word for word from the user's material, with attribution. Never invent quotes.",
    ai: true,
    slots: {
      quote: { accepts: "text", role: "quote", required: true, maxWords: 40 },
      attribution: { accepts: "text", role: "caption", required: true, maxWords: 10 },
    },
    defaultMotion: { quote: { preset: "typeOn", trigger: "afterPrevious", order: 0 }, attribution: fade(1) },
  },
  {
    id: "closing",
    name: "CTA / Ask",
    category: "Closing",
    description: "Closing slide: the ask or next step, one supporting line, and contact details.",
    ai: true,
    slots: {
      title: { accepts: "text", role: "h1", required: true, maxWords: 10 },
      body: { accepts: "text", role: "body", required: false, maxWords: 30 },
      contact: { accepts: "text", role: "caption", required: false, maxWords: 12 },
    },
    defaultMotion: { title: mask(0), body: fade(1), contact: fade(2) },
  },
  {
    id: "blank",
    name: "Blank",
    category: "Structure",
    description: "An empty slide for placing text, photos and shapes by hand.",
    ai: false,
    slots: {},
    defaultMotion: {},
  },
];

export const LAYOUT_IDS = LAYOUTS.map((l) => l.id);
/** Layouts the AI may choose. Photo and product-screen layouts need assets it can't create. */
export const AI_LAYOUT_IDS = LAYOUTS.filter((l) => l.ai).map((l) => l.id);

export function getLayout(id: string): LayoutDef {
  return LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[4];
}

/** Splits "Title: rest" items used by icon grids, timelines and team slides. */
export function splitItem(item: string): { head: string; rest: string } {
  const i = item.indexOf(": ");
  return i > 0 && i < 48 ? { head: item.slice(0, i), rest: item.slice(i + 2) } : { head: item, rest: "" };
}
