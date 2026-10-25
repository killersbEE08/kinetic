// "Full access" AI: the model returns a list of editor tool calls (add/delete/move slides,
// rewrite content, change theme, style elements...). This module runs them on a copy of the
// deck and turns the result into one proposal (patch ops + preview). Nothing is saved until
// the user accepts it, and it is one undo step. Pure module: used by the API route and tests.
import { z } from "zod";
import { Deck, ElStyle, INTENSITIES, TRANSITIONS, type Element, type Slide } from "../deck/schema";
import { applyDeckPatch, checkScope, type PatchOp } from "../deck/patch";
import { composeSlide, elementToSlot, SlotContent, swapLayout } from "../deck/compose";
import { runQa, type QaIssue } from "../deck/qa";
import { AI_LAYOUT_IDS, LAYOUT_IDS } from "../deck/layouts";
import { THEMES } from "../deck/themes";
import { newId } from "../deck/ids";
import { slottedForAi } from "./edit";

export const AGENT_TOOLS = [
  "set_deck_title",
  "set_theme",
  "set_motion_intensity",
  "add_slide",
  "rewrite_slide",
  "change_layout",
  "delete_slide",
  "duplicate_slide",
  "move_slide",
  "set_hidden",
  "set_notes",
  "set_transition",
  "set_background",
  "style_element",
  "delete_element",
] as const;

/** One tool call. Flat on purpose: simple for the model's JSON mode, checked per tool below. */
export const AgentAction = z.object({
  tool: z.enum(AGENT_TOOLS),
  slideId: z.string().max(40).optional(),
  /** add_slide: insert after this slide id; "start" puts it first. Missing = after the current slide. */
  afterSlideId: z.string().max(40).optional(),
  /** move_slide: new 1-based position. */
  toPosition: z.number().int().min(1).max(100).optional(),
  elementId: z.string().max(40).optional(),
  title: z.string().max(200).optional(),
  themeId: z.string().max(32).optional(),
  intensity: z.enum(INTENSITIES).optional(),
  layout: z.string().max(32).optional(),
  slots: z.array(SlotContent).max(10).optional(),
  notes: z.string().max(5000).optional(),
  hidden: z.boolean().optional(),
  transition: z.enum(TRANSITIONS).optional(),
  /** set_background: "#rrggbb", or "none" to remove. */
  color: z.string().max(7).optional(),
  style: ElStyle.optional(),
});
export type AgentAction = z.infer<typeof AgentAction>;

export const AgentReply = z.object({ summary: z.string().max(400), actions: z.array(AgentAction).min(1).max(60) });
export type AgentReply = z.infer<typeof AgentReply>;

export class AgentError extends Error {}

export interface AgentContext {
  /** Slide the user is looking at ("this slide"). */
  slideId?: string;
  /** Element the user selected ("this", "the selected box"). */
  elementId?: string;
}

