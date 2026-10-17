"use client";

// Review tab: one list of what to check before presenting, with one-click fixes, plus an AI pass
// over the whole deck whose changes are accepted or kept slide by slide (docs: "deck review panel").
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import type { Deck } from "@/lib/deck/schema";
import type { PatchOp } from "@/lib/deck/patch";
import type { Theme } from "@/lib/deck/themes";
import { altOps, fixAllOps, opsForChanges, perSlideChanges, reviewDeck, RULE_ORDER, RULES, summarize, type ReviewItem, type ReviewRule, type SlideChange } from "@/lib/deck/review";
import { applyDeckPatch } from "@/lib/deck/patch";
import { ApiError, useBackend } from "@/lib/client/backend";
import { CreditCost, useMe } from "@/lib/client/me";
import { CREDIT_COST } from "@/lib/billing/credits";
import { track } from "@/lib/client/track";
import { UpgradeNote } from "@/components/ui/chrome";
import type { Proposal } from "./AskPanel";

type Commit = (ops: PatchOp[], opts: { label: string }) => boolean;

interface Pass {
  proposalId: number;
  instruction: string;
  summary: string;
  engine: string;
  changes: SlideChange[];
  extra: number;
  chosen: Set<string>;
}

const OFFLINE_PASSES = ["Shorten every title", "Less text on every slide"];
const AI_PASSES = ["Make the wording more direct", "Use the same tense and tone on every slide"];
/** Proposal ids for deck passes, far from the Ask panel's (which count up from 1). */
let passSeq = 1_000_000;

function AltInput({ onSave, disabled }: { onSave: (alt: string) => void; disabled: boolean }) {
  const [v, setV] = useState("");
  return (
    <form
      className="mt-1.5 flex gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim()) onSave(v);
      }}
    >
      <input className="field h-8 flex-1 py-0 text-[12px]" placeholder="Describe the photo in a few words" value={v} maxLength={250} onChange={(e) => setV(e.target.value)} disabled={disabled} aria-label="Describe the photo" />
      <button type="submit" className="btn btn-secondary btn-sm min-h-8 px-2.5 text-[12px]" disabled={disabled || !v.trim()}>Save</button>
    </form>
  );
}

