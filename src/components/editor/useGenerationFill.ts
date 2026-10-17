"use client";

// Editor side of "Start editing now": applies slides as they arrive from generation that is
// still running (see lib/client/genjob.ts). Waits while an AI suggestion is being reviewed, so
// the suggestion's slide positions stay valid.
import { useEffect, useState } from "react";
import type { Deck } from "@/lib/deck/schema";
import type { PatchOp } from "@/lib/deck/patch";
import { planFill } from "@/lib/deck/fill";
import { dropJob, getJob, subscribeJob, type JobStatus } from "@/lib/client/genjob";

type Commit = (ops: PatchOp[], opts: { label: string; history: "none" }) => boolean;

export interface FillProgress {
  status: JobStatus;
  ready: number;
  total: number;
  error: string | null;
  /** Finished slides not applied because the user had already edited them. */
  kept: number;
  stop: () => void;
}

export function useGenerationFill(deckId: string, loaded: boolean, current: () => Deck | null, commit: Commit, paused: boolean): FillProgress | null {
  const [progress, setProgress] = useState<FillProgress | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => subscribeJob(deckId, () => setTick((t) => t + 1)), [deckId]);

  useEffect(() => {
    const job = getJob(deckId);
    if (!job) return;
    const stop = () => job.abort.abort();
    const deck = current();
    let kept = 0;
    if (deck && loaded && !paused && (job.arrived.size || job.final)) {
      const plan = planFill(deck, { ids: job.ids, inserted: job.inserted, arrived: job.arrived, final: job.final });
      if (!plan.ops.length || commit(plan.ops, { label: "Slides arrived", history: "none" })) {
        job.inserted = plan.inserted;
        job.arrived.clear();
        kept = plan.kept;
        if (job.final) job.final = null; // applied once
      }
    }
    const finished = job.status !== "running" && !job.final && !job.arrived.size;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors the background job's progress
    setProgress((p) => ({ status: job.status, ready: job.ready.size, total: job.total, error: job.error, kept: (p?.kept ?? 0) + kept, stop }));
    if (finished) dropJob(deckId);
  }, [deckId, loaded, current, commit, paused, tick]);

  return progress;
}
