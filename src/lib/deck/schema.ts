// Deck Document schema: the single contract shared by the editor, the viewer,
// the API, and the AI pipeline (see docs/04-Technical-Design.md §4).
import { z } from "zod";
import { ICON_NAMES } from "./icons";
import { MEDIA_SRC_RX } from "./media";

export const Id = z.string().regex(/^[a-z0-9_-]{8,32}$/);

export const MOTION_PRESETS = [
  "none",
  "fadeUp",
  "maskReveal",
  "typeOn",
  "scaleIn",
  "draw",
  "countUp",
  "grow",
  "focus",
  "kenBurns", // slow zoom on photos
  "rise", // device mockups rise into place, then their rows build
] as const;
export const MotionPreset = z.enum(MOTION_PRESETS);

export const EASINGS = ["standard", "emphasized", "decelerate", "springSoft", "springSnappy"] as const;
export const TRIGGERS = ["onClick", "withPrevious", "afterPrevious"] as const;

export const Motion = z.object({
  preset: MotionPreset,
  trigger: z.enum(TRIGGERS).default("afterPrevious"),
  order: z.number().int().min(0),
  delayMs: z.number().int().min(0).max(5000).default(0),
  durationMs: z.number().int().min(80).max(3000).default(320),
  easing: z.enum(EASINGS).default("standard"),
});
export type Motion = z.infer<typeof Motion>;

const Base = z.object({
  id: Id,
  slot: z.string().min(1).max(32),
  motion: Motion.optional(),
  // Traceability: which paragraph of the user's notes this came from.
  source: z.array(z.object({ ref: z.string().max(64), span: z.string().max(500).optional() })).default([]),
  // True when the AI produced content (usually a number) that is not in the user's material.
  aiSuggested: z.boolean().default(false),
});

export const TEXT_ROLES = ["h1", "h2", "body", "caption", "quote", "label"] as const;

export const TextEl = Base.extend({
  type: z.literal("text"),
  role: z.enum(TEXT_ROLES),
  content: z.string().max(2000),
});

export const BulletsEl = Base.extend({
  type: z.literal("bullets"),
  items: z.array(z.string().max(160)).max(6),
  // Optional icon per item (same order as items).
  icons: z.array(z.enum(ICON_NAMES)).max(6).optional(),
});

// Photos come from the built-in library (public/media). Base path only; the renderer picks a size.
export const ImageEl = Base.extend({
  type: z.literal("image"),
  src: z.string().regex(MEDIA_SRC_RX),
  alt: z.string().min(1).max(250),
  focal: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).default([0.5, 0.5]),
});

export const TONES = ["ok", "warn", "info", "muted"] as const;

// A drawn product screen inside a phone or browser frame.
export const Screen = z.object({
  app: z.string().max(40),
  heading: z.string().max(70).optional(),
  rows: z
    .array(
      z.object({
        label: z.string().max(60),
        sub: z.string().max(70).optional(),
        value: z.string().max(20).optional(),
        tag: z.string().max(18).optional(),
        tone: z.enum(TONES).optional(),
      }),
    )
    .max(6)
    .default([]),
  kpi: z.object({ label: z.string().max(40), value: z.string().max(20) }).optional(),
  chart: z.array(z.number().finite()).max(14).optional(),
  chartLabel: z.string().max(40).optional(),
  cta: z.string().max(40).optional(),
});
export type Screen = z.infer<typeof Screen>;

export const MockupEl = Base.extend({
  type: z.literal("mockup"),
  device: z.enum(["phone", "browser"]),
  url: z.string().max(80).optional(),
  screen: Screen,
});

export const CHART_KINDS = ["bar", "line", "kpi"] as const;

