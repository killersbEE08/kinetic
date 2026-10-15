// Automated "no slop" quality gates (PRD §9). Runs on every generated or AI-edited deck.
// Fixes what can be fixed safely and reports the rest.
import { isFree, type Deck, type Element, type Slide } from "./schema";
import { getLayout, LAYOUT_IDS } from "./layouts";
import { findBanned, softenCopy } from "./banned";
import { countAnimatedBuilds, INTENSITY_RULES } from "./motion";

export interface QaIssue {
  slideIndex: number;
  rule: "density" | "bullets" | "hierarchy" | "banned" | "factuality" | "motion" | "layout" | "slot";
  message: string;
  fixed: boolean;
}

export const LIMITS = { bodyWords: 40, bullets: 6, bulletWords: 12 } as const;

export const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

function bodyWords(slide: Slide): number {
  let n = 0;
  for (const el of slide.elements) {
    if (el.type === "text" && (el.role === "body" || el.role === "caption" || el.role === "quote")) n += wordCount(el.content);
    if (el.type === "bullets") n += el.items.reduce((a, b) => a + wordCount(b), 0);
  }
  return n;
}

function truncateWords(s: string, max: number): { kept: string; rest: string } {
  const words = s.trim().split(/\s+/);
  if (words.length <= max) return { kept: s, rest: "" };
  // Prefer cutting at a sentence end inside the limit.
  const head = words.slice(0, max).join(" ");
  const lastStop = Math.max(head.lastIndexOf(". "), head.lastIndexOf("? "));
  if (lastStop > head.length * 0.5) return { kept: head.slice(0, lastStop + 1), rest: s.slice(lastStop + 1).trim() };
  return { kept: head.replace(/[,;:]$/, "") + "…", rest: words.slice(max).join(" ") };
}

/** Numbers like 4,812 / 58 / 12.5% / $1.2M / 2026, normalised for matching. */
const NUM_RX = /(?:[$€£₹])?\d[\d,]*(?:\.\d+)?\s?(?:%|k|m|bn|b|x)?/gi;
export function extractNumbers(s: string): string[] {
  return (s.match(NUM_RX) ?? []).map((n) => n.toLowerCase().replace(/[\s,$€£₹]/g, "")).filter((n) => /\d/.test(n));
}

/** "12.50%" -> "12.5", "1.2m" -> "1.2", "4812" -> "4812" */
export function bareNumber(n: string): string {
  const core = n.replace(/[^\d.]/g, "");
  return core.includes(".") ? core.replace(/0+$/, "").replace(/\.$/, "") : core;
}

export function elementText(el: Element): string {
  if (el.type === "text") return el.content;
  if (el.type === "bullets") return el.items.join(" ");
  if (el.type === "image") return el.alt;
  if (el.type === "mockup") {
    const s = el.screen;
    return [s.app, s.heading, s.kpi?.label, s.kpi?.value, s.cta, s.chartLabel, ...s.rows.flatMap((r) => [r.label, r.sub, r.value, r.tag])].filter(Boolean).join(" ");
  }
  if (el.type === "shape") return el.text;
  if (el.type === "icon") return "";
  if (el.type === "table") return el.rows.flat().join(" ");
  return [...el.data.labels, ...el.data.series.flatMap((s) => [s.name, ...s.values.map(String)])].join(" ");
}

/**
 * Runs all gates. `sourceText` is the user's raw material; when provided, any number that does
 * not appear in it marks the element `aiSuggested` (shown with a dashed "Suggested" outline).
 */
