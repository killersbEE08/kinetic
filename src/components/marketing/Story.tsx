"use client";

// The one pinned section on the page (docs/06 §4 allows one): scroll turns a memo into an
// outline, then into a slide whose builds play as you keep scrolling. The slide is rendered by
// DeckIQ's own engine, so this section is a live demo, not a video.
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "motion/react";
import { SlideView } from "@/components/deck/SlideView";
import { templateDeck } from "@/lib/deck/templates";
import { useIsMobile } from "@/lib/client/useMedia";
import { deckTheme } from "@/lib/deck/themes";
import { stepCount } from "@/lib/deck/motion";
import { offlineOutline } from "@/lib/ai/offline";
import { SAMPLE_NOTES, SAMPLE_PROMPT } from "@/lib/deck/sample";

const STEPS = [
  { n: "01", title: "Paste what you have", body: "A memo, meeting notes or a rough outline. DeckIQ marks every fact it can use: numbers, names, claims." },
  { n: "02", title: "Fix the story first", body: "You get an outline, not slides. Reorder, merge or cut. Each point shows the paragraph it came from." },
  { n: "03", title: "Watch it build", body: "Approve the outline and the slides are laid out and animated. Numbers count up from the figures in your notes." },
];

/** Splits text so numbers can be highlighted. */
function marked(text: string) {
  return text.split(/(\$?[\d,.]+[k%M]?(?:\s(?:hours|million|shops|engineers))?)/g);
}

function Notes({ sweep }: { sweep: number }) {
  const paras = SAMPLE_NOTES.split(/\n\s*\n/).slice(0, 4);
  let k = 0;
  return (
    <div className="h-full overflow-hidden rounded-[14px] bg-white p-6 text-[14px] leading-[1.7] text-[#2a2d33] shadow-[0_30px_60px_-30px_rgba(16,17,20,0.45)] sm:p-8 sm:text-[15px]">
      <p className="m-mono mb-4 text-[11px] uppercase tracking-[0.1em] text-[var(--m-gray)]">memo.txt · 212 words</p>
      {paras.map((p, i) => (
        <p key={i} className="mb-3">
          {marked(p).map((part, j) => {
            if (j % 2 === 0) return part;
            const order = k++;
            const on = sweep * 9 > order;
            return (
              <mark key={j} className="relative rounded-[4px] bg-transparent px-0.5 text-inherit">
                <span className="absolute inset-0 -z-0 origin-left rounded-[4px] bg-[#d7e5ff] transition-transform duration-300" style={{ transform: `scaleX(${on ? 1 : 0})` }} aria-hidden="true" />
                <span className={`relative font-medium ${on ? "text-[#1847a8]" : ""}`}>{part}</span>
              </mark>
            );
          })}
        </p>
      ))}
    </div>
  );
}

