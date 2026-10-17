"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SlideView } from "@/components/deck/SlideView";
import { useReducedMotion } from "@/lib/client/hooks";
import { templateDeck } from "@/lib/deck/templates";
import { deckTheme } from "@/lib/deck/themes";
import { offlineOutline } from "@/lib/ai/offline";
import { SAMPLE_NOTES, SAMPLE_PROMPT } from "@/lib/deck/sample";
import { BrowserChrome, Check, DeckThumb, JsonCode, SectionHead } from "./Common";
import { CATEGORY_LABEL, TEMPLATES } from "@/lib/deck/templates";
import { Reveal, ScrollRow } from "./motion";

// ---------------- 2. Proof strip ----------------
const KINDS = [
  ["Seed pitch", "M3 12h3V8H3zm4 0h3V5H7zm4 0h3V2h-3z"],
  ["Series A", "M2 12 6 7l3 3 5-7"],
  ["Board update", "M2 3h11v8H2zM5 14h5"],
  ["Sales proposal", "M2 4h11v7H2zM4 2h7v2H4z"],
  ["Product launch", "M7 1l2 5 5 1-4 3 1 5-4-3-4 3 1-5-4-3 5-1z"],
  ["Quarterly review", "M2 13V7h3v6zm4.5 0V3h3v10zM11 13V9h3v4z"],
  ["Impact report", "M7.5 13s-5-3-5-7a2.5 2.5 0 0 1 5-1 2.5 2.5 0 0 1 5 1c0 4-5 7-5 7z"],
  ["Lesson", "M1 4l6.5-3L14 4l-6.5 3zm2 2v4c2 2 7 2 9 0V6"],
  ["Metrics review", "M2 12l3-4 3 2 5-7"],
  ["Customer proposal", "M3 2h9v11H3zM5 5h5M5 8h5M5 11h3"],
] as const;

export function ProofStrip() {
  const half = Math.ceil(TEMPLATES.length / 2);
  const rows = [TEMPLATES.slice(0, half), TEMPLATES.slice(half)];
  return (
    <section className="border-b border-[var(--m-line)] bg-white py-20" aria-label="Sample decks made with Kinetic">
      <div className="m-frame">
        <Reveal>
          <p className="m-small text-center">Built for the decks people present every week. Hover a slide to play it.</p>
        </Reveal>
      </div>
      <div className="mt-10 space-y-5">
        {rows.map((row, r) => (
          <ScrollRow key={r} direction={r === 0 ? 1 : -1} className="m-edge-fade">
            {row.map((t) => (
              <Link key={t.id} href={`/t/${t.id}`} className="group block w-[300px] flex-none sm:w-[340px]" aria-label={`Open ${t.name}`}>
                <span className="block overflow-hidden rounded-[12px] border border-[var(--m-line)] shadow-[0_1px_2px_rgba(16,17,20,0.05)] transition-[box-shadow,transform] duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_20px_40px_-20px_rgba(16,17,20,0.35)]">
                  <DeckThumb templateId={t.id} slideIndex={t.highlights?.[1] ?? 0} />
                </span>
                <span className="mt-2 flex items-center justify-between px-1 text-[13px]">
                  <span className="font-medium">{t.name}</span>
                  <span className="text-[var(--m-gray)]">{CATEGORY_LABEL[t.category]}</span>
                </span>
              </Link>
            ))}
          </ScrollRow>
        ))}
      </div>
    </section>
  );
}

