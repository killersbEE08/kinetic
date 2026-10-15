// Puts the user's own photos into a generated deck. The AI never picks photos (it can't see
// them), so placement is a fixed rule set: the first photo goes behind the title, the rest
// are spread across slides whose layout has a photo version.
import type { Deck, Element, Slide } from "./schema";
import { swapLayout } from "./compose";
import { getLayout } from "./layouts";
import { newId } from "./ids";

export interface PhotoRef {
  src: string;
  alt: string;
  focal?: [number, number];
}

/** Text layout → its photo version. */
const PHOTO_VERSION: Record<string, string> = {
  title: "titleImage",
  statement: "imageStatement",
  bullets: "split",
  headlineBody: "split",
};

function withPhoto(slide: Slide, photo: PhotoRef): Slide | null {
  const target = PHOTO_VERSION[slide.layout];
  if (!target || slide.elements.some((e) => e.type === "image")) return null;
  const img: Element = { id: newId("el"), slot: "media", type: "image", src: photo.src, alt: photo.alt.slice(0, 250) || "Photo", focal: photo.focal ?? [0.5, 0.5], source: [], aiSuggested: false };
  const next = swapLayout({ ...slide, elements: [img, ...slide.elements] }, target);
  // Only keep the swap if everything still fits the photo layout's limits.
  const layout = getLayout(target);
  for (const el of next.elements) {
    const max = layout.slots[el.slot]?.maxItems;
    if (el.type === "bullets" && max && el.items.length > max) return null;
  }
  if (!next.elements.some((e) => e.type === "image")) return null;
  return next;
}

/** Returns the deck with photos placed, and how many were used. */
export function placePhotos(deck: Deck, photos: PhotoRef[]): { deck: Deck; placed: number } {
  if (!photos.length) return { deck, placed: 0 };
  const slides = [...deck.slides];
  const queue = [...photos];
  let placed = 0;

  if (slides[0]?.layout === "title") {
    const next = withPhoto(slides[0], queue[0]);
    if (next) {
      slides[0] = next;
      queue.shift();
      placed++;
    }
  }

  // Candidates in deck order, never two photo slides in a row, at most half of the deck.
  const candidates = slides.map((s, i) => ({ s, i })).filter(({ s, i }) => i > 0 && PHOTO_VERSION[s.layout] && s.layout !== "title" && !s.elements.some((e) => e.type === "image"));
  const budget = Math.min(queue.length, candidates.length, Math.max(1, Math.floor((slides.length - 1) / 2)));
  if (budget > 0) {
    const step = candidates.length / budget;
    const used = new Set<number>();
    for (let k = 0; k < budget && queue.length; k++) {
      // Try the evenly spaced pick first, then its neighbours.
      const start = Math.floor(k * step);
      for (let j = start; j < candidates.length; j++) {
        const { i } = candidates[j];
        if (used.has(i) || used.has(i - 1) || used.has(i + 1)) continue;
        const next = withPhoto(slides[i], queue[0]);
        if (!next) continue;
        slides[i] = next;
        used.add(i);
        queue.shift();
        placed++;
        break;
      }
    }
  }
  return { deck: { ...deck, slides }, placed };
}

/** Adds one photo to a single slide (editor "Add a photo"). Returns null if the layout has no photo version. */
export function addPhotoToSlide(slide: Slide, photo: PhotoRef): Slide | null {
  return withPhoto(slide, photo);
}

export function canHavePhoto(slide: Slide): boolean {
  return !!PHOTO_VERSION[slide.layout] && !slide.elements.some((e) => e.type === "image");
}
