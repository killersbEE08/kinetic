"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { saveDraftInput } from "@/lib/client/draft";
import type { DeckType } from "@/lib/deck/schema";
import { deckTheme, THEMES } from "@/lib/deck/themes";
import { templateDeck } from "@/lib/deck/templates";
import { SlideView } from "@/components/deck/SlideView";
import { EASE, RiseWords, ScrollTilt } from "./motion";

const TABS: { type: DeckType; label: string; example: string; glyph: string }[] = [
  { type: "pitch", label: "Pitch", example: "Seed pitch for a bookkeeping app for small shops. MRR $18k, 1,240 paying shops.", glyph: "M3 12h3V8H3zm4 0h3V5H7zm4 0h3V2h-3z" },
  { type: "launch", label: "Launch", example: "Announce offline mode for our notes app. One in four sessions starts on a weak connection.", glyph: "M7 1l2 5 5 1-4 3 1 5-4-3-4 3 1-5-4-3 5-1z" },
  { type: "sales", label: "Sales", example: "Proposal for a retail chain: onboard 1,200 store staff a year in two days instead of nine.", glyph: "M2 4h11v7H2zM4 2h7v2H4z" },
  { type: "lesson", label: "Lesson", example: "A 20-minute lesson on compound interest for first-year students, with a worked example.", glyph: "M1 4l6.5-3L14 4l-6.5 3zm2 2v4c2 2 7 2 9 0V6" },
  { type: "academic", label: "Academics", example: "Thesis defence on microplastics in river sediment: 3 sites, 48 samples, method and key findings.", glyph: "M2 2h8l3 3v8H2zM10 2v3h3M4.5 8h6M4.5 10.5h4" },
  { type: "report", label: "Report", example: "Q3 business review: revenue $3.1M, 8,420 restaurants, support response time rose to 11 hours.", glyph: "M2 13V7h3v6zm4.5 0V3h3v10zM11 13V9h3v4z" },
];

export function Hero() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [tab, setTab] = useState(0);
  const [text, setText] = useState("");
  const current = TABS[tab];

  function go(e: React.FormEvent) {
    e.preventDefault();
    saveDraftInput({ prompt: (text.trim() || current.example).slice(0, 4000), deckType: current.type });
    router.push("/new");
  }

  return (
    <section className="m-tex m-hero-bg relative pb-24 pt-20 md:pb-32 md:pt-28">
      <div className="m-frame flex flex-col items-center text-center">
        <p className="mb-5 inline-flex items-center gap-2 text-[13px] text-[#4b4f57]">
          <span className="inline-flex h-5 items-center rounded-[5px] bg-[var(--m-ink)] px-1.5 text-[11px] font-semibold text-white">Free</span>
          3 decks, no card needed
        </p>
        <h1 className="m-h1 max-w-[900px]">
          <RiseWords text="Your notes, as a deck that moves" accent="moves" />
        </h1>
        <motion.p className="m-lead mt-5 max-w-[620px] text-[18px]" initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE, delay: 0.25 }}>
          Paste a memo or a rough outline. DeckIQ plans the story, builds animated slides from your own words, and lets you change them in plain language.
        </motion.p>
        <motion.div className="mt-8 flex flex-wrap items-center justify-center gap-3" initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE, delay: 0.35 }}>
          <Link href="/new" className="m-pill m-pill-dark m-shine h-[52px] px-7 text-[16px]">Start a deck free</Link>
          <Link href="/templates" className="m-pill m-glass h-[52px] px-6 text-[16px]">
            Open a sample deck
            <span className="flex -space-x-1" aria-hidden="true">
              {THEMES.slice(0, 4).map((t) => (
                <span key={t.id} className="h-4 w-4 rounded-full border border-white" style={{ background: t.colors.accent === t.colors.text ? t.colors.bg : t.colors.accent }} />
              ))}
            </span>
          </Link>
        </motion.div>

        <motion.form onSubmit={go} className="m-glass mt-14 w-full max-w-[760px] rounded-[18px] p-3 text-left" aria-label="Describe your deck" initial={reduce ? false : { opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.7, ease: EASE, delay: 0.45 }}>
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
          <div className="mt-3 flex items-center gap-2 rounded-[14px] border border-[var(--m-line)] bg-white p-2 pl-4 shadow-[0_1px_2px_rgba(16,17,20,0.04)] transition-[border-color,box-shadow] duration-200 focus-within:border-[var(--m-blue)] focus-within:shadow-[0_0_0_4px_rgba(37,99,217,0.14)]">
            <label htmlFor="hero-prompt" className="sr-only">What are you presenting?</label>
            <input
              id="hero-prompt"
              className="h-11 min-w-0 flex-1 bg-transparent text-[15px] text-[var(--m-ink)] outline-none focus-visible:outline-none placeholder:text-[#8a8e97]"
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
        </motion.form>

        <ScrollTilt className="mt-16 w-full max-w-[1040px] md:mt-20">
          <HeroPlayer />
        </ScrollTilt>
      </div>
    </section>
  );
}