/** Kept for reference in other pages: the list of deck kinds. */
export function DeckKinds() {
  return (
    <section className="border-b border-[var(--m-line)] bg-white py-14" aria-label="What people make with Kinetic">
      <div className="m-frame">
        <p className="m-small text-center">Built for the decks people present every week</p>
        <ul className="mx-auto mt-8 grid max-w-[920px] grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-5">
          {KINDS.map(([name, d]) => (
            <li key={name} className="flex items-center justify-center gap-2 text-[15px] font-medium tracking-[-0.01em] text-[#6b6f78]">
              <svg width="16" height="16" viewBox="0 0 15 15" aria-hidden="true">
                <path d={d} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
              {name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ---------------- 3. Overview ----------------
function OverviewPlayer() {
  const deck = templateDeck("kiln-seed")!;
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const t = setTimeout(() => setI((n) => (n + 1) % deck.slides.length), 3800);
    return () => clearTimeout(t);
  }, [i, reduced, deck.slides.length]);
  return (
    <BrowserChrome url={`kinetic / decks / kiln-seed  ·  slide ${i + 1} of ${deck.slides.length}`}>
      <SlideView slide={deck.slides[i]} theme={deckTheme(deck)} intensity="standard" mode={reduced ? "static" : "play"} step={9} playKey={i} label={`Kiln sample deck, slide ${i + 1}`} />
      <div className="flex items-center justify-between border-t border-[var(--m-line)] px-3 py-2 text-[11px] text-[var(--m-gray)]">
        <span>Grid theme · Standard motion</span>
        <span className="flex gap-1" aria-hidden="true">
          {deck.slides.map((s, k) => (
            <span key={s.id} className={`h-1 rounded-full ${k === i ? "w-4 bg-[var(--m-ink)]" : "w-1 bg-[var(--m-line)]"}`} />
          ))}
        </span>
      </div>
    </BrowserChrome>
  );
}

const CAPS = [
  ["Outline first", "Fix the order and the points before any design happens."],
  ["20 layouts, 6 themes", "Tested grids for numbers, steps, quotes and comparisons."],
  ["Motion with a purpose", "Numbers count up, bars grow, headlines reveal."],
  ["Present anywhere", "Full screen in the browser with notes and a timer."],
];

export function Overview() {
  return (
    <section id="overview" className="m-ruled scroll-mt-20 border-b border-[var(--m-line)] bg-white">
      <div className="m-frame">
        <div className="grid items-center gap-12 py-24 md:grid-cols-[0.9fr_1.1fr] md:px-10">
          <div>
            <p className="m-eyebrow mb-4">Overview</p>
            <h2 className="m-h2">
              From rough notes to a finished, <span className="m-accent">animated</span> deck
            </h2>
            <p className="m-lead mt-5">Kinetic reads what you paste, writes an outline you can change, and builds every slide from a small set of tested layouts. Every number on a slide comes from your material.</p>
            <ul className="mt-6 space-y-2 text-[15px]">
              {["Paste notes, a memo or meeting minutes", "Edit the outline, then pick a theme", "Present, or keep editing in plain words"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <Check className="text-[var(--m-blue)]" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="m-tex m-tex-purple rounded-[18px] p-5 sm:p-8">
            <OverviewPlayer />
          </div>
        </div>
        <ul className="grid border-t border-[var(--m-line)] sm:grid-cols-2 lg:grid-cols-4">
          {CAPS.map(([t, d], k) => (
            <li key={t} className={`px-6 py-8 ${k > 0 ? "lg:border-l" : ""} ${k % 2 === 1 ? "sm:border-l" : ""} border-[var(--m-line)]`}>
              <h3 className="m-h3">{t}</h3>
              <p className="m-small mt-2">{d}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ---------------- 4. Two ways to start ----------------
export function TwoWays() {
  const outline = useMemo(() => {
    const o = offlineOutline({ prompt: SAMPLE_PROMPT, notes: SAMPLE_NOTES, deckType: "pitch", slideCount: "auto", audience: "Seed investors", language: "English" });
    return { title: o.title, slides: o.slides.slice(1, 4).map((s) => ({ title: s.title, points: s.points.slice(0, 2), layoutHint: s.layoutHint })) };
  }, []);
  return (
    <section className="bg-white py-24">
      <div className="m-frame">
        <SectionHead eyebrow="Two ways to start" title="Start from your notes, or from a finished example" />
        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          <div className="m-card flex flex-col p-8">
            <h3 className="text-[22px] font-medium tracking-[-0.02em]">Start from your notes</h3>
            <p className="m-small mt-2">The deck is built from what you give it. Nothing more.</p>
            <ul className="mt-8 flex-1 divide-y divide-[var(--m-line)] border-y border-[var(--m-line)]">
              {["Paste up to 50,000 words of notes", "Choose the deck type, audience and language", "Edit the outline: reorder, merge, delete", "Pick one of six themes and a motion level", "Watch the slides build one at a time"].map((t, k) => (
                <li key={t} className="flex items-center gap-3 py-3.5 text-[15px]">
                  <span className="m-mono w-6 text-[12px] text-[var(--m-gray)]">0{k + 1}</span>
                  {t}
                  <Check className="ml-auto text-[var(--m-green)]" />
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <Link href="/new" className="m-pill m-pill-dark">Start a deck</Link>
            </div>
          </div>
          <div className="m-tex m-tex-purple flex flex-col rounded-[16px] p-8">
            <div className="flex items-center justify-between">
              <h3 className="text-[22px] font-medium tracking-[-0.02em]">See what Kinetic writes first</h3>
              <span className="rounded-full bg-white/15 px-2.5 py-1 text-[12px]">outline.json</span>
            </div>
            <p className="mt-2 text-[14px] text-white/75">The outline below was written by Kinetic&rsquo;s offline engine from a one-page sample memo. Each point keeps the paragraph it came from.</p>
            <div className="m-code mt-6 flex-1 p-5">
              <JsonCode value={outline} maxLines={30} />
            </div>
            <div className="mt-6">
              <Link href="/t/ledgerly-seed" className="m-pill bg-white text-[var(--m-ink)]">Open the finished deck</Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
