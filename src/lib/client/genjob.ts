"use client";

// "Start editing now": the deck is saved as soon as slide 1 is written, the editor opens, and the
// rest of the slides keep arriving in the background. The generation request lives here, outside
// any page, so moving from /new to the editor doesn't stop it. The editor applies updates with
// planFill (lib/deck/fill.ts), which never overwrites slides the user changed.
import { composeSlide } from "@/lib/deck/compose";
import { WRITING_TEXT } from "@/lib/deck/fill";
import { newId } from "@/lib/deck/ids";
import type { Slide } from "@/lib/deck/schema";

export type JobStatus = "running" | "done" | "error";

export interface GenJob {
  deckId: string | null;
  total: number;
  ids: string[];
  inserted: (Slide | undefined)[];
  arrived: Map<number, Slide>;
  final: Slide[] | null;
  status: JobStatus;
  error: string | null;
  /** Positions that have content (streamed or final), for the progress line. */
  ready: Set<number>;
  abort: AbortController;
}

const jobs = new Map<string, GenJob>();
const listeners = new Map<string, Set<() => void>>();

export function newJob(total: number, abort: AbortController): GenJob {
  return { deckId: null, total, ids: Array.from({ length: total }, () => newId("sl")), inserted: [], arrived: new Map(), final: null, status: "running", error: null, ready: new Set(), abort };
}

/** Called once the early deck is saved: from now on the editor for `deckId` receives updates. */
export function attachJob(job: GenJob, deckId: string) {
  job.deckId = deckId;
  jobs.set(deckId, job);
}

export const getJob = (deckId: string) => jobs.get(deckId) ?? null;

function emit(job: GenJob) {
  if (!job.deckId) return;
  for (const fn of listeners.get(job.deckId) ?? []) fn();
}

export function subscribeJob(deckId: string, fn: () => void): () => void {
  let set = listeners.get(deckId);
  if (!set) listeners.set(deckId, (set = new Set()));
  set.add(fn);
  return () => {
    set!.delete(fn);
  };
}

export function jobSlide(job: GenJob, index: number, slide: Slide) {
  if (index < 0 || index >= job.total) return;
  job.arrived.set(index, { ...slide, id: job.ids[index] });
  job.ready.add(index);
  emit(job);
}

export function jobDone(job: GenJob, finalSlides: Slide[]) {
  job.final = finalSlides.slice(0, job.total).map((s, i) => ({ ...s, id: job.ids[i] }));
  for (let i = 0; i < job.final.length; i++) job.ready.add(i);
  job.status = "done";
  emit(job);
}

export function jobFailed(job: GenJob, message: string) {
  job.status = "error";
  job.error = message;
  emit(job);
}

export function dropJob(deckId: string) {
  jobs.delete(deckId);
}

/** Stand-in for a slide that is still being written. */
export function writingSlide(id: string, title: string): Slide {
  return { ...composeSlide({ layout: "headlineBody", slots: [{ slot: "title", text: title.slice(0, 160) || "Slide" }, { slot: "body", text: WRITING_TEXT }] }), id };
}
