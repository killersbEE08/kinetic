"use client";

// Browser side of product activity. Components call track(); the backend provider
// decides where events go (the API when signed in, this browser in demo mode).
import type { EventName, EventProps } from "@/lib/events";

export interface TrackedEvent {
  name: EventName;
  deckId?: string;
  props?: EventProps;
  at: string;
}

type Sink = (e: TrackedEvent) => void;
let sink: Sink | null = null;
const early: TrackedEvent[] = [];

/** Set by the backend provider. Events sent before it mounts are replayed. */
export function setTrackSink(fn: Sink | null) {
  sink = fn;
  if (fn) for (const e of early.splice(0)) fn(e);
}

export function track(name: EventName, opts: { deckId?: string; props?: EventProps } = {}) {
  if (typeof window === "undefined") return;
  const e: TrackedEvent = { name, deckId: opts.deckId, props: opts.props, at: new Date().toISOString() };
  try {
    if (sink) sink(e);
    else if (early.length < 50) early.push(e);
  } catch {
    // Measuring must never break the app.
  }
}

/** Demo mode keeps the last 300 events in this browser (readable in tests and dev tools). */
export const DEMO_EVENTS_KEY = "kinetic.demo.events.v1";
export function demoSink(e: TrackedEvent) {
  try {
    const list = JSON.parse(localStorage.getItem(DEMO_EVENTS_KEY) ?? "[]") as TrackedEvent[];
    list.push(e);
    localStorage.setItem(DEMO_EVENTS_KEY, JSON.stringify(list.slice(-300)));
  } catch {
    // Storage full: drop the event.
  }
}
