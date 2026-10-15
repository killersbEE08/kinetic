"use client";

import { flushSync } from "react-dom";

type VTDocument = Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };

/** True when the browser can morph shared elements between slides. */
export function canMorph(): boolean {
  if (typeof document === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  return typeof (document as VTDocument).startViewTransition === "function";
}

/**
 * Runs a slide change. With "morph" and browser support, elements that share a
 * view-transition-name (headline, logo, photo) glide from the old slide to the new one.
 */
export function changeSlide(transition: string | undefined, update: () => void) {
  if (transition === "morph" && canMorph()) {
    (document as VTDocument).startViewTransition!(() => flushSync(update));
  } else {
    update();
  }
}
