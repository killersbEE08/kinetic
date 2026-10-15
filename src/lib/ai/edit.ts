// Scoped AI edits (PRD AI-1..AI-7). Pure functions shared by the API route and demo mode.
// The model (or the offline engine) proposes new slide content; this module turns that into
// JSON Patch ops, runs the quality gates, and enforces the scope before anything is returned.
import type { Deck, Element, Slide } from "../deck/schema";
import { applyDeckPatch, checkScope, type EditScope, type PatchOp } from "../deck/patch";
import { composeSlide, elementToSlot, swapLayout, toSlotted, type SlottedSlide, type SlotContent } from "../deck/compose";
import { runQa, wordCount, type QaIssue } from "../deck/qa";
import { getLayout } from "../deck/layouts";
import { extractNumbers } from "../deck/qa";

export type Change =
  | { kind: "slides"; slides: Slide[] } // replacements for the selected slides (+ extra = inserted after)
  | { kind: "elements"; elements: Element[] } // replacements for the selected elements
  | { kind: "deck"; slides: Slide[] };

export interface Proposal {
  summary: string;
  ops: PatchOp[];
  preview: Deck;
  issues: QaIssue[];
  changedSlideIds: string[];
}

export class EditError extends Error {}

export function selectedSlideIndexes(deck: Deck, scope: EditScope): number[] {
  if (scope.kind === "deck") return deck.slides.map((_, i) => i);
  const ids = scope.kind === "slide" ? scope.slideIds : [scope.slideId];
  return deck.slides.map((s, i) => (ids.includes(s.id) ? i : -1)).filter((i) => i >= 0);
}

/** Converts AI slotted output into Slides, reusing ids of the slides they replace. */
export function slottedToSlides(deck: Deck, scope: EditScope, slotted: SlottedSlide[]): Slide[] {
  const idx = selectedSlideIndexes(deck, scope);
  return slotted.map((s, i) => {
    const prev = i < idx.length ? deck.slides[idx[i]] : undefined;
    // The AI never sees photos or product screens; put them back if the layout still has the slot.
    const kept = (prev?.elements ?? []).filter((e) => (e.type === "image" || e.type === "mockup") && !s.slots.some((c) => c.slot === e.slot)).map(elementToSlot);
    return composeSlide({ ...s, slots: [...s.slots, ...kept] }, prev);
  });
}

/** Slide content for the AI, without photo and screen data (it can't change those). */
export function slottedForAi(slide: Slide): SlottedSlide {
  const s = toSlotted(slide);
  return { ...s, slots: s.slots.filter((c) => !c.image && !c.mockup) };
}

/** Converts AI slot output for element scope into replacement Elements (same ids, same types). */
export function slotsToElements(deck: Deck, scope: Extract<EditScope, { kind: "element" }>, slots: SlotContent[]): Element[] {
  const slide = deck.slides.find((s) => s.id === scope.slideId);
  if (!slide) throw new EditError("The selected slide no longer exists.");
  const selected = slide.elements.filter((e) => scope.elementIds.includes(e.id));
  const merged: SlotContent[] = slide.elements.map((e) => {
    const repl = slots.find((s) => s.slot === e.slot);
    // Photos and product screens are kept as they are; the AI only rewrites text and data.
    if (repl && selected.some((x) => x.id === e.id) && e.type !== "image" && e.type !== "mockup") return { ...repl, icons: repl.icons ?? (e.type === "bullets" ? e.icons : undefined) };
    return elementToSlot(e);
  });
  const rebuilt = composeSlide({ layout: slide.layout, slots: merged, notes: slide.notes }, slide);
  return rebuilt.elements.filter((e) => scope.elementIds.includes(e.id));
}