function OutlineRows({ shown }: { shown: number }) {
  const outline = useMemo(() => offlineOutline({ prompt: SAMPLE_PROMPT, notes: SAMPLE_NOTES, deckType: "pitch", slideCount: "auto", audience: "Seed investors", language: "English" }), []);
  const rows = outline.slides.slice(0, 6);
  return (
    <div className="h-full overflow-hidden rounded-[14px] bg-white p-5 shadow-[0_30px_60px_-30px_rgba(16,17,20,0.45)] sm:p-7">
      <div className="mb-4 flex items-center justify-between">
        <p className="m-mono text-[11px] uppercase tracking-[0.1em] text-[var(--m-gray)]">Outline · {outline.slides.length} slides</p>
        <span className="rounded-full bg-[var(--m-soft)] px-2.5 py-1 text-[11px] text-[var(--m-gray)]">Drag to reorder</span>
      </div>
      <ol className="space-y-2">
        {rows.map((s, i) => (
          <motion.li
            key={i}
            animate={i < shown ? { opacity: 1, x: 0 } : { opacity: 0, x: 28 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="flex items-start gap-3 rounded-[10px] border border-[var(--m-line)] px-3 py-2.5"
          >
            <span className="m-mono mt-0.5 w-5 text-[11px] text-[var(--m-gray)]">{String(i + 1).padStart(2, "0")}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium">{s.title}</span>
              <span className="block truncate text-[12px] text-[var(--m-gray)]">{s.points[0]?.text ?? ""}</span>
            </span>
            {s.points[0]?.source && <span className="m-mono mt-0.5 rounded-[5px] bg-[#e8f0ff] px-1.5 text-[10px] text-[#1847a8]">{s.points[0].source}</span>}
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

export function StoryScroll() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const deck = templateDeck("ledgerly-seed")!;
  const slide = deck.slides[4];
  const theme = deckTheme(deck);
  const builds = stepCount(slide, deck.motionIntensity);
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [state, setState] = useState({ phase: 0, sweep: 0, rows: 0, step: -1 });

  useMotionValueEvent(p, "change", (v) => {
    const phase = v < 0.34 ? 0 : v < 0.67 ? 1 : 2;
    const sweep = Math.min(1, v / 0.28);
    const rows = Math.round(Math.max(0, Math.min(1, (v - 0.36) / 0.26)) * 6);
    const step = v < 0.7 ? -1 : Math.min(builds - 1, Math.floor(((v - 0.7) / 0.26) * builds));
    setState((s) => (s.phase === phase && s.sweep === sweep && s.rows === rows && s.step === step ? s : { phase, sweep, rows, step }));
  });

  // Layers cross-fade and scale between phases.
  const notesO = useTransform(p, [0.28, 0.36], [1, 0]);
  const notesS = useTransform(p, [0.28, 0.36], [1, 0.94]);
  const outO = useTransform(p, [0.32, 0.38, 0.62, 0.69], [0, 1, 1, 0]);
  const outY = useTransform(p, [0.32, 0.38, 0.62, 0.69], [40, 0, 0, -30]);
  const slideO = useTransform(p, [0.65, 0.71], [0, 1]);
  const slideS = useTransform(p, [0.65, 0.75], [0.9, 1]);
  const bar = useTransform(p, [0, 1], [0, 1]);
  // Phones: the pinned 320vh scroll scene stacks into a column taller than the screen and gets
  // cut off, and it traps scrolling. Show the simple stacked version instead.
  const mobile = useIsMobile();

  if (reduce || mobile) {
    return (
      <section id="overview" className="scroll-mt-20 bg-[var(--m-soft)] py-16 md:py-24">
        <div className="m-frame grid gap-10">
          {STEPS.map((s) => (
            <div key={s.n}>
              <p className="m-mono text-[13px] text-[var(--m-gray)]">{s.n}</p>
              <h3 className="m-h2 mt-1">{s.title}</h3>
              <p className="m-lead mt-2 max-w-[560px]">{s.body}</p>
            </div>
          ))}
          <div className="overflow-hidden rounded-[14px]"><SlideView slide={slide} theme={theme} intensity="calm" mode="static" label="Traction slide from the Ledgerly sample deck" /></div>
        </div>
      </section>
    );
  }

  return (
    <section ref={ref} id="overview" className="relative scroll-mt-20 bg-[var(--m-soft)]" style={{ height: "320vh" }} aria-label="How a memo becomes a deck">
      <div className="sticky top-0 flex h-dvh items-center overflow-hidden">
        <div className="m-frame grid w-full items-center gap-10 md:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="m-eyebrow mb-5">How it works</p>
            <div className="relative pl-6">
              <div className="absolute left-0 top-1 h-[calc(100%-8px)] w-px bg-[var(--m-line)]" aria-hidden="true">
                <motion.div className="h-full w-px origin-top bg-[var(--m-ink)]" style={{ scaleY: bar }} />
              </div>
              <ol className="space-y-7">
                {STEPS.map((s, i) => {
                  const on = state.phase === i;
                  return (
                    <li key={s.n} aria-current={on ? "step" : undefined}>
                      <motion.div animate={{ opacity: on ? 1 : 0.38 }} transition={{ duration: 0.35 }}>
                        <p className="m-mono text-[12px] text-[var(--m-gray)]">{s.n}</p>
                        <h3 className="mt-1 text-[clamp(22px,2.6vw,32px)] font-normal leading-[1.15] tracking-[-0.025em]">{s.title}</h3>
                        <motion.p className="m-small mt-2 max-w-[380px] overflow-hidden" animate={{ height: on ? "auto" : 0, opacity: on ? 1 : 0 }} transition={{ duration: 0.4, ease: [0.2, 0, 0, 1] }}>
                          {s.body}
                        </motion.p>
                      </motion.div>
                    </li>
                  );
                })}
              </ol>
            </div>
            <Link href="/new" className="m-pill m-pill-dark mt-10">Try it with your notes</Link>
          </div>

          <div className="relative aspect-[16/11] w-full">
            <motion.div className="absolute inset-0" style={{ opacity: notesO, scale: notesS }} aria-hidden={state.phase !== 0}>
              <Notes sweep={state.sweep} />
            </motion.div>
            <motion.div className="absolute inset-0" style={{ opacity: outO, y: outY }} aria-hidden={state.phase !== 1}>
              <OutlineRows shown={state.rows} />
            </motion.div>
            <motion.div className="absolute inset-0 flex items-center" style={{ opacity: slideO, scale: slideS }} aria-hidden={state.phase !== 2}>
              <div className="w-full overflow-hidden rounded-[14px] shadow-[0_40px_80px_-30px_rgba(16,17,20,0.5)]">
                <SlideView slide={slide} theme={theme} intensity={deck.motionIntensity} mode="play" step={Math.max(0, state.step)} playKey={state.step < 0 ? "wait" : "go"} label="Traction slide from the Ledgerly sample deck" />
              </div>
              <p className="absolute -bottom-9 left-0 text-[13px] text-[var(--m-gray)]">Every number on this slide is in the memo above. Keep scrolling to play the builds.</p>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
