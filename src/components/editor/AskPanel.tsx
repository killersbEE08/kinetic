"use client";

import { useRef, useState } from "react";
import type { Deck, Element } from "@/lib/deck/schema";
import type { EditScope, PatchOp } from "@/lib/deck/patch";
import type { QaIssue } from "@/lib/deck/qa";
import { QUICK_ACTIONS } from "@/lib/ai/edit";
import { ApiError, useBackend } from "@/lib/client/backend";
import { UpgradeNote } from "@/components/ui/chrome";
import { elementLabel } from "./Panels";

export interface Proposal {
  id: number;
  scopeLabel: string;
  instruction: string;
  summary: string;
  ops: PatchOp[];
  issues: QaIssue[];
  changedSlideIds: string[];
  engine: string;
  baseVersionKey: string;
  status: "pending" | "accepted" | "discarded" | "stale";
}

type ScopeKind = EditScope["kind"];

/**
 * AI edit panel (docs/02 §4.4). The AI only proposes; the editor shows the proposal with a
 * dashed outline. Accept commits it as one undo step; Discard (or Esc) drops it.
 */
export function AskPanel({
  deck,
  slideIndex,
  selected,
  deckKey,
  proposal,
  onPropose,
  onAccept,
  onDiscard,
}: {
  deck: Deck;
  slideIndex: number;
  selected: Element | null;
  deckKey: string;
  proposal: Proposal | null;
  onPropose: (p: Proposal) => void;
  onAccept: () => void;
  onDiscard: () => void;
}) {
  const backend = useBackend();
  const [chosenKind, setKind] = useState<ScopeKind>(selected ? "element" : "slide");
  // Element scope needs a selection; fall back to the slide when nothing is selected.
  const kind: ScopeKind = chosenKind === "element" && !selected ? "slide" : chosenKind;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; upgrade: boolean } | null>(null);
  const [history, setHistory] = useState<Proposal[]>([]);
  const seq = useRef(0);
  const slide = deck.slides[slideIndex];

  // Mirror the parent's current proposal (new, accepted, discarded) into the message list.
  const [seenProposal, setSeenProposal] = useState<Proposal | null>(null);
  if (proposal !== seenProposal) {
    setSeenProposal(proposal);
    if (proposal) setHistory((h) => (h.some((x) => x.id === proposal.id) ? h.map((x) => (x.id === proposal.id ? proposal : x)) : [...h, proposal]));
  }

  const scope: EditScope =
    kind === "deck" ? { kind: "deck" } : kind === "element" && selected ? { kind: "element", slideId: slide.id, elementIds: [selected.id] } : { kind: "slide", slideIds: [slide.id] };
  const scopeLabel = kind === "deck" ? "Whole deck" : kind === "element" && selected ? `Slide ${slideIndex + 1} · ${selected.slot}` : `Slide ${slideIndex + 1}`;

  async function ask(instruction: string) {
    const ins = instruction.trim();
    if (ins.length < 2 || busy) return;
    if (proposal?.status === "pending") onDiscard();
    setBusy(true);
    setError(null);
    try {
      const r = await backend.edit(deck, scope, ins);
      onPropose({ id: ++seq.current, scopeLabel, instruction: ins, ...r, baseVersionKey: deckKey, status: "pending" });
      setText("");
    } catch (e) {
      setError({ text: e instanceof ApiError ? e.message : "The AI edit failed. Try again.", upgrade: e instanceof ApiError && e.status === 402 });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto" aria-live="polite">
        {history.length === 0 && !busy && (
          <p className="text-[13px] leading-[19px] text-ink-2">
            Choose what the AI may change, then type a request such as &ldquo;make this a three-step timeline&rdquo;. You&rsquo;ll see the change before it&rsquo;s applied.
          </p>
        )}
        {history.map((p) => (
          <div key={p.id} className="space-y-2">
            <p className="ml-6 rounded-[10px] bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] px-3 py-2 text-[13px]">
              <span className="block text-[11px] text-ink-2">{p.scopeLabel}</span>
              {p.instruction}
            </p>
            <div className={`rounded-[10px] border p-3 text-[13px] ${p.status === "pending" ? "border-dashed border-accent" : "border-line"}`}>
              <p>{p.summary}</p>
              {p.issues.filter((i) => !i.fixed || i.rule === "factuality").slice(0, 3).map((i, k) => (
                <p key={k} className="mt-1 text-[12px] text-ink-2">
                  Slide {i.slideIndex + 1}: {i.message}
                </p>
              ))}
              {p.engine === "offline" && <p className="mt-1 text-[12px] text-ink-2">Made by the offline engine.</p>}
              {p.status === "pending" ? (
                <div className="mt-3 flex gap-2">
                  <button type="button" className="btn btn-primary btn-sm" onClick={onAccept}>
                    Accept <span className="text-[11px] opacity-80">Ctrl ↵</span>
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={onDiscard}>
                    Discard <span className="text-[11px] text-ink-2">Esc</span>
                  </button>
                </div>
              ) : (
                <p className="mt-2 text-[12px] text-ink-2">{p.status === "accepted" ? "Accepted" : p.status === "stale" ? "Not applied: the deck changed after this was proposed" : "Discarded"}</p>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <p className="text-[13px] text-ink-2" role="status">
            Working on {scopeLabel.toLowerCase()}
          </p>
        )}
        {error && (error.upgrade ? <UpgradeNote message={error.text} /> : <p role="alert" className="text-[13px] text-danger">{error.text}</p>)}
      </div>

      <form
        className="mt-3 border-t border-line pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          ask(text);
        }}
      >
        <div className="mb-2 flex flex-wrap gap-1" role="radiogroup" aria-label="What the AI may change">
          {(["deck", "slide", "element"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              disabled={k === "element" && !selected}
              onClick={() => setKind(k)}
              className={`rounded-[6px] border px-2 py-1 text-[12px] ${kind === k ? "border-accent text-ink" : "border-line text-ink-2"} disabled:opacity-40`}
              title={k === "element" && !selected ? "Click an element on the slide first" : undefined}
            >
              {k === "deck" ? "Whole deck" : k === "slide" ? `Slide ${slideIndex + 1}` : selected ? elementLabel(selected).slice(0, 22) : "Selected element"}
            </button>
          ))}
        </div>
        <div className="mb-2 flex flex-wrap gap-1">
          {QUICK_ACTIONS.map((q) => (
            <button key={q} type="button" className="rounded-[6px] px-2 py-1 text-[12px] text-accent hover:bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]" onClick={() => ask(q)} disabled={busy}>
              {q}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="ask-input">Describe the change</label>
        <textarea
          id="ask-input"
          className="field min-h-[72px] resize-none text-[14px]"
          placeholder={`Change ${scopeLabel.toLowerCase()}…`}
          value={text}
          maxLength={1000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !(e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              ask(text);
            }
          }}
        />
        <button type="submit" className="btn btn-primary btn-sm mt-2 w-full" disabled={busy || text.trim().length < 2}>
          {busy ? "Working" : "Propose change"}
        </button>
      </form>
    </div>
  );
}