export function runQa(deck: Deck, sourceText?: string): { deck: Deck; issues: QaIssue[] } {
  const issues: QaIssue[] = [];
  const out: Deck = structuredClone(deck);
  const sourceNums =
    sourceText !== undefined ? new Set(extractNumbers(sourceText).flatMap((n) => [n, bareNumber(n)])) : null;

  out.slides.forEach((slide, si) => {
    // Layout must exist in the registry.
    if (!LAYOUT_IDS.includes(slide.layout)) {
      issues.push({ slideIndex: si, rule: "layout", message: `Unknown layout "${slide.layout}", using Headline + body`, fixed: true });
      slide.layout = "headlineBody";
    }
    const layout = getLayout(slide.layout);
    const overflow: string[] = [];

    for (const el of slide.elements) {
      // Boxes the user placed by hand: keep their wording as typed (only soften banned copy).
      if (isFree(el)) {
        if (el.type === "text") el.content = softenCopy(el.content);
        continue;
      }
      const slot = layout.slots[el.slot];
      if (!slot) {
        issues.push({ slideIndex: si, rule: "slot", message: `Element in unknown slot "${el.slot}"`, fixed: false });
      }

      // Banned copy → soften, re-check, flag what remains.
      if (el.type === "text") el.content = softenCopy(el.content);
      if (el.type === "bullets") el.items = el.items.map(softenCopy);
      const banned = findBanned(elementText(el));
      if (banned.length) issues.push({ slideIndex: si, rule: "banned", message: `Banned wording: ${banned.join(", ")}`, fixed: false });

      // Per-slot limits.
      if (el.type === "bullets") {
        const maxItems = Math.min(slot?.maxItems ?? LIMITS.bullets, LIMITS.bullets);
        if (el.items.length > maxItems) {
          overflow.push(...el.items.slice(maxItems));
          el.items = el.items.slice(0, maxItems);
          issues.push({ slideIndex: si, rule: "bullets", message: `Kept ${maxItems} points, moved the rest to speaker notes`, fixed: true });
        }
        const maxW = slot?.maxWords ?? LIMITS.bulletWords;
        el.items = el.items.map((item) => {
          if (wordCount(item) <= maxW + 3) return item; // small tolerance, then cut
          const { kept, rest } = truncateWords(item, maxW);
          overflow.push(rest);
          issues.push({ slideIndex: si, rule: "density", message: "Shortened a long point", fixed: true });
          return kept;
        });
      }
      if (el.type === "text" && slot?.maxWords && wordCount(el.content) > slot.maxWords + 4) {
        const { kept, rest } = truncateWords(el.content, slot.maxWords);
        el.content = kept;
        overflow.push(rest);
        issues.push({ slideIndex: si, rule: "density", message: `Trimmed ${el.slot} to ${slot.maxWords} words`, fixed: true });
      }

      // Factuality: numbers must come from the user's material.
      if (sourceNums && !el.aiSuggested) {
        const nums = el.type === "chart" ? el.data.series.flatMap((s) => s.values.map((v) => String(v))) : extractNumbers(elementText(el));
        const unknown = nums.filter((n) => !sourceNums.has(n) && !sourceNums.has(bareNumber(n)));
        if (unknown.length) {
          el.aiSuggested = true;
          issues.push({ slideIndex: si, rule: "factuality", message: `Not found in your material: ${unknown.slice(0, 3).join(", ")}. Marked Suggested.`, fixed: true });
        }
      }
    }

    // Whole-slide density.
    if (bodyWords(slide) > LIMITS.bodyWords + 10) {
      issues.push({ slideIndex: si, rule: "density", message: `About ${bodyWords(slide)} words of body text (limit ${LIMITS.bodyWords})`, fixed: false });
    }

    // Hierarchy: at most one H1.
    const h1s = slide.elements.filter((e) => e.type === "text" && e.role === "h1");
    if (h1s.length > 1) {
      for (const extra of h1s.slice(1)) if (extra.type === "text") extra.role = "h2";
      issues.push({ slideIndex: si, rule: "hierarchy", message: "More than one headline; demoted extras", fixed: true });
    }

    // Motion budget.
    const budget = INTENSITY_RULES[out.motionIntensity].maxBuilds;
    if (countAnimatedBuilds(slide) > budget + 2) {
      issues.push({ slideIndex: si, rule: "motion", message: `More builds than the ${out.motionIntensity} budget (${budget}); extras play together`, fixed: true });
    }

    const extra = overflow.filter(Boolean).join("\n");
    if (extra) slide.notes = ((slide.notes ? slide.notes + "\n\n" : "") + extra).slice(0, 5000);
  });

  return { deck: out, issues };
}
