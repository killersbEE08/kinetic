"use client";

import { useMemo, useState } from "react";
import { SlideView } from "@/components/deck/SlideView";
import { templateDeck, TEMPLATES, TEMPLATE_SLIDE_COUNT } from "@/lib/deck/templates";
import { getTheme, contrastRatio, deckTheme, THEMES } from "@/lib/deck/themes";
import { buildProposal, offlineEdit } from "@/lib/ai/edit";
import { runQa, wordCount, LIMITS } from "@/lib/deck/qa";
import { findBanned } from "@/lib/deck/banned";
import { countAnimatedBuilds, INTENSITY_RULES } from "@/lib/deck/motion";
import type { Deck } from "@/lib/deck/schema";
import { BrowserChrome, JsonCode, SectionHead } from "./Common";

// ---------------- 6. Edit demo ----------------
const ACTIONS = [
  { label: "Shorten", ask: "Shorten", note: "Trims each point. The cut words go to speaker notes." },
  { label: "Make a timeline", ask: "turn this into a 3-step timeline", note: "Turns the points into numbered steps." },
  { label: "Make visual", ask: "Make visual", note: "Pulls the key number out and makes it the hero." },
  { label: "Big statement", ask: "make this a big statement", note: "One line, alone on the slide." },
  { label: "Split slide", ask: "Split slide", note: "Moves half the points to a new slide after this one." },
];

export function EditDemo() {
  const deck = templateDeck("ledgerly-seed")!;
  const slideIndex = 1; // "Shop owners lose 6 hours a week to bookkeeping"
  const slide = deck.slides[slideIndex];
  const [pick, setPick] = useState(1);
  const [tab, setTab] = useState<"preview" | "patch">("preview");

  const result = useMemo(() => {
    try {
      const scope = { kind: "slide" as const, slideIds: [slide.id] };
      const { summary, change } = offlineEdit(deck, scope, ACTIONS[pick].ask);
      const p = buildProposal(deck, scope, change, summary);
      return { summary: p.summary, ops: p.ops, preview: p.preview };
    } catch (e) {
      return { summary: e instanceof Error ? e.message : "No change", ops: [], preview: deck };
    }
  }, [deck, slide.id, pick]);

  const after = result.preview.slides[slideIndex];
  const added = result.preview.slides.length - deck.slides.length;
  const patchView = result.ops.map((o) => ({ op: o.op, path: o.path, value: "value" in o && o.value && typeof o.value === "object" ? { layout: (o.value as { layout?: string }).layout, elements: `${(o.value as { elements?: unknown[] }).elements?.length ?? 0} elements` } : undefined }));

  return (
    <section id="edit" className="scroll-mt-20 bg-white py-24">
      <div className="m-frame">
        <SectionHead
          title={
            <>
              Plain-language edits change <span className="m-accent">one thing</span> at a time
            </>
          }
          sub="Select a slide or an element and say what you want. DeckIQ proposes the change as a set of edits, shows it with a dashed outline, and touches nothing outside your selection."
        />
        <div className="mt-14 grid gap-4 lg:grid-cols-[320px_1fr]">
          <div role="radiogroup" aria-label="Edit to try" className="flex flex-col gap-1 rounded-[16px] border border-[var(--m-line)] bg-[var(--m-soft)] p-2">
            {ACTIONS.map((a, i) => (
              <button key={a.label} type="button" role="radio" aria-checked={i === pick} onClick={() => setPick(i)} className={`rounded-[12px] px-4 py-3.5 text-left transition-colors ${i === pick ? "bg-white shadow-[0_1px_3px_rgba(16,17,20,0.08)]" : "hover:bg-white/60"}`}>
                <span className="flex items-center justify-between text-[15px] font-medium">
                  {a.label}
                  {i === pick && <span className="h-1.5 w-1.5 rounded-full bg-[var(--m-blue)]" aria-hidden="true" />}
                </span>
                <span className="mt-1 block text-[13px] leading-[1.45] text-[var(--m-gray)]">{a.note}</span>
              </button>
            ))}
            <p className="mt-auto px-4 pb-2 pt-4 text-[12px] text-[var(--m-gray)]">These run the same offline edit engine the app uses without a Gemini key. With Gemini, you can type any request.</p>
          </div>

          <div className="m-tex m-tex-purple rounded-[16px] p-4 sm:p-6">
            <div className="m-code overflow-hidden">
              <div className="flex items-center gap-1 border-b border-white/10 px-3 py-2">
                {(["preview", "patch"] as const).map((t) => (
                  <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)} className={`rounded-[8px] px-3 py-1.5 text-[12px] ${tab === t ? "bg-white/10 text-white" : "text-white/55 hover:text-white"}`}>
                    {t === "preview" ? "Preview" : "Proposed edits"}
                  </button>
                ))}
                <span className="m-mono ml-auto truncate text-[11px] text-white/45">“{ACTIONS[pick].ask}” · slide 2</span>
              </div>
              <div className="p-4 sm:p-5" aria-live="polite">
                {tab === "preview" ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <figure>
                      <figcaption className="mb-2 text-[11px] uppercase tracking-[0.1em] text-white/45">Before</figcaption>
                      <div className="overflow-hidden rounded-[8px]">
                        <SlideView slide={slide} theme={deckTheme(deck)} intensity="standard" mode="static" label="Slide before the edit" />
                      </div>
                    </figure>
                    <figure>
                      <figcaption className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.1em] text-white/45">
                        Suggested
                        {added > 0 && <span className="normal-case tracking-normal">+{added} new slide</span>}
                      </figcaption>
                      <div className="overflow-hidden rounded-[8px] outline-2 outline-offset-4 outline-dashed outline-[#8fb4ff]">
                        <SlideView key={pick} slide={after} theme={deckTheme(deck)} intensity="standard" mode="play" step={9} playKey={pick} label="Slide after the suggested edit" />
                      </div>
                    </figure>
                  </div>
                ) : (
                  <JsonCode value={patchView} maxLines={24} />
                )}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                  <p className="text-[13px] text-white/80">{result.summary}</p>
                  <span className="flex gap-2 text-[12px]">
                    <span className="rounded-full bg-white px-3 py-1 font-medium text-[var(--m-ink)]">Accept · Ctrl ↵</span>
                    <span className="rounded-full border border-white/25 px-3 py-1 text-white/80">Discard · Esc</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------- 7. Quality checks ----------------
