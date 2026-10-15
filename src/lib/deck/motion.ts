// Motion tokens (docs/02 §7.2) and the build-timeline resolver.
// Every animation is a pure function of (slide, intensity, step) so the editor,
// present mode, and a future video renderer all produce the same result.
import type { Element, Intensity, Motion, Slide } from "./schema";
import { getLayout } from "./layouts";

export const DURATION = { fast: 160, base: 320, slow: 600, hero: 900 } as const;
export const STAGGER = 60;

export const EASING_CSS: Record<Motion["easing"], string> = {
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  emphasized: "cubic-bezier(0.3, 0, 0, 1)",
  decelerate: "cubic-bezier(0, 0, 0, 1)",
  // CSS has no springs; these curves approximate the critically damped spring tokens (no overshoot).
  springSoft: "cubic-bezier(0.22, 1, 0.36, 1)",
  springSnappy: "cubic-bezier(0.16, 1, 0.3, 1)",
};

export const INTENSITY_RULES: Record<Intensity, { maxBuilds: number; durationScale: number; stagger: number }> = {
  calm: { maxBuilds: 2, durationScale: 1, stagger: 40 },
  standard: { maxBuilds: 4, durationScale: 1.25, stagger: STAGGER },
  expressive: { maxBuilds: 6, durationScale: 2, stagger: 90 },
};

/** Base duration for a preset before intensity scaling. */
const PRESET_DURATION: Record<Motion["preset"], number> = {
  none: 0,
  fadeUp: DURATION.base,
  maskReveal: DURATION.slow,
  typeOn: DURATION.slow,
  scaleIn: DURATION.base,
  draw: DURATION.slow,
  countUp: DURATION.slow,
  grow: DURATION.slow,
  focus: DURATION.base,
  kenBurns: 3000, // CSS runs the zoom for longer; this is only the build budget
  rise: DURATION.hero,
};

export interface ResolvedMotion {
  preset: Motion["preset"];
  step: number; // build step at which the element appears (0 = on slide entry)
  delayMs: number; // delay inside its step
  durationMs: number;
  easing: string;
  stagger: number; // per-item stagger for bullets / words / bars
}

/** Motion for an element: explicit motion wins, else the layout default for its slot. */
export function motionFor(slide: Slide, el: Element, index: number): Motion {
  if (el.motion) return el.motion;
  const d = getLayout(slide.layout).defaultMotion[el.slot];
  return {
    preset: d?.preset ?? "fadeUp",
    trigger: d?.trigger ?? "afterPrevious",
    order: d?.order ?? index,
    delayMs: 0,
    durationMs: PRESET_DURATION[d?.preset ?? "fadeUp"],
    easing: "standard",
  };
}

/** Calm intensity simplifies presets to fades; "focus" only applies in present mode emphasis. */
function presetForIntensity(preset: Motion["preset"], intensity: Intensity): Motion["preset"] {
  if (intensity !== "calm") return preset;
  if (["countUp", "grow", "draw", "none", "kenBurns", "rise"].includes(preset)) return preset;
  return "fadeUp";
}

/**
 * Resolves every element's timing. Elements are sorted by motion.order; "onClick" starts a
 * new build step, "withPrevious" starts with the previous element, "afterPrevious" starts
 * when the previous one ends. Elements past the intensity's build budget appear with the last build.
 */
export function resolveTimeline(slide: Slide, intensity: Intensity): Map<string, ResolvedMotion> {
  const rules = INTENSITY_RULES[intensity];
  const entries = slide.elements
    .map((el, i) => ({ el, m: motionFor(slide, el, i) }))
    .sort((a, b) => a.m.order - b.m.order);

  const out = new Map<string, ResolvedMotion>();
  let step = 0;
  let cursor = 0; // ms where the next afterPrevious element starts
  let prevStart = 0;
  let builds = 0;

  for (const { el, m } of entries) {
    const preset = presetForIntensity(m.preset, intensity);
    const animated = preset !== "none";
    const overBudget = animated && builds >= rules.maxBuilds;

    if (m.trigger === "onClick" && out.size > 0) {
      step += 1;
      cursor = 0;
      prevStart = 0;
    }

    const base = m.durationMs || PRESET_DURATION[preset];
    const durationMs = Math.min(3000, Math.round(base * rules.durationScale));
    let start: number;
    if (overBudget) start = prevStart; // join the last build instead of adding a new one
    else if (m.trigger === "withPrevious") start = prevStart;
    else start = cursor;
    start += m.delayMs;

    out.set(el.id, {
      preset,
      step,
      delayMs: start,
      durationMs: animated ? durationMs : 0,
      easing: EASING_CSS[m.easing],
      stagger: rules.stagger,
    });

    if (animated && !overBudget && m.trigger !== "withPrevious") builds += 1;
    prevStart = start;
    // Next element waits until ~70% of this one so sequences feel connected, not sluggish.
    cursor = Math.max(cursor, start + Math.round(durationMs * 0.7));
  }
  return out;
}

export function stepCount(slide: Slide, intensity: Intensity): number {
  let max = 0;
  for (const r of resolveTimeline(slide, intensity).values()) max = Math.max(max, r.step);
  return max + 1;
}

/** Separate build steps on a slide: elements that start "with previous" share a build. */
export function countAnimatedBuilds(slide: Slide): number {
  return slide.elements.filter((el, i) => {
    const m = motionFor(slide, el, i);
    return m.preset !== "none" && m.trigger !== "withPrevious";
  }).length;
}
