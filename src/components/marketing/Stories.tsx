"use client";

import Link from "next/link";
import { useState } from "react";
import { TEMPLATES, getTemplate } from "@/lib/deck/templates";
import { DeckThumb } from "./Common";
import { Mark } from "./Nav";

// ---------------- 12. Dark section: sample stories + guides ----------------
const STORIES = [
  { id: "ledgerly-seed", tone: "m-tex-green", line: "A one-page founder memo became a 10-slide seed pitch. The traction slide counts up from the memo's own numbers." },
  { id: "corvid-hospital", tone: "m-tex-purple", line: "A sales proposal that opens with the buyer's three priorities, then answers each one with a step or a number." },
  { id: "photosynthesis", tone: "m-tex-lime", line: "A lesson that states its goals, explains one idea per slide, and ends with a question for the class." },
  { id: "riverbank-impact", tone: "m-tex-green", line: "A non-profit impact report: one big number, a year-by-year chart, and exactly where the money went." },
  { id: "relay-previews", tone: "m-tex-purple", line: "A developer launch with three setup steps and a before-and-after chart from the beta." },
  { id: "pantry-q3", tone: "m-tex-lime", line: "A quarterly review that gives the misses as much space as the wins, and ends with priorities." },
];

const GUIDES = [
  { title: "Structure a seed pitch in ten slides", body: "Problem, product, how it works, traction, market, model, team, ask. Put traction before market: investors look for it first.", id: "ledgerly-seed" },
  { title: "Write a proposal the buyer can forward", body: "Open with their words from the discovery call. Your champion will present it to people you never meet.", id: "bramble-retail" },
  { title: "A board update that takes ten minutes", body: "Four numbers, three wins, two risks and the decisions you need. Send it two days before the meeting.", id: "fernway-board" },
  { title: "Make one number the hero", body: "If a slide has one point, show one number, huge, with a label of eight words or fewer.", id: "kiln-seed" },
  { title: "Announce a feature without hype", body: "Say what changed, who asked for it, and how to turn it on. Real beta numbers do the persuading.", id: "orbit-offline" },
  { title: "Turn a lesson plan into slides", body: "One idea per slide, a worked example in the middle, and a question at the end to check understanding.", id: "compound-interest" },
];

function Dots({ count, at, onPick, label }: { count: number; at: number; onPick: (i: number) => void; label: string }) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      {Array.from({ length: count }).map((_, i) => (
        <button key={i} type="button" aria-label={`Page ${i + 1}`} aria-current={i === at} onClick={() => onPick(i)} className={`h-2 rounded-full transition-all ${i === at ? "w-6 bg-white" : "w-2 bg-white/30 hover:bg-white/60"}`} />
      ))}
    </div>
  );
}