const HERO_SLIDES = [0, 1, 4, 5, 6];

/** The real product: a sample deck playing its builds in the editor frame. Pausable (WCAG 2.2.2). */
function HeroPlayer() {
  const reduce = useReducedMotion();
  const deck = templateDeck("ledgerly-seed")!;
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const live = inView && !paused && !reduce;
  useEffect(() => {
    if (!live) return;
    const t = setTimeout(() => setI((n) => (n + 1) % HERO_SLIDES.length), 4200);
    return () => clearTimeout(t);
  }, [live, i]);
  const idx = HERO_SLIDES[i];
  return (
    <div ref={ref} className="m-window overflow-hidden rounded-[18px] bg-white text-left">
      <div className="flex h-11 items-center gap-3 border-b border-[var(--m-line)] px-4">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </span>
        <span className="m-mono truncate text-[11px] text-[var(--m-gray)]">Ledgerly seed pitch · slide {idx + 1} of {deck.slides.length}</span>
        <button type="button" className="ml-auto rounded-full border border-[var(--m-line)] px-3 py-1 text-[12px] text-[var(--m-gray)] hover:text-[var(--m-ink)]" onClick={() => setPaused((v) => !v)} aria-pressed={paused}>
          {paused ? "Play" : "Pause"}
        </button>
      </div>
      <div className="grid md:grid-cols-[148px_1fr]">
        <ol className="hidden space-y-2 border-r border-[var(--m-line)] bg-[var(--m-soft)] p-3 md:block" aria-label="Slides">
          {HERO_SLIDES.map((s, k) => (
            <li key={s}>
              <button type="button" onClick={() => setI(k)} aria-label={`Show slide ${s + 1}`} aria-current={k === i ? "true" : undefined} className={`block w-full overflow-hidden rounded-[6px] border-2 transition-colors ${k === i ? "border-[var(--m-blue)]" : "border-transparent opacity-70 hover:opacity-100"}`}>
                <SlideView slide={deck.slides[s]} theme={deckTheme(deck)} intensity="calm" mode="static" />
              </button>
            </li>
          ))}
        </ol>
        <div className="relative bg-[#eef0f3] p-4 sm:p-8">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div key={idx} className="overflow-hidden rounded-[8px] shadow-[0_20px_40px_-20px_rgba(16,17,20,0.35)]" initial={reduce ? false : { opacity: 0, scale: 0.97, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 1.02 }} transition={{ duration: 0.5, ease: EASE }}>
              <SlideView slide={deck.slides[idx]} theme={deckTheme(deck)} intensity={deck.motionIntensity} mode={reduce ? "static" : "play"} step={9} playKey={`${idx}-${live ? 1 : 0}`} label={`Ledgerly sample deck, slide ${idx + 1}`} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
