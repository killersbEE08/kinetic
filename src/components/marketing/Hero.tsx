"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveDraftInput } from "@/lib/client/draft";
import type { DeckType } from "@/lib/deck/schema";
import { THEMES } from "@/lib/deck/themes";

const TABS: { type: DeckType; label: string; example: string; glyph: string }[] = [
  { type: "pitch", label: "Pitch", example: "Seed pitch for a bookkeeping app for small shops. MRR $18k, 1,240 paying shops.", glyph: "M3 12h3V8H3zm4 0h3V5H7zm4 0h3V2h-3z" },
  { type: "launch", label: "Launch", example: "Announce offline mode for our notes app. One in four sessions starts on a weak connection.", glyph: "M7 1l2 5 5 1-4 3 1 5-4-3-4 3 1-5-4-3 5-1z" },
  { type: "sales", label: "Sales", example: "Proposal for a retail chain: onboard 1,200 store staff a year in two days instead of nine.", glyph: "M2 4h11v7H2zM4 2h7v2H4z" },
  { type: "lesson", label: "Lesson", example: "A 20-minute lesson on compound interest for first-year students, with a worked example.", glyph: "M1 4l6.5-3L14 4l-6.5 3zm2 2v4c2 2 7 2 9 0V6" },
  { type: "report", label: "Report", example: "Q3 business review: revenue $3.1M, 8,420 restaurants, support response time rose to 11 hours.", glyph: "M2 13V7h3v6zm4.5 0V3h3v10zM11 13V9h3v4z" },
];

export function Hero() {
  const router = useRouter();
  const [tab, setTab] = useState(0);
  const [text, setText] = useState("");
  const current = TABS[tab];

  function go(e: React.FormEvent) {
    e.preventDefault();
    saveDraftInput({ prompt: (text.trim() || current.example).slice(0, 4000), deckType: current.type });
    router.push("/new");
  }

  return (
    <section className="m-tex m-hero-bg relative pb-40 pt-20 md:pb-56 md:pt-28">
      <div className="m-frame flex flex-col items-center text-center">
        <p className="mb-5 inline-flex items-center gap-2 text-[13px] text-[#4b4f57]">
          <span className="inline-flex h-5 items-center rounded-[5px] bg-[var(--m-ink)] px-1.5 text-[11px] font-semibold text-white">Free</span>
          3 decks, no card needed
        </p>
        <h1 className="m-h1 max-w-[900px]">
          Your notes, as a deck that <span className="m-accent">moves</span>
        </h1>
        <p className="m-lead mt-5 max-w-[620px] text-[18px]">
          Paste a memo or a rough outline. Kinetic plans the story, builds animated slides from your own words, and lets you change them in plain language.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/new" className="m-pill m-pill-dark h-[52px] px-7 text-[16px]">Start a deck free</Link>
          <Link href="/templates" className="m-pill m-glass h-[52px] px-6 text-[16px]">
            Open a sample deck
            <span className="flex -space-x-1" aria-hidden="true">
              {THEMES.slice(0, 4).map((t) => (
                <span key={t.id} className="h-4 w-4 rounded-full border border-white" style={{ background: t.colors.accent === t.colors.text ? t.colors.bg : t.colors.accent }} />
              ))}
            </span>
          </Link>
        </div>

        <form onSubmit={go} className="m-glass mt-14 w-full max-w-[760px] rounded-[18px] p-3 text-left" aria-label="Describe your deck">
          <div role="tablist" aria-label="Deck type" className="flex flex-wrap gap-1">
            {TABS.map((t, i) => (
              <button
                key={t.type}
                type="button"
                role="tab"
                aria-selected={i === tab}
                onClick={() => setTab(i)}
                className={`flex h-10 items-center gap-2 rounded-[10px] px-3 text-[14px] font-medium transition-colors ${i === tab ? "bg-white text-[var(--m-ink)] shadow-[0_1px_3px_rgba(16,17,20,0.12)]" : "text-[#5d616a] hover:bg-white/60"}`}
              >
                <span className={`flex h-6 w-6 items-center justify-center rounded-[6px] ${i === tab ? "bg-[var(--m-blue)] text-white" : "bg-white/70 text-[#5d616a]"}`} aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 15 15">
                    <path d={t.glyph} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                  </svg>
                </span>
                {t.label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-[12px] bg-white/80 p-2 pl-4">
            <label htmlFor="hero-prompt" className="sr-only">What are you presenting?</label>
            <input
              id="hero-prompt"
              className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[#8a8e97]"
              placeholder={current.example}
              value={text}
              maxLength={4000}
              onChange={(e) => setText(e.target.value)}
            />
            <button type="submit" aria-label="Continue to the outline" className="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] bg-[var(--m-blue)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_6px_rgba(37,99,217,0.4)] transition-transform hover:-translate-y-px">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          <p className="px-2 pt-2 text-[12px] text-[#5d616a]">Press Enter to see the outline first. Nothing is designed until you approve the story.</p>
        </form>
      </div>
    </section>
  );
}
