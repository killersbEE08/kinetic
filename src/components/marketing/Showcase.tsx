"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SlideView } from "@/components/deck/SlideView";
import { MotionPlayer } from "@/components/marketing/MotionPlayer";
import { useReducedMotion } from "@/lib/client/hooks";
import { CATEGORIES, CATEGORY_LABEL, TEMPLATES, templateDeck, type TemplateCategory } from "@/lib/deck/templates";
import { THEMES, deckTheme } from "@/lib/deck/themes";
import { DeckThumb, SectionHead } from "./Common";

// ---------------- 8. Use cases ----------------
const USES = [
  { t: "Fundraising", d: "Seed and Series A pitches with traction charts, team slides and a clear ask.", id: "ledgerly-seed", s: 4 },
  { t: "Product launches", d: "What's new, why it matters and how to turn it on, with beta numbers that count up.", id: "relay-previews", s: 5 },
  { t: "Sales proposals", d: "Restate the buyer's problem in their words, then show the plan and the price.", id: "parcelpoint-d2c", s: 3 },
  { t: "Teaching", d: "Lessons with learning goals, worked examples, a recap and a closing exercise.", id: "compound-interest", s: 4 },
  { t: "Quarterly reviews", d: "Results, what went well, what didn't and next quarter's priorities.", id: "pantry-q3", s: 1 },
  { t: "Board updates", d: "A ten-minute read: summary metrics, wins, risks and the decisions you need.", id: "fernway-board", s: 5 },
];

