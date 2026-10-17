"use client";

// Find and replace across the whole deck (Ctrl F / Ctrl H). Non-modal: the slide stays visible
// and clicking a result jumps to it. "Replace all" is one undo step.
import { useEffect, useMemo, useRef, useState } from "react";
import { CaseSensitive, ChevronDown, ChevronUp, Replace, WholeWord, X } from "lucide-react";
import type { Deck } from "@/lib/deck/schema";
import type { PatchOp } from "@/lib/deck/patch";
import { findMatches, replaceOps, type FieldKind, type Match } from "@/lib/deck/find";
import { IconButton } from "./ui";

const KIND: Record<FieldKind, string> = { text: "Text", point: "Point", shape: "Shape", cell: "Table", notes: "Notes" };

export function FindReplace({
  deck,
  locked,
  showReplace,
  onShowReplace,
  onGo,
  commit,
  onClose,
}: {
  deck: Deck;
  locked: boolean;
  showReplace: boolean;
  onShowReplace: (v: boolean) => void;
  onGo: (slideIndex: number, elementId?: string) => void;
  commit: (ops: PatchOp[], opts: { label: string }) => boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [rawCurrent, setCurrent] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [jumped, setJumped] = useState(false);
  const findRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const opts = useMemo(() => ({ matchCase, wholeWord }), [matchCase, wholeWord]);
  const matches = useMemo(() => findMatches(deck, query, opts), [deck, query, opts]);
  const current = matches.length ? Math.min(rawCurrent, matches.length - 1) : 0;

  useEffect(() => {
    (showReplace ? replaceRef : findRef).current?.focus();
    (showReplace ? replaceRef : findRef).current?.select();
  }, [showReplace]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const go = (i: number) => {
    if (!matches.length) return;
    const k = (i + matches.length) % matches.length;
    setCurrent(k);
    setJumped(true);
    onGo(matches[k].field.slideIndex, matches[k].field.elementId);
  };

  const run = (only?: Match) => {
    if (locked || !query) return;
    const r = replaceOps(deck, query, replacement, opts, only);
    if (!r.ops.length) {
      setNote(r.skipped ? "That replacement would make the text too long or empty, so nothing changed." : "Nothing to replace.");
      return;
    }
    if (commit(r.ops, { label: only ? "Replace text" : `Replace ${r.count} matches` })) {
      setNote(only ? null : `Replaced ${r.count} match${r.count === 1 ? "" : "es"}${r.skipped ? `. ${r.skipped} skipped because the text would be too long or empty` : ""}.`);
      if (only) onGo(only.field.slideIndex, only.field.elementId);
    }
  };

  const groups = useMemo(() => {
    const g = new Map<number, { m: Match; i: number }[]>();
    matches.forEach((m, i) => g.set(m.field.slideIndex, [...(g.get(m.field.slideIndex) ?? []), { m, i }]));
    return [...g.entries()];
  }, [matches]);

  return (
    <section
      aria-label="Find and replace"
      className="absolute right-4 top-3 z-40 flex max-h-[calc(100%-24px)] w-[380px] flex-col rounded-[14px] border border-line bg-surface shadow-[0_20px_48px_-16px_rgba(16,17,20,.35),0_2px_6px_rgba(16,17,20,.06)]"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="flex items-center gap-1 border-b border-line px-3 py-2">
        <IconButton label={showReplace ? "Hide replace" : "Show replace"} onClick={() => onShowReplace(!showReplace)} className="h-7 w-7">
          {showReplace ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
        </IconButton>
        <h2 className="text-[13px] font-semibold">{showReplace ? "Find and replace" : "Find"}</h2>
        <span className="tabular ml-auto text-[12px] text-ink-2" aria-live="polite">
          {query ? (matches.length ? `${current + 1} of ${matches.length}${matches.length >= 500 ? "+" : ""}` : "No results") : ""}
        </span>
        <IconButton label="Close (Esc)" onClick={onClose} className="h-7 w-7">
          <X size={15} aria-hidden="true" />
        </IconButton>
      </div>

      <div className="space-y-2 p-3">
        <div className="flex items-center gap-1">
          <input
            ref={findRef}
            aria-label="Find"
            placeholder="Find in deck"
            className="field h-9 min-w-0 flex-1 py-0 text-[13px]"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCurrent(0);
              setNote(null);
              setJumped(false);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              // First Enter after typing shows the first match; then Enter moves on.
              if (!jumped) {
                setJumped(true);
                go(e.shiftKey ? matches.length - 1 : 0);
              } else go(e.shiftKey ? current - 1 : current + 1);
            }}
          />
          <IconButton label="Match case" active={matchCase} onClick={() => setMatchCase((v) => !v)} className="h-9 w-9">
            <CaseSensitive size={17} aria-hidden="true" />
          </IconButton>
          <IconButton label="Whole words only" active={wholeWord} onClick={() => setWholeWord((v) => !v)} className="h-9 w-9">
            <WholeWord size={17} aria-hidden="true" />
          </IconButton>
        </div>
        {showReplace && (
          <div className="flex items-center gap-1">
            <input
              ref={replaceRef}
              aria-label="Replace with"
              placeholder="Replace with"
              className="field h-9 min-w-0 flex-1 py-0 text-[13px]"
              value={replacement}
              disabled={locked}
              onChange={(e) => setReplacement(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (e.ctrlKey || e.metaKey) run();
                  else if (matches[current]) run(matches[current]);
                }
              }}
            />
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <IconButton label="Previous match (Shift Enter)" onClick={() => go(current - 1)} disabled={!matches.length} className="h-8 w-8">
            <ChevronUp size={15} aria-hidden="true" />
          </IconButton>
          <IconButton label="Next match (Enter)" onClick={() => go(current + 1)} disabled={!matches.length} className="h-8 w-8">
            <ChevronDown size={15} aria-hidden="true" />
          </IconButton>
          {showReplace && (
            <span className="ml-auto flex gap-1.5">
              <button type="button" className="btn btn-secondary btn-sm min-h-8 px-2.5 text-[12px]" disabled={locked || !matches[current]} onClick={() => run(matches[current])}>
                Replace
              </button>
              <button type="button" className="btn btn-primary btn-sm min-h-8 gap-1 px-2.5 text-[12px]" disabled={locked || !matches.length} onClick={() => run()} title="Replace all (Ctrl Enter)">
                <Replace size={13} aria-hidden="true" />
                Replace all
              </button>
            </span>
          )}
        </div>
        {locked && <p className="text-[12px] text-ink-2">Accept or discard the AI suggestion before replacing text.</p>}
        {note && <p className="text-[12px] text-ink-2" role="status">{note}</p>}
      </div>

      {query && matches.length > 0 && (
        <ol ref={listRef} className="min-h-0 flex-1 overflow-y-auto border-t border-line py-1" aria-label="Results">
          {groups.map(([si, list]) => (
            <li key={si}>
              <p className="sticky top-0 bg-surface px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-2">
                Slide {si + 1} <span className="tabular font-normal normal-case tracking-normal">· {list.length}</span>
              </p>
              <ul>
                {list.map(({ m, i }) => (
                  <li key={i}>
                    <button
                      type="button"
                      data-i={i}
                      onClick={() => go(i)}
                      className={`flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-[12.5px] ${i === current ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]" : "hover:bg-[color-mix(in_srgb,var(--ink)_5%,transparent)]"}`}
                    >
                      <span className="w-10 flex-none text-[11px] text-ink-2">{KIND[m.field.kind]}</span>
                      <span className="min-w-0 truncate">
                        <span className="text-ink-2">{m.before}</span>
                        <mark className="rounded-[3px] bg-[color-mix(in_srgb,var(--warning)_28%,transparent)] px-0.5 text-ink">{m.hit}</mark>
                        <span className="text-ink-2">{m.after}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
