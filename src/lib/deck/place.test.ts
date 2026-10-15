import { describe, expect, it } from "vitest";
import { Deck as DeckSchema, ImageEl } from "./schema";
import { MEDIA_SRC_RX, assetIdOf, isAssetSrc } from "./media";
import { addPhotoToSlide, canHavePhoto, placePhotos } from "./place";
import { buildDeck } from "./build";
import { composeSlide } from "./compose";
import { runQa } from "./qa";

const photo = (n: number) => ({ src: `asset:as${String(n).padStart(10, "0")}`, alt: `Photo ${n}` });

function sampleDeck(layouts: string[]) {
  const slides = layouts.map((layout, i) =>
    layout === "title"
      ? { layout, slots: [{ slot: "title", text: "Quarterly review" }, { slot: "subtitle", text: "For the leadership team" }] }
      : layout === "statement"
        ? { layout, slots: [{ slot: "statement", text: `Point number ${i} matters most.` }] }
        : layout === "bullets"
          ? { layout, slots: [{ slot: "title", text: `Section ${i}` }, { slot: "points", items: ["First thing", "Second thing", "Third thing"] }] }
          : { layout: "closing", slots: [{ slot: "title", text: "Next steps" }] },
  );
  return buildDeck({ title: "Quarterly review", slides, themeId: "mono", intensity: "standard" }).deck;
}

describe("photo sources", () => {
  it("accepts library photos and uploads, nothing else", () => {
    expect(MEDIA_SRC_RX.test("/media/boats")).toBe(true);
    expect(MEDIA_SRC_RX.test("asset:as0123456789")).toBe(true);
    for (const bad of ["https://evil.example/x.jpg", "asset:../../x", "asset:SHORT", "/media/../etc", "javascript:alert(1)", "asset:"]) expect(MEDIA_SRC_RX.test(bad), bad).toBe(false);
    expect(isAssetSrc("asset:as0123456789")).toBe(true);
    expect(assetIdOf("asset:as0123456789")).toBe("as0123456789");
    expect(assetIdOf("/media/boats")).toBeNull();
  });

  it("validates image elements that point at uploads", () => {
    const ok = ImageEl.safeParse({ id: "el12345678", slot: "media", type: "image", src: "asset:as0123456789", alt: "Team photo" });
    expect(ok.success).toBe(true);
    const bad = ImageEl.safeParse({ id: "el12345678", slot: "media", type: "image", src: "https://x.y/z.png", alt: "x" });
    expect(bad.success).toBe(false);
  });
});

describe("placePhotos", () => {
  it("puts the first photo behind the title and spreads the rest without neighbours", () => {
    const deck = sampleDeck(["title", "bullets", "bullets", "statement", "bullets", "bullets", "closing"]);
    const { deck: out, placed } = placePhotos(deck, [photo(1), photo(2), photo(3), photo(4)]);
    expect(out.slides[0].layout).toBe("titleImage");
    expect(placed).toBeGreaterThanOrEqual(3);
    const withPhoto = out.slides.map((s, i) => (s.elements.some((e) => e.type === "image") ? i : -1)).filter((i) => i > 0);
    for (let k = 1; k < withPhoto.length; k++) expect(withPhoto[k] - withPhoto[k - 1]).toBeGreaterThan(1);
    // At most half the deck gets photos besides the title.
    expect(withPhoto.length).toBeLessThanOrEqual(Math.floor((deck.slides.length - 1) / 2));
    // Still a valid deck, and nothing the user wrote is lost.
    expect(DeckSchema.safeParse(out).success).toBe(true);
    const text = (d: typeof deck) => d.slides.flatMap((s) => s.elements.flatMap((e) => (e.type === "text" ? [e.content] : e.type === "bullets" ? e.items : []))).sort();
    expect(text(out)).toEqual(text(deck));
  });

  it("keeps slide ids and passes the quality gates", () => {
    const deck = sampleDeck(["title", "bullets", "statement", "bullets", "closing"]);
    const { deck: out } = placePhotos(deck, [photo(1), photo(2), photo(3)]);
    expect(out.slides.map((s) => s.id)).toEqual(deck.slides.map((s) => s.id));
    const { issues } = runQa(out);
    expect(issues.filter((i) => !i.fixed && i.rule !== "factuality")).toEqual([]);
  });

  it("does nothing without photos or suitable slides", () => {
    const deck = sampleDeck(["closing", "closing", "closing"]);
    expect(placePhotos(deck, []).placed).toBe(0);
    expect(placePhotos(deck, [photo(1)]).placed).toBe(0);
  });

  it("refuses slides with more points than the photo layout allows", () => {
    const slide = composeSlide({ layout: "bullets", slots: [{ slot: "title", text: "Many" }, { slot: "points", items: ["a one", "b two", "c three", "d four", "e five"] }] });
    expect(canHavePhoto(slide)).toBe(true);
    expect(addPhotoToSlide(slide, photo(1))).toBeNull();
    const small = composeSlide({ layout: "bullets", slots: [{ slot: "title", text: "Few" }, { slot: "points", items: ["a one", "b two"] }] });
    const next = addPhotoToSlide(small, photo(1));
    expect(next?.layout).toBe("split");
    expect(next?.elements.find((e) => e.type === "image")).toMatchObject({ src: photo(1).src, alt: "Photo 1" });
  });
});