export function ReviewPanel({
  deck,
  theme,
  deckKey,
  locked,
  proposal,
  commit,
  onGo,
  onPropose,
  onAccept,
  onDiscard,
}: {
  deck: Deck;
  theme: Theme;
  deckKey: string;
  /** True while a suggestion is shown: fixes wait until it is accepted or discarded. */
  locked: boolean;
  proposal: Proposal | null;
  commit: Commit;
  onGo: (slideIndex: number, elementId?: string) => void;
  onPropose: (p: Proposal) => void;
  onAccept: () => void;
  onDiscard: () => void;
}) {
  const backend = useBackend();
  const { me } = useMe();
  const ai = backend.mode === "cloud" && !!me?.features.gemini;
  const items = useMemo(() => reviewDeck(deck, theme), [deck, theme]);
  const [open, setOpen] = useState<Partial<Record<ReviewRule, boolean>>>({});
  const [tipsOpen, setTipsOpen] = useState(false);
  const [pass, setPass] = useState<Pass | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; upgrade: boolean } | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    track("review_opened", { deckId: deck.id, props: { items: items.length } });
    // Once per panel open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow the proposal this panel made: accepted or discarded from the banner, Esc or Ctrl Enter.
  const status = proposal && pass && proposal.id === pass.proposalId ? proposal.status : null;
  useEffect(() => {
    if (!pass || !status || status === "pending") return;
    if (status === "accepted") {
      track("deck_pass_applied", { deckId: deck.id, props: { slides: pass.chosen.size, offered: pass.changes.length } });
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to the editor accepting the proposal
      setDone(`Applied changes to ${pass.chosen.size} slide${pass.chosen.size === 1 ? "" : "s"}. Undo (Ctrl Z) reverts them all.`);
      setPass(null);
    } else if (pass.chosen.size > 0) setPass(null); // discarded elsewhere (Esc or the banner)
  }, [status, pass, deck.id]);

  const propose = (p: Pass) => {
    const ops = opsForChanges(p.changes, p.chosen);
    if (!ops.length) {
      if (proposal?.status === "pending" && proposal.id === p.proposalId) onDiscard();
      return;
    }
    onPropose({ id: p.proposalId, scopeLabel: "Whole deck", instruction: p.instruction, summary: p.summary, ops, issues: [], changedSlideIds: [...p.chosen], engine: p.engine, baseVersionKey: deckKey, status: "pending" });
  };

  async function runPass(instruction: string) {
    const ins = instruction.trim();
    if (ins.length < 2 || busy) return;
    if (proposal?.status === "pending") onDiscard();
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const r = await backend.edit(deck, { kind: "deck" }, ins);
      const replaced = r.ops.find((o) => o.op === "replace" && o.path === "/slides");
      const proposed = replaced && "value" in replaced ? (replaced.value as Deck["slides"]) : applyDeckPatch(deck, r.ops).doc.slides;
      const { changes, extra } = perSlideChanges(deck, proposed);
      if (!changes.length) {
        setError({ text: "That didn't change any slide. Try a more specific request.", upgrade: false });
        return;
      }
      const p: Pass = { proposalId: ++passSeq, instruction: ins, summary: r.summary, engine: r.engine, changes, extra, chosen: new Set(changes.map((c) => c.slideId)) };
      setPass(p);
      propose(p);
      setText("");
    } catch (e) {
      setError({ text: e instanceof ApiError ? e.message : "The review pass failed. Try again.", upgrade: e instanceof ApiError && e.status === 402 });
    } finally {
      setBusy(false);
    }
  }

  const toggle = (slideId: string) => {
    if (!pass) return;
    const chosen = new Set(pass.chosen);
    if (chosen.has(slideId)) chosen.delete(slideId);
    else chosen.add(slideId);
    const next = { ...pass, chosen };
    setPass(next);
    propose(next);
  };

  const applyFix = (ops: PatchOp[], label: string, rule: ReviewRule, count = 1) => {
    if (commit(ops, { label: `Review: ${label}` })) track("review_fix_applied", { deckId: deck.id, props: { rule, count } });
  };

  const main = items.filter((i) => RULES[i.rule].severity !== "tip");
  const tips = items.filter((i) => RULES[i.rule].severity === "tip");
  const headline = summarize(items);

  const group = (rule: ReviewRule, list: ReviewItem[]) => {
    const r = RULES[rule];
    const fixable = list.filter((i) => i.fix);
    const isOpen = open[rule] ?? list.length <= 4;
    return (
      <section key={rule} className="rounded-[10px] border border-line" aria-labelledby={`rv-${rule}`}>
        <button type="button" id={`rv-${rule}`} className="flex w-full items-center gap-2 px-3 py-2.5 text-left" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [rule]: !isOpen }))}>
          {isOpen ? <ChevronDown size={14} aria-hidden="true" className="text-ink-2" /> : <ChevronRight size={14} aria-hidden="true" className="text-ink-2" />}
          <span className="min-w-0 flex-1 text-[13px] font-semibold">{r.title}</span>
          <span className="tabular rounded-full bg-[color-mix(in_srgb,var(--ink)_7%,transparent)] px-2 text-[12px]">{list.length}</span>
        </button>
        {isOpen && (
          <div className="border-t border-line px-3 pb-3 pt-2">
            <p className="text-[12px] leading-[17px] text-ink-2">{r.help}</p>
            {fixable.length >= 2 && (
              <button type="button" className="btn btn-secondary btn-sm mt-2 min-h-7 px-2.5 text-[12px]" disabled={locked} onClick={() => applyFix(fixAllOps(fixable), `${fixable[0].fix!.label} (${fixable.length})`, rule, fixable.length)}>
                {fixable[0].fix!.label}: all {fixable.length}
              </button>
            )}
            <ul className="mt-2 space-y-1.5">
              {list.map((it) => (
                <li key={it.key} className="rounded-[8px] bg-[color-mix(in_srgb,var(--ink)_3%,transparent)] px-2.5 py-2 text-[12px]">
                  <div className="flex items-start gap-2">
                    <button type="button" className="min-w-0 flex-1 text-left hover:underline" onClick={() => onGo(it.slideIndex, it.elementId)} title="Go to this slide">
                      <span className="tabular font-medium">Slide {it.slideIndex + 1}</span>
                      <span className="text-ink-2"> · {it.message}</span>
                    </button>
                    {it.fix && (
                      <button type="button" className="flex-none font-medium text-accent hover:underline disabled:opacity-40" disabled={locked} onClick={() => applyFix(it.fix!.ops, it.fix!.label, rule)}>
                        {it.fix.label}
                      </button>
                    )}
                  </div>
                  {rule === "alt" && <AltInput disabled={locked} onSave={(alt) => applyFix(altOps(deck, it, alt), "Add alt text", rule)} />}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    );
  };

  const byRule = (list: ReviewItem[]) => RULE_ORDER.map((r) => [r, list.filter((i) => i.rule === r)] as const).filter(([, l]) => l.length);

  return (
    <div className="space-y-5 pb-4">
      <section aria-labelledby="rv-pass-h">
        <h3 id="rv-pass-h" className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold"><Sparkles size={14} aria-hidden="true" />Change the whole deck</h3>
        {pass ? (
          <div className="rounded-[10px] border border-dashed border-accent p-3 text-[13px]">
            <p className="font-medium">{pass.summary}</p>
            <p className="mt-0.5 text-[12px] text-ink-2">
              {pass.changes.length} slide{pass.changes.length === 1 ? "" : "s"} changed. Untick the ones to keep as they are.{pass.extra ? ` ${pass.extra} new slide${pass.extra === 1 ? " was" : "s were"} suggested and left out.` : ""}
            </p>
            <ul className="mt-2 max-h-[280px] space-y-1 overflow-y-auto">
              {pass.changes.map((c) => (
                <li key={c.slideId} className="flex items-start gap-2 rounded-[8px] px-1 py-1 hover:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 flex-none" checked={pass.chosen.has(c.slideId)} onChange={() => toggle(c.slideId)} aria-label={`Apply the change to slide ${c.index + 1}`} />
                  <button type="button" className="min-w-0 flex-1 text-left text-[12px]" onClick={() => onGo(c.index)}>
                    <span className="tabular font-medium">Slide {c.index + 1}</span>
                    {c.titleBefore !== c.titleAfter ? (
                      <>
                        <span className="block truncate text-ink-2 line-through">{c.titleBefore}</span>
                        <span className="block truncate">{c.titleAfter}</span>
                      </>
                    ) : (
                      <span className="block truncate text-ink-2">{c.titleAfter || "Text and layout changes"}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <button type="button" className="btn btn-primary btn-sm" onClick={onAccept} disabled={!pass.chosen.size || proposal?.id !== pass.proposalId || proposal.status !== "pending"}>
                Apply {pass.chosen.size} slide{pass.chosen.size === 1 ? "" : "s"}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setPass(null);
                  onDiscard();
                }}
              >
                Keep all as they are
              </button>
            </div>
            {pass.engine === "offline" && <p className="mt-2 text-[12px] text-ink-2">Made by the offline engine.</p>}
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runPass(text);
            }}
          >
            <div className="mb-2 flex flex-wrap gap-1">
              {[...OFFLINE_PASSES, ...(ai ? AI_PASSES : [])].map((q) => (
                <button key={q} type="button" className="rounded-[6px] border border-line px-2 py-1 text-[12px] hover:border-ink-2" onClick={() => runPass(q)} disabled={busy}>
                  {q}
                </button>
              ))}
            </div>
            {ai && (
              <>
                <label className="sr-only" htmlFor="rv-pass">Describe a change for every slide</label>
                <textarea id="rv-pass" className="field min-h-[56px] resize-none text-[13px]" placeholder="For example: use our product name, Ledgerly, instead of 'the app'" value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} />
                <button type="submit" className="btn btn-secondary btn-sm mt-1.5 w-full" disabled={busy || text.trim().length < 2}>{busy ? "Working" : "Propose changes"}</button>
                <CreditCost credits={CREDIT_COST.edit} className="mt-1 block text-center" />
              </>
            )}
            {busy && !ai && <p className="text-[12px] text-ink-2" role="status">Working on every slide</p>}
            <p className="mt-1.5 text-[12px] text-ink-2">You review the result slide by slide before anything changes.</p>
          </form>
        )}
        {error && <div className="mt-2">{error.upgrade ? <UpgradeNote message={error.text} /> : <p role="alert" className="text-[12px] text-danger">{error.text}</p>}</div>}
        {done && <p role="status" className="mt-2 text-[12px] text-success">{done}</p>}
      </section>

      <section aria-labelledby="rv-checks-h" aria-live="polite">
        <h3 id="rv-checks-h" className="mb-1.5 text-[13px] font-semibold">Checks</h3>
        {main.length === 0 ? (
          <p className="flex items-center gap-2 rounded-[10px] border border-line px-3 py-2.5 text-[13px]">
            <CheckCircle2 size={16} className="text-success" aria-hidden="true" />
            Nothing to fix. Ready to present.
          </p>
        ) : (
          <>
            <p className="mb-2 text-[12px] leading-[17px] text-ink-2">{headline}.</p>
            {locked && <p className="mb-2 text-[12px] text-warning">Accept or discard the suggestion first, then fix these.</p>}
            <div className="space-y-2">{byRule(main).map(([r, l]) => group(r, l))}</div>
          </>
        )}
        {tips.length > 0 && (
          <div className="mt-3">
            <button type="button" className="flex items-center gap-1 text-[12px] font-medium text-ink-2 hover:text-ink" aria-expanded={tipsOpen} onClick={() => setTipsOpen((o) => !o)}>
              {tipsOpen ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />}
              Polish ({summarize(tips, ["tip"])})
            </button>
            {tipsOpen && <div className="mt-2 space-y-2">{byRule(tips).map(([r, l]) => group(r, l))}</div>}
          </div>
        )}
        <p className="mt-3 text-[11px] text-ink-2">Hidden slides aren&rsquo;t checked.</p>
      </section>
    </div>
  );
}