/** Turns a change into validated, in-scope patch ops with a preview. Throws EditError if out of scope. */
export function buildProposal(deck: Deck, scope: EditScope, change: Change, summary: string, sourceText?: string): Proposal {
  const ops: PatchOp[] = [];
  const changed: string[] = [];

  // Run quality gates on the proposed slides first, so the ops already contain the fixed content.
  const qaSlides = (slides: Slide[]) => {
    if (!slides.length) return { slides, issues: [] as QaIssue[] };
    const { deck: fixed, issues } = runQa({ ...deck, slides }, sourceText);
    return { slides: fixed.slides, issues };
  };

  let issues: QaIssue[] = [];
  if (change.kind === "deck") {
    const r = qaSlides(change.slides);
    issues = r.issues;
    ops.push({ op: "replace", path: "/slides", value: r.slides });
    changed.push(...r.slides.map((s) => s.id));
  } else if (change.kind === "slides") {
    if (scope.kind !== "slide") throw new EditError("Select a slide to make this change.");
    const idx = selectedSlideIndexes(deck, scope);
    if (!idx.length) throw new EditError("The selected slide no longer exists.");
    const r = qaSlides(change.slides);
    issues = r.issues;
    r.slides.slice(0, idx.length).forEach((s, i) => {
      ops.push({ op: "replace", path: `/slides/${idx[i]}`, value: { ...s, id: deck.slides[idx[i]].id } });
      changed.push(deck.slides[idx[i]].id);
    });
    // Extra slides are inserted right after the last selected slide; reverse so the final order is preserved.
    const insertAt = idx[idx.length - 1] + 1;
    for (const s of r.slides.slice(idx.length).reverse()) {
      ops.push({ op: "add", path: `/slides/${insertAt}`, value: s });
      changed.push(s.id);
    }
  } else {
    if (scope.kind !== "element") throw new EditError("Select an element to make this change.");
    const si = deck.slides.findIndex((s) => s.id === scope.slideId);
    if (si < 0) throw new EditError("The selected slide no longer exists.");
    const slide = deck.slides[si];
    const tmp = { ...slide, elements: slide.elements.map((e) => change.elements.find((n) => n.id === e.id) ?? e) };
    const r = qaSlides([tmp]);
    issues = r.issues;
    const fixed = r.slides[0];
    slide.elements.forEach((e, ei) => {
      if (!scope.elementIds.includes(e.id)) return;
      const next = fixed.elements.find((x) => x.id === e.id);
      if (next && JSON.stringify(next) !== JSON.stringify(e)) ops.push({ op: "replace", path: `/slides/${si}/elements/${ei}`, value: next });
    });
    changed.push(slide.id);
  }

  if (!ops.length) throw new EditError("Nothing to change. Try a more specific instruction.");
  const violation = checkScope(deck, ops, scope);
  if (violation) throw new EditError(`Change blocked: ${violation}`);
  const { doc: preview } = applyDeckPatch(deck, ops);
  return { summary, ops, preview, issues, changedSlideIds: [...new Set(changed)] };
}

// ---------------------------------------------------------------------------
// Offline edit engine: deterministic quick actions, used without a Gemini key.

export const QUICK_ACTIONS = ["Shorten", "Split slide", "Make a timeline", "Make visual", "Stronger title"] as const;

function shortenText(s: string, ratio = 0.6, min = 5): string {
  const words = s.trim().split(/\s+/);
  const keep = Math.max(min, Math.ceil(words.length * ratio));
  if (words.length <= keep) return s;
  // Prefer the first sentence if it is short enough.
  const first = s.split(/(?<=[.?])\s+/)[0];
  if (wordCount(first) <= keep && wordCount(first) >= min) return first;
  return words.slice(0, keep).join(" ").replace(/[,;:]$/, "") + ".";
}

function shortenElement(el: Element): Element {
  if (el.type === "text") return el.role === "h1" ? { ...el, content: shortenText(el.content, 0.75, 3).replace(/\.$/, "") } : { ...el, content: shortenText(el.content) };
  if (el.type === "bullets") return { ...el, items: el.items.slice(0, 4).map((i) => shortenText(i, 0.7, 4).replace(/\.$/, "")) };
  return el;
}

function title(slide: Slide): string {
  const h = slide.elements.find((e) => e.type === "text" && e.role === "h1");
  return h?.type === "text" ? h.content : "";
}