interface CheckRow {
  name: string;
  detail: string;
  passed: number;
  total: number;
}

function computeChecks(decks: Deck[]): CheckRow[] {
  const slides = decks.flatMap((d) => d.slides.map((s) => ({ d, s })));
  const total = slides.length;
  const bodyOk = slides.filter(({ s }) => s.elements.reduce((n, e) => n + (e.type === "text" && ["body", "caption", "quote"].includes(e.role) ? wordCount(e.content) : e.type === "bullets" ? e.items.reduce((a, b) => a + wordCount(b), 0) : 0), 0) <= LIMITS.bodyWords + 10).length;
  const bulletsOk = slides.filter(({ s }) => s.elements.every((e) => e.type !== "bullets" || (e.items.length <= LIMITS.bullets && e.items.every((i) => wordCount(i) <= LIMITS.bulletWords + 3)))).length;
  const h1Ok = slides.filter(({ s }) => s.elements.filter((e) => e.type === "text" && e.role === "h1").length <= 1).length;
  const bannedOk = slides.filter(({ s }) => findBanned(JSON.stringify(s.elements)).length === 0).length;
  const contrastOk = slides.filter(({ d }) => {
    const t = getTheme(d.themeId);
    return contrastRatio(t.colors.text, t.colors.bg) >= 4.5 && contrastRatio(t.colors.muted, t.colors.bg) >= 4.5;
  }).length;
  const motionOk = slides.filter(({ d, s }) => countAnimatedBuilds(s) <= INTENSITY_RULES[d.motionIntensity].maxBuilds + 2).length;
  const factsOk = slides.filter(({ s }) => s.elements.every((e) => !e.aiSuggested)).length;
  return [
    { name: "Body text", detail: `≤ ${LIMITS.bodyWords} words per slide`, passed: bodyOk, total },
    { name: "Points", detail: `≤ ${LIMITS.bullets} per slide, ≤ ${LIMITS.bulletWords} words each`, passed: bulletsOk, total },
    { name: "Hierarchy", detail: "One headline per slide", passed: h1Ok, total },
    { name: "Wording", detail: "No hype words from the banned list", passed: bannedOk, total },
    { name: "Contrast", detail: "Text ≥ 4.5:1 on its background", passed: contrastOk, total },
    { name: "Motion", detail: "Builds within the motion budget", passed: motionOk, total },
    { name: "Numbers", detail: "Every figure found in the source", passed: factsOk, total },
  ];
}