export const ChartEl = Base.extend({
  type: z.literal("chart"),
  kind: z.enum(CHART_KINDS),
  data: z.object({
    labels: z.array(z.string().max(40)).max(24),
    series: z
      .array(z.object({ name: z.string().max(40), values: z.array(z.number().finite()).max(24) }))
      .min(1)
      .max(4),
  }),
  unit: z.string().max(8).optional(),
  // Optional per-value units for KPI rows (e.g. ["$k", "", "%"]). Falls back to `unit`.
  units: z.array(z.string().max(8)).max(24).optional(),
});

export const Element = z.discriminatedUnion("type", [TextEl, BulletsEl, ChartEl, ImageEl, MockupEl]);
export type Element = z.infer<typeof Element>;
export type TextElement = z.infer<typeof TextEl>;
export type BulletsElement = z.infer<typeof BulletsEl>;
export type ChartElement = z.infer<typeof ChartEl>;
export type ImageElement = z.infer<typeof ImageEl>;
export type MockupElement = z.infer<typeof MockupEl>;

export const TRANSITIONS = ["cut", "fade", "push", "morph"] as const;

export const Slide = z.object({
  id: Id,
  layout: z.string().min(1).max(32),
  elements: z.array(Element).max(20),
  transition: z.enum(TRANSITIONS).default("fade"),
  notes: z.string().max(5000).default(""),
});
export type Slide = z.infer<typeof Slide>;

export const INTENSITIES = ["calm", "standard", "expressive"] as const;
export type Intensity = (typeof INTENSITIES)[number];

export const HEADING_FONTS = ["sans", "serif", "grotesk", "display"] as const;
export const BRAND_PATTERNS = ["blocks", "waves", "grid", "rays", "orbits", "leaf"] as const;

// A simple brand kit: overrides the theme's accent and heading font, and adds a logo,
// a decorative pattern on title/statement/closing slides, and a footer on content slides.
export const Brand = z.object({
  name: z.string().min(1).max(40),
  primary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  secondary: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  font: z.enum(HEADING_FONTS).optional(),
  mark: z.enum(ICON_NAMES),
  pattern: z.enum(BRAND_PATTERNS).default("grid"),
});
export type Brand = z.infer<typeof Brand>;

export const Deck = z.object({
  id: Id,
  version: z.number().int().min(0),
  title: z.string().max(200),
  themeId: z.string().min(1).max(32),
  brand: Brand.optional(),
  aspect: z.enum(["16:9"]).default("16:9"),
  motionIntensity: z.enum(INTENSITIES).default("standard"),
  language: z.string().max(16).default("en"),
  // The user's original material, kept so later AI edits stay grounded in it.
  source: z.string().max(400_000).optional(),
  slides: z.array(Slide).min(1).max(100),
});
export type Deck = z.infer<typeof Deck>;

// Outline (step 2 of New Deck flow) — edited by the user before any design happens.
export const OutlinePoint = z.object({
  text: z.string().max(300),
  source: z.string().max(64).optional(),
});
export const OutlineSlide = z.object({
  title: z.string().max(160),
  points: z.array(OutlinePoint).max(8),
  layoutHint: z.string().max(32).optional(),
});
export const Outline = z.object({
  title: z.string().max(200),
  slides: z.array(OutlineSlide).min(1).max(40),
});
export type Outline = z.infer<typeof Outline>;
export type OutlineSlide = z.infer<typeof OutlineSlide>;

export const DECK_TYPES = ["pitch", "sales", "launch", "lesson", "report", "custom"] as const;
export type DeckType = (typeof DECK_TYPES)[number];

export const GenerationInput = z.object({
  prompt: z.string().max(4000).default(""),
  notes: z.string().max(400_000).default(""), // ~50k words
  deckType: z.enum(DECK_TYPES).default("custom"),
  slideCount: z.union([z.literal("auto"), z.number().int().min(3).max(20)]).default("auto"),
  audience: z.string().max(80).default(""),
  language: z.string().max(32).default("English"),
});
export type GenerationInput = z.infer<typeof GenerationInput>;