export function offlineEdit(deck: Deck, scope: EditScope, instruction: string): { summary: string; change: Change } {
  const ins = instruction.toLowerCase();
  const idx = selectedSlideIndexes(deck, scope);
  const slides = idx.map((i) => deck.slides[i]);

  if (scope.kind === "element") {
    if (/short|concise|punch|tight|trim|less/.test(ins)) {
      const slide = slides[0];
      const elements = slide.elements.filter((e) => scope.elementIds.includes(e.id)).map(shortenElement);
      return { summary: "Shortened the selected text.", change: { kind: "elements", elements } };
    }
    throw new EditError("Without Gemini, element edits support: Shorten. Add a GEMINI_API_KEY for free-form edits.");
  }

  if (scope.kind === "deck") {
    if (/short|concise|punch|tight|less text/.test(ins)) {
      return { summary: "Shortened text on every slide.", change: { kind: "deck", slides: deck.slides.map((s) => ({ ...s, elements: s.elements.map(shortenElement) })) } };
    }
    throw new EditError("Without Gemini, whole-deck edits support: Shorten. Add a GEMINI_API_KEY for free-form edits.");
  }

  // Slide scope
  const named = getLayoutFromInstruction(ins);
  if (named) {
    return { summary: `Changed the layout to ${getLayout(named).name}.`, change: { kind: "slides", slides: slides.map((s) => swapLayout(s, named)) } };
  }
  if (/short|concise|punch|tight|trim|less/.test(ins)) {
    return { summary: `Shortened the text on ${slides.length > 1 ? "the selected slides" : "this slide"}.`, change: { kind: "slides", slides: slides.map((s) => ({ ...s, elements: s.elements.map(shortenElement) })) } };
  }
  if (/split/.test(ins)) {
    const s = slides[0];
    const bullets = s.elements.find((e) => e.type === "bullets");
    if (!bullets || bullets.type !== "bullets" || bullets.items.length < 2) throw new EditError("This slide has no list to split.");
    const half = Math.ceil(bullets.items.length / 2);
    const t = title(s) || "Continued";
    const a = composeSlide({ layout: "bullets", slots: [{ slot: "title", text: t }, { slot: "points", items: bullets.items.slice(0, half) }], notes: s.notes }, s);
    const b = composeSlide({ layout: "bullets", slots: [{ slot: "title", text: `${t} (continued)`, suggested: true }, { slot: "points", items: bullets.items.slice(half) }] });
    return { summary: "Split the list across two slides.", change: { kind: "slides", slides: [{ ...a, id: s.id }, b] } };
  }
  if (/timeline|steps|process|sequence/.test(ins)) {
    return { summary: "Turned the points into numbered steps.", change: { kind: "slides", slides: slides.map((s) => swapLayout(s, "process")) } };
  }
  if (/visual|number|chart|metric|kpi|data/.test(ins)) {
    return {
      summary: "Made the key number the hero of the slide.",
      change: {
        kind: "slides",
        slides: slides.map((s) => {
          const nums = s.elements.flatMap((e) => (e.type === "text" ? extractNumbers(e.content) : e.type === "bullets" ? e.items.flatMap(extractNumbers) : []));
          if (s.elements.some((e) => e.type === "chart")) return swapLayout(s, s.layout === "bigNumber" ? "kpiRow" : "bigNumber");
          if (!nums.length) return swapLayout(s, "statement");
          // Build a KPI from the first metric line, keeping the rest as context.
          const lines = s.elements.flatMap((e) => (e.type === "bullets" ? e.items : e.type === "text" && e.role !== "h1" ? [e.content] : []));
          const line = lines.find((l) => /\d/.test(l)) ?? "";
          const m = line.match(/((?:[$€£₹])?\d[\d,]*(?:\.\d+)?)\s*(%|k|m|x)?/i);
          const value = m ? Number(m[1].replace(/[^\d.]/g, "")) : 0;
          const unit = m ? [m[1].match(/[$€£₹]/)?.[0], m[2]].filter(Boolean).join("") || undefined : undefined;
          const label = line.replace(m?.[0] ?? "", "").replace(/^[\s:,-]+|[\s:,-]+$/g, "") || "Key number";
          return composeSlide(
            {
              layout: "bigNumber",
              slots: [
                { slot: "number", chart: { kind: "kpi", labels: [label.slice(0, 40)], series: [{ name: label.slice(0, 40), values: [value] }], unit } },
                { slot: "label", text: title(s) || label },
                { slot: "context", text: label },
              ],
              notes: [s.notes, ...lines.filter((l) => l !== line)].filter(Boolean).join("\n"),
            },
            s,
          );
        }),
      },
    };
  }
  if (/title|headline/.test(ins)) {
    throw new EditError("Rewriting headlines needs Gemini. Add a GEMINI_API_KEY, or click the headline to edit it.");
  }
  throw new EditError(`Without Gemini, slide edits support: ${QUICK_ACTIONS.filter((a) => a !== "Stronger title").join(", ")}, or a layout name (for example "make this a quote"). Add a GEMINI_API_KEY for free-form edits.`);
}

function getLayoutFromInstruction(ins: string): string | null {
  const map: [RegExp, string][] = [
    [/\b(big|large|hero)\s*(statement|sentence)\b|\bstatement\b/, "statement"],
    [/\btwo[- ]column|\bcompar(e|ison)|\bside by side\b|\bbefore\s*(and|\/)\s*after\b/, "twoColumn"],
    [/\bquote\b/, "quote"],
    [/\bbar chart\b/, "barChart"],
    [/\bline chart\b/, "lineChart"],
    [/\bkpi|metrics row\b/, "kpiRow"],
    [/\bbullets?|list\b/, "bullets"],
    [/\btitle slide\b/, "title"],
    [/\bclosing|call to action|\bcta\b|\bask slide\b/, "closing"],
  ];
  for (const [rx, id] of map) if (rx.test(ins)) return id;
  return null;
}
