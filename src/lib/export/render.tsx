"use client";

// Renders slides one at a time into a hidden 1920×1080 stage so exporters can measure the real
// layout (the same renderer as the editor and present mode, so files match what you see).
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { SlideStage } from "@/components/deck/SlideView";
import type { Deck, Slide } from "@/lib/deck/schema";
import { deckTheme } from "@/lib/deck/themes";
import { preloadAssets } from "@/lib/client/assets";
import { assetIdOf } from "@/lib/deck/media";

export const STAGE_W = 1920;
export const STAGE_H = 1080;

export function deckAssetIds(deck: Deck): string[] {
  const ids = deck.slides.flatMap((s) => [...s.elements.flatMap((e) => (e.type === "image" ? [e.src] : [])), ...(s.background?.image ? [s.background.image.src] : [])].map(assetIdOf).filter((x): x is string => !!x));
  const logo = deck.brand?.logo ? assetIdOf(deck.brand.logo) : null;
  return logo ? [...ids, logo] : ids;
}

async function settle(root: HTMLElement) {
  await Promise.all(
    Array.from(root.querySelectorAll("img")).map((img) =>
      img.complete && img.naturalWidth ? Promise.resolve() : img.decode().catch(() => undefined),
    ),
  );
  void root.offsetHeight; // force layout so fonts used on the slide start loading
  await document.fonts.ready;
  await new Promise((r) => requestAnimationFrame(() => r(null)));
}

/**
 * Calls `fn` with each slide's rendered stage element. Slides render in their final state
 * (all builds shown, no editor outlines, no "Suggested" tags).
 */
export async function forEachRenderedSlide<T>(
  deck: Deck,
  fn: (stage: HTMLElement, slide: Slide, index: number) => Promise<T>,
  onProgress?: (done: number, total: number) => void,
  only?: number[],
): Promise<T[]> {
  await preloadAssets(deckAssetIds(deck));
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, { position: "fixed", left: "-40000px", top: "0", width: `${STAGE_W}px`, height: `${STAGE_H}px`, overflow: "hidden", pointerEvents: "none", contain: "strict" });
  document.body.appendChild(host);
  const root = createRoot(host);
  const theme = deckTheme(deck);
  const indexes = only ?? deck.slides.map((_, i) => i);
  const out: T[] = [];
  try {
    for (const [k, i] of indexes.entries()) {
      const slide = deck.slides[i];
      flushSync(() => root.render(<SlideStage slide={slide} theme={theme} intensity={deck.motionIntensity} mode="static" scale={1} page={i + 1} />));
      await settle(host);
      const stage = host.querySelector<HTMLElement>(".k-stage");
      if (!stage) throw new Error("Slide did not render.");
      out.push(await fn(stage, slide, i));
      onProgress?.(k + 1, indexes.length);
    }
  } finally {
    root.unmount();
    host.remove();
  }
  return out;
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function fileBase(title: string): string {
  return (title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "deck").slice(0, 80);
}