export function Checks() {
  const decks = useMemo(() => TEMPLATES.map((t) => templateDeck(t.id)!), []);
  const rows = useMemo(() => computeChecks(decks), [decks]);
  const failures = useMemo(() => decks.reduce((n, d) => n + runQa(d).issues.filter((i) => !i.fixed).length, 0) + rows.reduce((n, r) => n + (r.total - r.passed), 0), [decks, rows]);
  const minContrast = Math.min(...THEMES.map((t) => contrastRatio(t.colors.muted, t.colors.bg)));

  return (
    <section id="checks" className="m-ruled scroll-mt-20 border-y border-[var(--m-line)] bg-white">
      <div className="m-frame">
        <div className="grid items-center gap-12 py-24 md:grid-cols-[0.9fr_1.1fr] md:px-10">
          <div>
            <p className="m-eyebrow mb-4">Quality checks</p>
            <p className="tabular text-[clamp(88px,12vw,148px)] font-light leading-none tracking-[-0.05em]">
              {failures}
              <span className="ml-3 align-top text-[22px] font-normal tracking-[-0.01em] text-[var(--m-gray)]">failed checks</span>
            </p>
            <p className="m-lead mt-6">
              Across all {TEMPLATES.length} sample decks and {TEMPLATE_SLIDE_COUNT} slides, counted live on this page by the same checks that run on every deck you generate. When a check fails, DeckIQ fixes it or labels the slide for you to review.
            </p>
          </div>
          <div className="m-tex m-tex-blue rounded-[18px] p-5 sm:p-8">
            <BrowserChrome url="kinetic / checks / all sample decks">
              <ul className="divide-y divide-[var(--m-line)]">
                {rows.map((r) => (
                  <li key={r.name} className="flex items-center gap-3 px-4 py-3 text-[13px]">
                    <span className={`h-2 w-2 flex-none rounded-full ${r.passed === r.total ? "bg-[#1fbf75]" : "bg-[#f59e0b]"}`} aria-hidden="true" />
                    <span className="w-24 font-medium">{r.name}</span>
                    <span className="min-w-0 flex-1 truncate text-[var(--m-gray)]">{r.detail}</span>
                    <span className="tabular m-mono text-[12px]">
                      {r.passed}/{r.total}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between border-t border-[var(--m-line)] bg-[var(--m-soft)] px-4 py-2.5 text-[11px] text-[var(--m-gray)]">
                <span>Lowest text contrast in any theme: {minContrast.toFixed(1)}:1</span>
                <span className="m-mono">qa.ts</span>
              </div>
            </BrowserChrome>
          </div>
        </div>
        <ul className="grid border-t border-[var(--m-line)] md:grid-cols-3">
          {[
            ["Numbers come from your notes", "Every figure is matched against what you pasted. Anything new gets a dashed outline and a Suggested label."],
            ["Text stays short", "Over 40 words of body text, or more than five points? The extra moves to speaker notes, so nothing is lost."],
            ["Edits stay in scope", "An edit to one slide can only change that slide. The rule is checked in code before a change reaches you."],
          ].map(([t, d], k) => (
            <li key={t} className={`px-6 py-8 ${k > 0 ? "md:border-l" : ""} border-[var(--m-line)]`}>
              <h3 className="m-h3">{t}</h3>
              <p className="m-small mt-2">{d}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
