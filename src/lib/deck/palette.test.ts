import { describe, expect, it } from "vitest";
import { dominantColors, hexOf } from "./palette";
import { MEDIA_SRC_RX, isUnsplashSrc, unsplashUrl } from "./media";
import { Brand, ImageEl } from "./schema";

function pixels(blocks: [number, number, number, number, number][]): Uint8ClampedArray {
  // [r, g, b, a, count]
  const out: number[] = [];
  for (const [r, g, b, a, n] of blocks) for (let i = 0; i < n; i++) out.push(r, g, b, a);
  return new Uint8ClampedArray(out);
}

describe("logo colours", () => {
  it("finds the main brand colours and skips white, black, grey and transparent", () => {
    const px = pixels([
      [255, 255, 255, 255, 500], // white background
      [0, 0, 0, 255, 300], // black outline
      [128, 128, 128, 255, 200], // grey
      [10, 120, 200, 0, 400], // transparent
      [11, 138, 95, 255, 150], // green (main)
      [230, 90, 30, 255, 80], // orange (second)
      [14, 140, 98, 255, 60], // same green, slightly different
    ]);
    const c = dominantColors(px, 2);
    expect(c).toHaveLength(2);
    expect(c[0]).toMatch(/^#0[BC]8[ABC]5F|^#0[A-F0-9]8[A-F0-9]{3}/);
    expect(c[1].startsWith("#E")).toBe(true);
  });
  it("returns nothing for a black-and-white logo", () => {
    expect(dominantColors(pixels([[255, 255, 255, 255, 10], [0, 0, 0, 255, 10]]))).toEqual([]);
    expect(hexOf(255, 0, 15.6)).toBe("#FF0010");
  });
});

describe("stock photos and brand logos in the deck format", () => {
  const u = "https://images.unsplash.com/photo-1506744038136-46273834b3fb?ixid=M3w1fDB8MXxzZWFyY2h8MXx8&ixlib=rb-4.0.3";
  it("accepts Unsplash CDN images and nothing else from the web", () => {
    expect(MEDIA_SRC_RX.test(u)).toBe(true);
    expect(isUnsplashSrc(u)).toBe(true);
    for (const bad of ["https://evil.example/photo-1.jpg", "https://images.unsplash.com.evil.io/photo-1", "http://images.unsplash.com/photo-1", "https://images.unsplash.com/photo-1?x=<script>"]) expect(MEDIA_SRC_RX.test(bad), bad).toBe(false);
    expect(unsplashUrl(u, 640)).toContain("&w=640");
    expect(unsplashUrl("https://images.unsplash.com/photo-1", 640)).toContain("?w=640");
  });
  it("only allows credits that link to Unsplash", () => {
    const base = { id: "el12345678", slot: "media", type: "image", src: u, alt: "Mountains" };
    expect(ImageEl.safeParse({ ...base, credit: { name: "Jane Doe", url: "https://unsplash.com/@jane?utm_source=kinetic&utm_medium=referral" } }).success).toBe(true);
    expect(ImageEl.safeParse({ ...base, credit: { name: "x", url: "https://evil.example" } }).success).toBe(false);
  });
  it("brand logos must be uploaded assets", () => {
    const b = { name: "Acme", primary: "#0B8A5F", mark: "rocket", pattern: "grid" };
    expect(Brand.safeParse({ ...b, logo: "asset:as0123456789" }).success).toBe(true);
    expect(Brand.safeParse({ ...b, logo: "https://evil.example/logo.png" }).success).toBe(false);
  });
});
