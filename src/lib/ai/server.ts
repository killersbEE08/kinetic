import "server-only";
import type { EditScope } from "../deck/patch";
import type { Deck, GenerationInput, Outline } from "../deck/schema";
import type { SlottedSlide } from "../deck/compose";
import { toSlotted } from "../deck/compose";
import { type AuthedUser, dbError } from "../server/auth";
import { config } from "../server/env";
import { CREDIT_COST, generateCost } from "../billing/credits";
import { geminiJson, geminiModelName } from "./gemini";
import { offlineOutline, offlineSlides, outlineSlideToSlotted } from "./offline";
import { EditElementsReply, EditSlidesReply, editElementsPrompt, editSlidesPrompt, outlinePrompt, slidesPrompt } from "./prompts";
import { buildProposal, EditError, offlineEdit, selectedSlideIndexes, slotsToElements, slottedForAi, slottedToSlides, type Proposal } from "./edit";

export type Engine = "gemini" | "offline";
export const engine = (): Engine => (config.geminiEnabled() ? "gemini" : "offline");

/** Atomically checks and records AI credit use (SQL function consume_ai_credits). */
export async function chargeCredits(user: AuthedUser, task: string, credits: number): Promise<number> {
  const { data, error } = await user.db.rpc("consume_ai_credits", { p_task: task, p_model: engine() === "gemini" ? geminiModelName() : "offline", p_credits: credits });
  if (error) dbError(error, "Could not check your AI credits.");
  return data as number;
}

export const sourceTextOf = (input: Pick<GenerationInput, "prompt" | "notes">) => `${input.prompt}\n\n${input.notes}`.trim();

export async function makeOutline(user: AuthedUser, input: GenerationInput): Promise<{ outline: Outline; engine: Engine }> {
  if (engine() === "offline") return { outline: offlineOutline(input), engine: "offline" };
  await chargeCredits(user, "outline", CREDIT_COST.outline);
  const p = outlinePrompt(input);
  const outline = await geminiJson({ ...p, maxOutputTokens: 8192 });
  return { outline, engine: "gemini" };
}

const BATCH = 4;

/** Writes slides batch by batch; calls onSlide as each batch finishes so the UI can stream them in. */
export async function writeSlides(
  user: AuthedUser,
  outline: Outline,
  input: GenerationInput,
  onSlide: (index: number, slide: SlottedSlide, engine: Engine) => void,
): Promise<{ slides: SlottedSlide[]; engine: Engine }> {
  const n = outline.slides.length;
  if (engine() === "offline") {
    const slides = offlineSlides(outline);
    slides.forEach((s, i) => onSlide(i, s, "offline"));
    return { slides, engine: "offline" };
  }

  await chargeCredits(user, "generate", generateCost(n));
  const result: SlottedSlide[] = new Array(n);
  const batches: [number, number][] = [];
  for (let i = 0; i < n; i += BATCH) batches.push([i, Math.min(n, i + BATCH)]);

  await Promise.all(
    batches.map(async ([from, to]) => {
      let slides: SlottedSlide[];
      let used: Engine = "gemini";
      try {
        const reply = await geminiJson({ ...slidesPrompt(outline, from, to, input), maxOutputTokens: 8192 });
        slides = reply.slides.slice(0, to - from);
        if (slides.length < to - from) throw new Error("short batch");
      } catch (e) {
        // One failed batch shouldn't fail the deck: fall back to the outline-based layout for those slides.
        console.error("[generate] batch fallback", from, to, e instanceof Error ? e.message : e);
        slides = outline.slides.slice(from, to).map((s, k) => outlineSlideToSlotted(s, from + k, n));
        used = "offline";
      }
      slides.forEach((s, k) => {
        result[from + k] = s;
        onSlide(from + k, s, used);
      });
    }),
  );
  return { slides: result, engine: "gemini" };
}

export async function proposeEdit(user: AuthedUser, deck: Deck, scope: EditScope, instruction: string): Promise<Proposal & { engine: Engine }> {
  const source = deck.source ?? "";
  if (engine() === "offline") {
    const { summary, change } = offlineEdit(deck, scope, instruction);
    return { ...buildProposal(deck, scope, change, summary, source || undefined), engine: "offline" };
  }

  await chargeCredits(user, "edit", CREDIT_COST.edit);
  const lang = deck.language || "en";

  if (scope.kind === "element") {
    const slide = deck.slides.find((s) => s.id === scope.slideId);
    if (!slide) throw new EditError("The selected slide no longer exists.");
    const current = toSlotted(slide).slots.filter((s) => slide.elements.some((e) => e.slot === s.slot && scope.elementIds.includes(e.id)));
    const titleEl = slide.elements.find((e) => e.type === "text" && e.role === "h1");
    const reply = await geminiJson({
      ...editElementsPrompt({ instruction, layout: slide.layout, current, slideTitle: titleEl?.type === "text" ? titleEl.content : "", sourceText: source, language: lang }),
      schema: EditElementsReply,
      maxOutputTokens: 2048,
    });
    const elements = slotsToElements(deck, scope, reply.slots);
    return { ...buildProposal(deck, scope, { kind: "elements", elements }, reply.summary, source || undefined), engine: "gemini" };
  }

  const idx = selectedSlideIndexes(deck, scope);
  const current = idx.map((i) => slottedForAi(deck.slides[i]));
  const neighbours = deck.slides
    .map((s, i) => ({ i, t: s.elements.find((e) => e.type === "text" && e.role === "h1") }))
    .filter(({ i }) => !idx.includes(i))
    .map(({ i, t }) => `${i + 1}. ${t?.type === "text" ? t.content : ""}`);
  const reply = await geminiJson({
    ...editSlidesPrompt({ instruction, current, neighbours: scope.kind === "deck" ? [] : neighbours, sourceText: source, language: lang }),
    schema: EditSlidesReply,
    maxOutputTokens: scope.kind === "deck" ? 16384 : 4096,
  });
  const slides = slottedToSlides(deck, scope, reply.slides);
  const change = scope.kind === "deck" ? ({ kind: "deck", slides } as const) : ({ kind: "slides", slides } as const);
  return { ...buildProposal(deck, scope, change, reply.summary, source || undefined), engine: "gemini" };
}
