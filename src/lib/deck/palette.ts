// Picks brand colours from a logo's pixels: the most common saturated colours, skipping near-white,
// near-black and grey, and making sure the two picks look different. Pure, so it's unit-tested.

export function hexOf(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
}

function hsl(r: number, g: number, b: number) {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

/** `rgba` is a flat RGBA byte array (canvas ImageData.data). Returns up to `count` hex colours, best first. */
export function dominantColors(rgba: ArrayLike<number>, count = 2): string[] {
  const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const a = rgba[i + 3];
    if (a < 200) continue;
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const { s, l } = hsl(r, g, b);
    if (l > 0.93 || l < 0.08 || s < 0.18) continue; // background, outlines, greys
    const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++;
    e.r += r;
    e.g += g;
    e.b += b;
    buckets.set(key, e);
  }
  const ranked = [...buckets.values()].sort((x, y) => y.n - x.n).map((e) => ({ r: e.r / e.n, g: e.g / e.n, b: e.b / e.n, n: e.n }));
  const picks: { r: number; g: number; b: number }[] = [];
  for (const c of ranked) {
    const h = hsl(c.r, c.g, c.b).h;
    const distinct = picks.every((p) => {
      const dh = Math.abs(hsl(p.r, p.g, p.b).h - h);
      return Math.min(dh, 360 - dh) > 25 || Math.abs(p.r - c.r) + Math.abs(p.g - c.g) + Math.abs(p.b - c.b) > 120;
    });
    if (distinct) picks.push(c);
    if (picks.length >= count) break;
  }
  return picks.map((p) => hexOf(p.r, p.g, p.b));
}