function Arrows({ onPrev, onNext, label }: { onPrev: () => void; onNext: () => void; label: string }) {
  return (
    <div className="flex gap-2" role="group" aria-label={label}>
      {[
        ["Previous", onPrev, "M10 3 5 8l5 5"],
        ["Next", onNext, "M6 3l5 5-5 5"],
      ].map(([l, fn, d]) => (
        <button key={l as string} type="button" aria-label={l as string} onClick={fn as () => void} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-white/80 transition-colors hover:border-white/50 hover:text-white">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d={d as string} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ))}
    </div>
  );
}

export function Stories() {
  const [page, setPage] = useState(0);
  const [gpage, setGpage] = useState(0);
  const pages = Math.ceil(STORIES.length / 3);
  const gpages = Math.ceil(GUIDES.length / 3);
  return (
    <section className="m-tex m-tex-dark py-24" aria-labelledby="stories-h">
      <div className="m-frame">
        <div className="mx-auto max-w-[720px] text-center">
          <p className="m-eyebrow mb-4 text-white/50">Sample stories</p>
          <h2 id="stories-h" className="m-h2">How each sample deck was put together</h2>
          <p className="mt-4 text-[17px] leading-[1.6] text-white/60">Fictional companies, real structure. Each card explains the choices behind one deck.</p>
        </div>
        <ul className="m-fade mt-12 grid gap-5 md:grid-cols-3" key={page}>
          {STORIES.slice(page * 3, page * 3 + 3).map((s) => {
            const t = getTemplate(s.id)!;
            return (
              <li key={s.id}>
                <Link href={`/t/${s.id}`} className={`m-tex ${s.tone} flex h-full flex-col rounded-[16px] p-5 transition-transform hover:-translate-y-0.5`}>
                  <p className="text-[12px] font-medium uppercase tracking-[0.1em] opacity-70">{t.company}</p>
                  <p className="mt-3 text-[17px] leading-[1.45]">{s.line}</p>
                  <DeckThumb templateId={s.id} auto className="mt-6 rounded-[8px] shadow-[0_12px_30px_-12px_rgba(0,0,0,0.45)]" />
                  <span className="mt-4 text-[13px] font-medium">Open the deck →</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-8 flex justify-center">
          <Dots count={pages} at={page} onPick={setPage} label="Story pages" />
        </div>

        <div className="mt-24 flex flex-wrap items-end justify-between gap-6 border-t border-white/10 pt-16">
          <div>
            <p className="m-eyebrow mb-3 text-white/50">Guides</p>
            <h2 className="text-[clamp(28px,3.4vw,40px)] font-normal leading-[1.1] tracking-[-0.03em]">Short guides, each with an example deck</h2>
          </div>
          <Arrows label="Guide pages" onPrev={() => setGpage((p) => (p - 1 + gpages) % gpages)} onNext={() => setGpage((p) => (p + 1) % gpages)} />
        </div>
        <ul className="m-fade mt-10 grid gap-5 md:grid-cols-3" key={`g${gpage}`}>
          {GUIDES.slice(gpage * 3, gpage * 3 + 3).map((g) => (
            <li key={g.title}>
              <Link href={`/t/${g.id}`} className="m-tex m-tex-blue flex h-full min-h-[260px] flex-col rounded-[16px] p-6 transition-transform hover:-translate-y-0.5">
                <span className="m-mono text-[11px] uppercase tracking-[0.12em] text-white/70">Guide</span>
                <h3 className="mt-4 text-[22px] font-medium leading-[1.2] tracking-[-0.02em]">{g.title}</h3>
                <p className="mt-3 text-[14px] leading-[1.55] text-white/80">{g.body}</p>
                <span className="mt-auto pt-6 text-[13px] font-medium">See the example deck →</span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-8 flex justify-center">
          <Dots count={gpages} at={gpage} onPick={setGpage} label="Guide pages" />
        </div>
      </div>
    </section>
  );
}

// ---------------- 13. FAQ ----------------
const FAQ: [string, string][] = [
  ["Does Kinetic make up numbers?", "No. Every number on a slide is checked against what you pasted. Anything that isn't in your material gets a dashed outline and a Suggested label until you change or accept it."],
  ["Do you train AI on my notes?", "Kinetic doesn't train any models. With a Gemini key, your text is sent to Google's Gemini API only to write your deck."],
  ["What can I give it?", "A prompt, pasted notes (up to about 50,000 words), or files: PDF, Word, PowerPoint, Excel, CSV and text. Photos inside your files are kept and placed on slides."],
  ["Can I edit slides by hand?", "Yes. Click a box to select it and click again to type. Add text, photos, shapes, icons, tables and charts; move, resize, rotate, align and group them; change fonts and colours; undo anything."],
  ["Are the sample decks real companies?", "No. Every company, person and number in the samples is fictional. Use them to see the structure, then make them yours."],
  ["Can I export to PowerPoint or video?", "PowerPoint and PDF, yes. The PowerPoint file keeps text, shapes, tables and charts editable, with animations and transitions. Video export is planned."],
  ["How do AI credits work?", "Generating a deck uses one credit per slide plus two for the outline. Each AI edit uses one. Credits reset monthly."],
  ["Can I cancel?", "Yes, at any time from the billing portal. You keep your plan until the end of the period you paid for."],
];

function FaqRow({ q, a, id }: { q: string; a: string; id: string }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-[12px] border border-[var(--m-line)] bg-white">
      <h3>
        <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-medium">
          {q}
          <span className="m-plus text-[var(--m-gray)]" aria-hidden="true" />
        </button>
      </h3>
      <div id={id} className="m-acc-body" data-open={open} role="region" aria-hidden={!open}>
        <div>
          <p className="m-small px-5 pb-5">{a}</p>
        </div>
      </div>
    </li>
  );
}

export function Faq() {
  const half = Math.ceil(FAQ.length / 2);
  return (
    <section className="m-ruled border-b border-[var(--m-line)] bg-white">
      <div className="m-frame py-24 md:px-10">
        <div className="max-w-[560px]">
          <h2 className="m-h2">Questions</h2>
          <p className="m-lead mt-4">Short answers. If yours isn&rsquo;t here, the pricing page covers plans and credits.</p>
        </div>
        <div className="mt-12 grid gap-3 md:grid-cols-2">
          {[FAQ.slice(0, half), FAQ.slice(half)].map((col, c) => (
            <ul key={c} className="space-y-3">
              {col.map(([q, a], i) => (
                <FaqRow key={q} q={q} a={a} id={`faq-${c}-${i}`} />
              ))}
            </ul>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------- 14. Closing CTA ----------------
export function ClosingCta() {
  return (
    <section className="bg-white px-4 py-16 sm:px-6">
      <div className="m-tex m-tex-blue mx-auto max-w-[1180px] rounded-[24px] px-6 py-20 text-center">
        <h2 className="m-h2 text-white">Bring your notes. Leave with a deck.</h2>
        <p className="mx-auto mt-4 max-w-[520px] text-[17px] leading-[1.6] text-white/80">Free for 3 decks. No card needed. Open a sample first if you&rsquo;d like to see the finished thing.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a href="/new" className="m-pill bg-white text-[var(--m-ink)] hover:bg-white/90">Start a deck free</a>
          <a href="/templates" className="m-pill border border-white/40 text-white hover:border-white">Browse sample decks</a>
        </div>
      </div>
    </section>
  );
}

// ---------------- 15. Footer ----------------
export function Footer() {
  const groups: [string, [string, string][]][] = [
    ["Product", [["How it works", "/#overview"], ["Editing", "/#edit"], ["Quality checks", "/#checks"], ["Pricing", "/pricing"]]],
    ["Templates", [["Fundraising", "/templates?type=pitch"], ["Product launch", "/templates?type=launch"], ["Sales proposal", "/templates?type=sales"], ["Lesson", "/templates?type=lesson"], ["Report", "/templates?type=report"]]],
    ["Account", [["Start a deck", "/new"], ["Dashboard", "/dashboard"], ["Your decks", "/decks"], ["Sign in", "/sign-in"], ["Plans and billing", "/pricing"]]],
  ];
  return (
    <footer className="overflow-hidden bg-[var(--m-dark)] text-white">
      <div className="m-frame grid gap-12 pb-12 pt-20 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <span className="flex items-center gap-2 text-[18px] font-medium">
            <span className="text-white">
              <Mark />
            </span>
            Kinetic
          </span>
          <p className="mt-4 max-w-[300px] text-[14px] leading-[1.6] text-white/55">Turns your notes into an animated deck you can edit and present. Every number on a slide comes from your material.</p>
          <p className="mt-6 text-[12px] text-white/60">{TEMPLATES.length} sample decks · 20 layouts · 6 themes</p>
        </div>
        {groups.map(([g, links]) => (
          <nav key={g} aria-label={g}>
            <h2 className="text-[13px] font-medium text-white/60">{g}</h2>
            <ul className="mt-4 space-y-2.5 text-[14px]">
              {links.map(([l, h]) => (
                <li key={l}>
                  <a href={h} className="text-white/75 hover:text-white">{l}</a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="m-frame flex flex-wrap justify-between gap-4 border-t border-white/10 py-6 text-[12px] text-white/60">
        <p>© {new Date().getFullYear()} Kinetic. Sample decks use fictional companies, people and numbers.</p>
        <p><a href="/report" className="hover:text-white">Report a shared deck</a> · Built on Cloudflare Workers, Supabase and Gemini.</p>
      </div>
      <div className="m-frame -mb-[0.2em] pt-4" aria-hidden="true">
        <p className="m-wordmark">Kinetic</p>
      </div>
    </footer>
  );
}
