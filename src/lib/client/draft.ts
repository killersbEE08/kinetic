"use client";

// Shared draft for the New Deck flow, so the landing page and the dashboard can hand off a
// prompt, imported files, chosen photos, or a template look.
import type { GenerationInput, Intensity } from "@/lib/deck/schema";
import type { PhotoRef } from "@/lib/deck/place";

export const DRAFT_KEY = "kinetic.newdeck.draft.v1";

export interface DraftDoc {
  id: string;
  name: string;
  kind: "pdf" | "docx" | "pptx" | "xlsx" | "csv" | "text";
  text: string;
  words: number;
  note?: string;
}

export interface DraftPhoto extends PhotoRef {
  id: string;
  name: string;
}

export interface Draft {
  input?: GenerationInput;
  outline?: unknown;
  themeId?: string;
  intensity?: Intensity;
  docs?: DraftDoc[];
  photos?: DraftPhoto[];
  /** Template whose design (theme, brand kit, motion) the new deck should reuse. */
  look?: string | null;
  brandName?: string;
  /** Brand kit chosen on the dashboard. */
  brandKitId?: string | null;
  /** Start writing the outline as soon as /new opens. */
  autostart?: boolean;
}

const BASE: GenerationInput = { prompt: "", notes: "", deckType: "custom", slideCount: "auto", audience: "", language: "English" };

export function saveDraftInput(input: Partial<GenerationInput>) {
  saveDraft({ input: { ...BASE, ...input } });
}

/** Starts a fresh draft (replaces any previous one). */
export function saveDraft(d: Omit<Draft, "input"> & { input?: Partial<GenerationInput> }) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, input: { ...BASE, ...d.input }, outline: null }));
  } catch {
    // Storage blocked or full: the New Deck page simply starts empty.
  }
}

export function readDraft(): Draft {
  try {
    return JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "{}") as Draft;
  } catch {
    return {};
  }
}
