"use client";

import { useState } from "react";
import { SlideView } from "@/components/deck/SlideView";
import { templateDeck } from "@/lib/deck/templates";
import { getTheme, withBrand } from "@/lib/deck/themes";
import { stepCount } from "@/lib/deck/motion";
import type { Intensity } from "@/lib/deck/schema";

// Slides with different motion presets: count-up, grow, steps, KPI row.
const PICKS: [string, number][] = [
  ["kiln-seed", 4],
  ["fernway-seed", 5],
  ["ledgerly-seed", 3],
  ["medley-series-a", 4],
];

export function MotionPlayer() {
  const [intensity, setIntensity] = useState<Intensity>("standard");
  const [i, setI] = useState(0);
  const [key, setKey] = useState(0);
  const [id, idx] = PICKS[i];
  const deck = templateDeck(id)!;
  const slide = deck.slides[idx];
  const replay = () => setKey((k) => k + 1);
  return (
    <div>
      <div className="overflow-hidden rounded-[10px] border border-[var(--m-line)]">
        <SlideView slide={slide} theme={withBrand(getTheme("night"), deck.brand)} intensity={intensity} mode="play" step={stepCount(slide, intensity)} playKey={`${slide.id}-${intensity}-${key}`} label="Motion example" />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div role="radiogroup" aria-label="Motion intensity" className="inline-flex rounded-full border border-[var(--m-line)] p-1">
          {(["calm", "standard", "expressive"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={intensity === v}
              onClick={() => {
                setIntensity(v);
                replay();
              }}
              className={`h-8 rounded-full px-3.5 text-[13px] capitalize transition-colors ${intensity === v ? "bg-[var(--m-ink)] text-white" : "text-[#5d616a] hover:text-[var(--m-ink)]"}`}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" className="m-pill m-pill-light m-pill-sm" onClick={replay}>Replay</button>
          <button
            type="button"
            className="m-pill m-pill-light m-pill-sm"
            onClick={() => {
              setI((n) => (n + 1) % PICKS.length);
              replay();
            }}
          >
            Next slide
          </button>
        </div>
      </div>
    </div>
  );
}
