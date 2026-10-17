// Starting points for a new slide in the editor (and a new blank deck). Placeholder text is meant to be typed over.
import { composeSlide } from "./compose";
import { MEDIA } from "./media";
import type { Slide } from "./schema";

export const NEW_SLIDES: { id: string; name: string; make: () => Slide }[] = [
  { id: "title", name: "Title", make: () => composeSlide({ layout: "title", slots: [{ slot: "title", text: "Section title" }, { slot: "subtitle", text: "A short line under the title" }] }) },
  { id: "headlineBody", name: "Headline + text", make: () => composeSlide({ layout: "headlineBody", slots: [{ slot: "title", text: "New slide" }, { slot: "body", text: "Click to edit this text." }] }) },
  { id: "bullets", name: "Headline + points", make: () => composeSlide({ layout: "bullets", slots: [{ slot: "title", text: "Three things to know" }, { slot: "points", items: ["First point", "Second point", "Third point"] }] }) },
  { id: "statement", name: "Big statement", make: () => composeSlide({ layout: "statement", slots: [{ slot: "statement", text: "One sentence your audience should remember." }] }) },
  {
    id: "split",
    name: "Photo + points",
    make: () => composeSlide({ layout: "split", slots: [{ slot: "media", image: { src: MEDIA[0].src, alt: MEDIA[0].alt, focal: MEDIA[0].focal } }, { slot: "title", text: "New slide" }, { slot: "points", items: ["First point", "Second point"] }] }),
  },
  { id: "blank", name: "Blank", make: () => composeSlide({ layout: "blank", slots: [] }) },
];