export function UseCases() {
  return (
    <section className="bg-white py-24">
      <div className="m-frame">
        <SectionHead
          title={
            <>
              Pitch it, teach it, <span className="m-accent">report</span> it
            </>
          }
          sub="The same outline-first process works for any talk with a point to make. Each card opens a full sample deck."
        />
        <ul className="mt-14 grid gap-5 md:grid-cols-2">
          {USES.map((u) => (
            <li key={u.t}>
              <Link href={`/t/${u.id}`} className="m-card group grid h-full gap-5 p-5 transition-shadow hover:shadow-[0_12px_32px_-12px_rgba(16,17,20,0.18)] sm:grid-cols-[1fr_1.15fr] sm:items-center">
                <div>
                  <h3 className="text-[20px] font-medium tracking-[-0.015em]">{u.t}</h3>
                  <p className="m-small mt-2">{u.d}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-[var(--m-blue)]">
                    Open the sample <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">→</span>
                  </span>
                </div>
                <DeckThumb templateId={u.id} slides={[u.s]} auto className="rounded-[10px] border border-[var(--m-line)]" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ---------------- 9. Three steps ----------------
export function ThreeSteps() {
  const steps = [
    ["Add your material", "Write a prompt or paste notes. Choose the deck type, the audience and the language."],
    ["Fix the story", "Kinetic writes an outline. Reorder, merge or delete slides. Each point shows the paragraph it came from."],
    ["Present or keep editing", "Slides build one by one. Edit text on the canvas, ask for changes in plain words, then present."],
  ];
  return (
    <section className="m-ruled border-y border-[var(--m-line)] bg-white">
      <div className="m-frame grid gap-12 py-24 md:grid-cols-[0.9fr_1.1fr] md:px-10">
        <div className="md:sticky md:top-28 md:self-start">
          <h2 className="m-h2">
            From notes to presenting in <span className="m-accent">three steps</span>
          </h2>
          <p className="m-lead mt-5">Most decks are ready to present in a few minutes. You approve the story before any design happens.</p>
          <Link href="/new" className="m-pill m-pill-dark mt-8">Start a deck free</Link>
        </div>
        <ol>
          {steps.map(([t, d], i) => (
            <li key={t} className={`grid grid-cols-[88px_1fr] gap-6 py-8 ${i > 0 ? "border-t border-[var(--m-line)]" : ""}`}>
              <span className="tabular text-[64px] font-light leading-none tracking-[-0.05em] text-[#d5d8de]" aria-hidden="true">
                0{i + 1}
              </span>
              <div>
                <h3 className="text-[20px] font-medium tracking-[-0.015em]">
                  <span className="sr-only">Step {i + 1}: </span>
                  {t}
                </h3>
                <p className="m-small mt-2 max-w-[440px]">{d}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ---------------- 10. Platform ----------------
export function Platform() {
  const deck = templateDeck("medley-series-a")!;
  const slide = deck.slides[4];
  return (
    <section id="platform" className="scroll-mt-20 bg-white py-24">
      <div className="m-frame">
        <SectionHead
          title={
            <>
              Outline it, design it, <span className="m-accent">present</span> it
            </>
          }
        />
        <ul className="mt-6 flex flex-wrap justify-center gap-2 text-[13px]">
          {[
            ["20 layouts", "/templates"],
            ["6 themes", "#platform"],
            ["9 motion effects", "#platform"],
            ["Present mode", "#present"],
            ["Speaker notes", "#present"],
            ["Pricing", "/pricing"],
          ].map(([l, h]) => (
            <li key={l}>
              <Link href={h} className="inline-flex h-8 items-center rounded-full border border-[var(--m-line)] px-3 text-[#3b3e45] hover:border-[#c9ccd3]">
                {l}
              </Link>
            </li>
          ))}
        </ul>

        <div className="m-card mt-12 p-6 sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h3 className="text-[22px] font-medium tracking-[-0.02em]">One slide, six themes</h3>
              <p className="m-small mt-1">The same content in every theme. Each was tested for text contrast.</p>
            </div>
            <span className="m-small">Medley Series A, slide 5</span>
          </div>
          <ul className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
            {THEMES.map((t) => (
              <li key={t.id}>
                <div className="overflow-hidden rounded-[10px] border border-[var(--m-line)]">
                  <SlideView slide={slide} theme={t} intensity="standard" mode="static" label={`${t.name} theme`} />
                </div>
                <p className="mt-2 text-[13px]">
                  <span className="font-medium">{t.name}</span> <span className="text-[var(--m-gray)]">· {t.description}</span>
                </p>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="m-card p-6 sm:p-8">
            <h3 className="text-[20px] font-medium tracking-[-0.015em]">Motion that follows the story</h3>
            <p className="m-small mt-1 mb-6">Switch the intensity and the same slide replays calmer or bolder.</p>
            <MotionPlayer />
          </div>
          <div id="present" className="m-card scroll-mt-24 p-6 sm:p-8">
            <h3 className="text-[20px] font-medium tracking-[-0.015em]">Present from the browser</h3>
            <p className="m-small mt-1 mb-6">Full screen, with a clicker or the keyboard. Notes, a timer and the next slide sit beside the current one.</p>
            <div className="grid grid-cols-[1.4fr_1fr] gap-3 rounded-[12px] bg-[#0c0d10] p-3 text-white">
              <DeckThumb templateId="riverbank-impact" slideIndex={1} className="rounded-[6px]" />
              <div className="flex flex-col gap-2 text-[11px]">
                <div className="flex justify-between text-white/60">
                  <span>Slide 2 / 8</span>
                  <span className="tabular text-[14px] text-white">04:12</span>
                </div>
                <p className="leading-[1.45] text-white/85">Up from 1.2 million last year. Thank the volunteers by name.</p>
                <DeckThumb templateId="riverbank-impact" slideIndex={2} className="mt-auto rounded-[4px] opacity-80" label="Next slide" />
              </div>
            </div>
            <dl className="mt-5 grid grid-cols-3 gap-2 text-[12px]">
              {[
                ["→", "Next build"],
                ["N", "Notes"],
                ["B", "Black screen"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center gap-2">
                  <dt className="m-mono flex h-6 min-w-6 items-center justify-center rounded-[6px] border border-[var(--m-line)] px-1.5">{k}</dt>
                  <dd className="text-[var(--m-gray)]">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------- 11. Gallery (in place of testimonials) ----------------
function FeaturedPlayer({ id }: { id: string }) {
  const deck = templateDeck(id)!;
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);
  const [prevId, setPrevId] = useState(id);
  if (prevId !== id) {
    setPrevId(id);
    setI(0);
  }
  useEffect(() => {
    if (reduced) return;
    const t = setTimeout(() => setI((n) => (n + 1) % deck.slides.length), 3600);
    return () => clearTimeout(t);
  }, [i, reduced, deck.slides.length]);
  const idx = Math.min(i, deck.slides.length - 1);
  return <SlideView slide={deck.slides[idx]} theme={deckTheme(deck)} intensity={deck.motionIntensity} mode={reduced ? "static" : "play"} step={9} playKey={`${id}-${idx}`} label={`${deck.title}, slide ${idx + 1}`} />;
}

export function Gallery({ heading = true, initial = "all" }: { heading?: boolean; initial?: TemplateCategory | "all" }) {
  const [filter, setFilter] = useState<TemplateCategory | "all">(initial);
  const list = useMemo(() => TEMPLATES.filter((t) => filter === "all" || t.category === filter), [filter]);
  const [featured, ...rest] = list;
  return (
    <section id="gallery" className="scroll-mt-20 bg-white py-24">
      <div className="m-frame">
        {heading && (
          <SectionHead
            title={
              <>
                {TEMPLATES.length} decks you can open <span className="m-accent">right now</span>
              </>
            }
            sub="Every company, person and number in these samples is fictional. Open one, play it, then make it yours."
          />
        )}
        <div role="tablist" aria-label="Filter sample decks" className="mt-10 flex flex-wrap justify-center gap-2">
          {(["all", ...CATEGORIES] as const).map((c) => (
            <button key={c} type="button" role="tab" aria-selected={filter === c} onClick={() => setFilter(c)} className={`h-9 rounded-full px-4 text-[14px] transition-colors ${filter === c ? "bg-[var(--m-ink)] text-white" : "border border-[var(--m-line)] text-[#3b3e45] hover:border-[#c9ccd3]"}`}>
              {c === "all" ? `All ${TEMPLATES.length}` : CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
        {featured && (
          <ul className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            <li className="md:col-span-2 lg:row-span-2">
              <Link href={`/t/${featured.id}`} className="m-card group flex h-full flex-col overflow-hidden">
                <div className="border-b border-[var(--m-line)]">
                  <FeaturedPlayer id={featured.id} />
                </div>
                <div className="flex flex-1 flex-col justify-between gap-4 p-6">
                  <div>
                    <p className="m-eyebrow">{CATEGORY_LABEL[featured.category]} · {featured.slides.length} slides</p>
                    <h3 className="mt-2 text-[24px] font-medium tracking-[-0.02em]">{featured.name}</h3>
                    <p className="m-small mt-2 max-w-[520px]">{featured.summary}</p>
                  </div>
                  <span className="text-[14px] font-medium text-[var(--m-blue)]">Open and play <span aria-hidden="true">→</span></span>
                </div>
              </Link>
            </li>
            {rest.map((t) => (
              <li key={t.id}>
                <Link href={`/t/${t.id}`} className="m-card group flex h-full flex-col overflow-hidden transition-shadow hover:shadow-[0_12px_32px_-12px_rgba(16,17,20,0.18)]">
                  <DeckThumb templateId={t.id} auto className="border-b border-[var(--m-line)]" />
                  <div className="p-4">
                    <p className="text-[12px] text-[var(--m-gray)]">
                      {CATEGORY_LABEL[t.category]} · {t.slides.length} slides
                    </p>
                    <h3 className="mt-1 text-[16px] font-medium tracking-[-0.01em]">{t.name}</h3>
                    <p className="m-small mt-1 line-clamp-2">{t.summary}</p>
                  </div>
                </Link>
              </li>
            ))}
            {/* Fill the last row on the 3-column grid with a "make your own" card. */}
            {(() => {
              const gap = (3 - ((4 + rest.length) % 3)) % 3;
              if (!gap) return null;
              return (
                <li className={`hidden lg:block ${gap === 2 ? "lg:col-span-2" : ""}`}>
                  <Link href="/new" className="m-tex m-tex-blue flex h-full min-h-[220px] flex-col justify-between rounded-[14px] p-6">
                    <p className="m-eyebrow text-white/70">Your turn</p>
                    <div>
                      <h3 className="text-[24px] font-medium tracking-[-0.02em]">Make one from your own notes</h3>
                      <p className="mt-2 max-w-[420px] text-[14px] text-white/80">Paste a memo and approve the outline. The first three decks are free.</p>
                    </div>
                    <span className="text-[14px] font-medium">Start a deck →</span>
                  </Link>
                </li>
              );
            })()}
          </ul>
        )}
      </div>
    </section>
  );
}