export interface AgentProposal {
  summary: string;
  ops: PatchOp[];
  issues: QaIssue[];
  changedSlideIds: string[];
  /** Tool calls that could not run, with the reason (shown to the user). */
  skipped: string[];
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Rebuilds a slide from AI slots, keeping photos/screens the AI can't see and boxes added by hand. */
function rebuild(prev: Slide, layout: string, slots: SlotContent[], notes?: string): Slide {
  const kept = prev.elements.filter((e) => (e.type === "image" || e.type === "mockup") && !slots.some((c) => c.slot === e.slot)).map(elementToSlot);
  return composeSlide({ layout, slots: [...slots, ...kept], notes: notes ?? prev.notes }, prev);
}

/** Runs the tool calls in order on a copy of the deck. Bad calls are skipped, not fatal. */
export function runAgentActions(deck: Deck, actions: AgentAction[], ctx: AgentContext = {}): { deck: Deck; skipped: string[]; touched: Set<string> } {
  const d: Deck = structuredClone(deck);
  const skipped: string[] = [];
  const touched = new Set<string>();
  let lastAdded: string | undefined;
  const at = (id?: string) => (id ? d.slides.findIndex((s) => s.id === id) : -1);
  const layoutOk = (l?: string) => !!l && LAYOUT_IDS.includes(l);

  actions.forEach((a, n) => {
    const fail = (why: string) => skipped.push(`Step ${n + 1} (${a.tool}): ${why}`);
    const si = at(a.slideId ?? (["add_slide", "set_deck_title", "set_theme", "set_motion_intensity"].includes(a.tool) ? undefined : ctx.slideId));
    const needSlide = () => {
      if (si < 0) fail("slide not found");
      return si >= 0;
    };
    switch (a.tool) {
      case "set_deck_title":
        if (!a.title?.trim()) return fail("missing title");
        d.title = a.title.trim().slice(0, 200);
        return;
      case "set_theme":
        if (!THEMES.some((t) => t.id === a.themeId)) return fail(`unknown theme "${a.themeId}"`);
        d.themeId = a.themeId!;
        return;
      case "set_motion_intensity":
        if (!a.intensity) return fail("missing intensity");
        d.motionIntensity = a.intensity;
        return;
      case "add_slide": {
        if (d.slides.length >= 100) return fail("a deck holds at most 100 slides");
        if (!layoutOk(a.layout) || !a.slots?.length) return fail("needs a layout and slots");
        const after = a.afterSlideId === "start" ? -1 : at(a.afterSlideId === "previous" ? lastAdded : (a.afterSlideId ?? ctx.slideId));
        const pos = a.afterSlideId === "start" ? 0 : after >= 0 ? after + 1 : d.slides.length;
        const s = composeSlide({ layout: a.layout!, slots: a.slots, notes: a.notes ?? "" });
        d.slides.splice(pos, 0, s);
        touched.add(s.id);
        lastAdded = s.id;
        return;
      }
      case "rewrite_slide": {
        if (!needSlide()) return;
        if (!a.slots?.length) return fail("missing slots");
        const prev = d.slides[si];
        const layout = layoutOk(a.layout) ? a.layout! : prev.layout;
        d.slides[si] = { ...rebuild(prev, layout, a.slots, a.notes), hidden: prev.hidden, background: prev.background, transition: prev.transition };
        touched.add(prev.id);
        return;
      }
      case "change_layout":
        if (!needSlide()) return;
        if (!layoutOk(a.layout)) return fail(`unknown layout "${a.layout}"`);
        d.slides[si] = swapLayout(d.slides[si], a.layout!);
        touched.add(d.slides[si].id);
        return;
      case "delete_slide":
        if (!needSlide()) return;
        if (d.slides.length <= 1) return fail("a deck needs at least one slide");
        d.slides.splice(si, 1);
        return;
      case "duplicate_slide": {
        if (!needSlide()) return;
        if (d.slides.length >= 100) return fail("a deck holds at most 100 slides");
        const src = d.slides[si];
        const copy: Slide = { ...structuredClone(src), id: newId("sl"), elements: src.elements.map((e) => ({ ...structuredClone(e), id: newId("el") })) };
        d.slides.splice(si + 1, 0, copy);
        touched.add(copy.id);
        return;
      }
      case "move_slide": {
        if (!needSlide()) return;
        if (!a.toPosition) return fail("missing toPosition");
        const [s] = d.slides.splice(si, 1);
        d.slides.splice(Math.min(d.slides.length, a.toPosition - 1), 0, s);
        touched.add(s.id);
        return;
      }
      case "set_hidden":
        if (!needSlide()) return;
        if (a.hidden) d.slides[si].hidden = true;
        else delete d.slides[si].hidden;
        if (!d.slides.some((s) => !s.hidden)) {
          delete d.slides[si].hidden;
          return fail("at least one slide has to stay visible");
        }
        touched.add(d.slides[si].id);
        return;
      case "set_notes":
        if (!needSlide()) return;
        d.slides[si].notes = (a.notes ?? "").slice(0, 5000);
        touched.add(d.slides[si].id);
        return;
      case "set_transition":
        if (!needSlide()) return;
        if (!a.transition) return fail("missing transition");
        d.slides[si].transition = a.transition;
        touched.add(d.slides[si].id);
        return;
      case "set_background": {
        if (!needSlide()) return;
        const s = d.slides[si];
        if (a.color === "none") {
          if (s.background) delete s.background.color;
          if (s.background && !s.background.image) delete s.background;
        } else if (a.color && HEX.test(a.color)) s.background = { ...s.background, color: a.color };
        else return fail("color must be #rrggbb or none");
        touched.add(s.id);
        return;
      }
      case "style_element":
      case "delete_element": {
        if (!needSlide()) return;
        const s = d.slides[si];
        const ei = s.elements.findIndex((e) => e.id === (a.elementId ?? ctx.elementId));
        if (ei < 0) return fail("element not found on that slide");
        if (a.tool === "delete_element") s.elements.splice(ei, 1);
        else {
          if (!a.style) return fail("missing style");
          s.elements[ei] = { ...s.elements[ei], style: { ...s.elements[ei].style, ...a.style } } as Element;
        }
        touched.add(s.id);
        return;
      }
    }
  });
  return { deck: d, skipped, touched };
}

/** Turns the tool calls into a validated proposal. Throws AgentError when nothing usable is left. */
export function buildAgentProposal(deck: Deck, reply: AgentReply, ctx: AgentContext = {}, sourceText?: string): AgentProposal {
  const { deck: next, skipped, touched } = runAgentActions(deck, reply.actions, ctx);
  // Quality gates (word limits, banned phrases, invented numbers) on slides the AI changed.
  const toCheck = next.slides.filter((s) => touched.has(s.id));
  const qa = toCheck.length ? runQa({ ...next, slides: toCheck }, sourceText) : { deck: { ...next, slides: [] as Slide[] }, issues: [] as QaIssue[] };
  const fixed = new Map(qa.deck.slides.map((s) => [s.id, s]));
  const slides = next.slides.map((s) => fixed.get(s.id) ?? s);

  const ops: PatchOp[] = [];
  if (next.title !== deck.title) ops.push({ op: "replace", path: "/title", value: next.title });
  if (next.themeId !== deck.themeId) ops.push({ op: "replace", path: "/themeId", value: next.themeId });
  if (next.motionIntensity !== deck.motionIntensity) ops.push({ op: "replace", path: "/motionIntensity", value: next.motionIntensity });
  if (JSON.stringify(slides) !== JSON.stringify(deck.slides)) ops.push({ op: "replace", path: "/slides", value: slides });
  if (!ops.length) throw new AgentError(skipped.length ? `Nothing could be changed. ${skipped.slice(0, 3).join(" ")}` : "Nothing to change. Try a more specific request.");

  const violation = checkScope(deck, ops, { kind: "deck" });
  if (violation) throw new AgentError(`Change blocked: ${violation}`);
  applyDeckPatch(deck, ops); // throws PatchError if the result is not a valid deck

  const before = new Map(deck.slides.map((s) => [s.id, JSON.stringify(s)]));
  const changed = slides.filter((s) => before.get(s.id) !== JSON.stringify(s)).map((s) => s.id);
  return { summary: reply.summary, ops, issues: qa.issues, changedSlideIds: changed, skipped };
}

/** Compact view of the deck for the model: ids, layout, content, element ids and styles. */
export function deckForAgent(deck: Deck) {
  return {
    title: deck.title,
    themeId: deck.themeId,
    motionIntensity: deck.motionIntensity,
    slides: deck.slides.map((s, i) => ({
      position: i + 1,
      id: s.id,
      ...(s.hidden ? { hidden: true } : {}),
      transition: s.transition,
      ...(s.background?.color ? { background: s.background.color } : {}),
      ...slottedForAi(s),
      elements: s.elements.map((e) => ({
        id: e.id,
        slot: e.slot,
        type: e.type,
        ...(e.type === "text" ? { text: e.content.slice(0, 80) } : e.type === "shape" ? { text: e.text.slice(0, 80) } : {}),
        ...(e.style ? { style: e.style } : {}),
      })),
    })),
  };
}

export const AGENT_LAYOUTS = AI_LAYOUT_IDS;
