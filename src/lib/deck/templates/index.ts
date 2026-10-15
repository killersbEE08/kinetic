// Registry of the 22 hand-written sample decks.
import type { Deck } from "../schema";
import { buildDeck } from "../build";
import { newId } from "../ids";
import { PITCH } from "./pitch";
import { LAUNCH } from "./launch";
import { SALES } from "./sales";
import { LESSON } from "./lesson";
import { REPORT } from "./report";
import type { DeckTemplate, TemplateCategory } from "./dsl";

export type { DeckTemplate, TemplateCategory } from "./dsl";

export const TEMPLATES: DeckTemplate[] = [...PITCH, ...LAUNCH, ...SALES, ...LESSON, ...REPORT];

export const CATEGORY_LABEL: Record<TemplateCategory, string> = {
  pitch: "Fundraising",
  launch: "Product launch",
  sales: "Sales proposal",
  lesson: "Lesson",
  report: "Report",
};

export const CATEGORIES = Object.keys(CATEGORY_LABEL) as TemplateCategory[];

export function getTemplate(id: string): DeckTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/** Everything written in the template. Used as the "source" so authored numbers aren't flagged. */
function templateText(t: DeckTemplate): string {
  // Everything authored, including chart values and product-screen text.
  // Indented so array numbers sit on their own lines (a compact "310,420" would read as one number).
  return [t.name, JSON.stringify(t.slides, null, 1)].join("\n");
}

/**
 * Rewrites ids so the same template always renders with the same ids. This keeps server and
 * client renders identical (no hydration mismatch) and gives stable React keys.
 */
export function stabilizeIds(deck: Deck, prefix: string): Deck {
  const p = prefix.slice(0, 20);
  return {
    ...deck,
    id: `tpl-${p}`.slice(0, 32),
    slides: deck.slides.map((s, i) => ({
      ...s,
      id: `${p}-s${i}`,
      elements: s.elements.map((e, j) => ({ ...e, id: `${p}-s${i}e${j}` })),
    })),
  };
}

const cache = new Map<string, Deck>();

/** The template as a complete, quality-checked deck (cached). */
export function templateDeck(id: string): Deck | undefined {
  const hit = cache.get(id);
  if (hit) return hit;
  const t = getTemplate(id);
  if (!t) return undefined;
  const { deck } = buildDeck({ title: t.name, slides: t.slides, themeId: t.themeId, intensity: t.intensity, sourceText: templateText(t) });
  // Headlines and logos glide between slides (view transitions); calm decks fade.
  const slides = deck.slides.map((s, i) => ({ ...s, transition: i === 0 ? s.transition : t.intensity === "calm" ? ("fade" as const) : ("morph" as const) }));
  const stable = stabilizeIds({ ...deck, slides, brand: t.brand, source: undefined }, t.id);
  cache.set(id, stable);
  return stable;
}

/** A copy of a deck with a fresh id, for saving as the user's own deck. */
export function forkDeck(deck: Deck): Deck {
  return { ...structuredClone(deck), id: newId("dk"), version: 0 };
}

export const TEMPLATE_SLIDE_COUNT = TEMPLATES.reduce((n, t) => n + t.slides.length, 0);
