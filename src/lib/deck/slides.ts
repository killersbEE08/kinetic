// Slide-level helpers: hidden slides, backgrounds, and copying slides between decks.
import { newId } from "./ids";
import type { Deck, ImageElement, Slide, SlideBackground } from "./schema";

/** The deck as an audience sees it: hidden slides removed. If every slide is hidden, nothing is removed. */
export function presentable(deck: Deck): Deck {
  const slides = deck.slides.filter((s) => !s.hidden);
  return slides.length ? { ...deck, slides } : deck;
}

/** Index in `presentable(deck)` to start at for editor slide `index` (the next shown slide if it is hidden). */
export function presentIndex(deck: Deck, index: number): number {
  const shown = deck.slides.map((s, i) => ({ s, i })).filter(({ s }) => !s.hidden);
  if (!shown.length) return Math.max(0, Math.min(index, deck.slides.length - 1));
  const k = shown.findIndex(({ i }) => i >= index);
  return k >= 0 ? k : shown.length - 1;
}

export const hiddenCount = (deck: Deck) => deck.slides.filter((s) => s.hidden).length;

/** Relative luminance (0 dark … 1 light) of a #rrggbb colour. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** Text colours that read well on a background, as slide CSS variables. */
export function backgroundVars(bg: SlideBackground | undefined): Record<string, string> {
  if (!bg) return {};
  const vars: Record<string, string> = {};
  if (bg.color) vars["--k-bg"] = bg.color;
  const dark = bg.image ? true : bg.color ? luminance(bg.color) < 0.33 : false;
  if (!bg.image && !bg.color) return vars;
  if (dark) {
    Object.assign(vars, { "--k-text": "#ffffff", "--k-muted": "rgba(255,255,255,0.78)", "--k-surface": "rgba(255,255,255,0.1)", "--k-rule": "rgba(255,255,255,0.28)" });
  } else if (bg.color) {
    Object.assign(vars, { "--k-text": "#101114", "--k-muted": "rgba(16,17,20,0.66)", "--k-surface": "rgba(16,17,20,0.05)", "--k-rule": "rgba(16,17,20,0.16)" });
  }
  return vars;
}

/** The background photo as an image element, so it renders and exports like any other photo. */
export function backgroundImage(slide: Slide): ImageElement | null {
  const img = slide.background?.image;
  if (!img) return null;
  return { id: `bg${slide.id.slice(0, 28)}`, type: "image", slot: "background", src: img.src, alt: img.alt, focal: img.focal, source: [], aiSuggested: false, ...(img.credit ? { credit: img.credit } : {}) };
}

/** Copies of slides with new ids (slides, elements and groups), ready to add to any deck. */
export function copySlides(slides: Slide[], opts: { notes?: boolean } = {}): Slide[] {
  return slides.map((s) => {
    const groups = new Map<string, string>();
    return {
      ...structuredClone(s),
      id: newId("sl"),
      notes: opts.notes === false ? "" : s.notes,
      elements: s.elements.map((e) => {
        const copy = { ...structuredClone(e), id: newId("el") };
        if (e.group) {
          if (!groups.has(e.group)) groups.set(e.group, newId("g"));
          copy.group = groups.get(e.group);
        }
        return copy;
      }),
    };
  });
}
