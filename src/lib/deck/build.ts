import { Deck, type Intensity } from "./schema";
import { composeSlide, type SlottedSlide } from "./compose";
import { newId } from "./ids";
import { runQa, type QaIssue } from "./qa";
import { THEME_IDS } from "./themes";

export function buildDeck(opts: {
  title: string;
  slides: SlottedSlide[];
  themeId: string;
  intensity: Intensity;
  language?: string;
  sourceText?: string;
}): { deck: Deck; issues: QaIssue[] } {
  const slides = opts.slides.map((s) => composeSlide(s));
  slides.forEach((s, i) => {
    if (i > 0) s.transition = opts.intensity === "calm" ? "fade" : s.layout === slides[i - 1].layout ? "morph" : "fade";
  });
  const draft = Deck.parse({
    id: newId("dk"),
    version: 0,
    title: opts.title.slice(0, 200) || "Untitled deck",
    themeId: THEME_IDS.includes(opts.themeId) ? opts.themeId : "mono",
    motionIntensity: opts.intensity,
    language: (opts.language ?? "en").slice(0, 16),
    source: opts.sourceText?.slice(0, 400_000),
    slides: slides.length ? slides : [composeSlide({ layout: "title", slots: [{ slot: "title", text: opts.title || "Untitled deck" }] })],
  });
  return runQa(draft, opts.sourceText);
}
