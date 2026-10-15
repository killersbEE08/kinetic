"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ExportDialog } from "@/components/app/ExportDialog";
import { ShareDialog } from "@/components/app/ShareDialog";
import { RequireUser } from "@/components/auth/RequireUser";
import { AccountArea, ErrorNote } from "@/components/ui/chrome";
import { SlideView } from "@/components/deck/SlideView";
import { CanvasEditor } from "@/components/editor/CanvasEditor";
import { InsertBar } from "@/components/editor/InsertBar";
import { composeSlide } from "@/lib/deck/compose";
import { useDeckEditor } from "@/components/editor/useDeckEditor";
import { DesignPanel, MotionPanel } from "@/components/editor/Panels";
import { AskPanel, type Proposal } from "@/components/editor/AskPanel";
import { blankSlide } from "@/lib/client/backend";
import { deckTheme, getTheme } from "@/lib/deck/themes";
import { stepCount } from "@/lib/deck/motion";
import { applyDeckPatch, type PatchOp } from "@/lib/deck/patch";
import { newId } from "@/lib/deck/ids";
import type { Deck, Frame, Slide } from "@/lib/deck/schema";

type Tab = "design" | "motion" | "ask";

function cloneSlide(s: Slide): Slide {
  return { ...structuredClone(s), id: newId("sl"), elements: s.elements.map((e) => ({ ...structuredClone(e), id: newId("el") })) };
}

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

function Editor({ id }: { id: string }) {
  const ed = useDeckEditor(id);
  const [rev, setRev] = useState(0);
  const [rawSlideIndex, setSlideIndex] = useState(0);
  // Selection: one or more elements on the current slide.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const setSelectedId = useCallback((id: string | null) => setSelectedIds(id ? [id] : []), []);
  const [selectionFrame, setSelectionFrame] = useState<Frame | null>(null);
  const [tab, setTab] = useState<Tab>("design");
  const [playKey, setPlayKey] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(0);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [notesOpen, setNotesOpen] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  // /d/<id>?export=1 (from the dashboard) opens the download dialog.
  const search = useSearchParams();
  const [exportOpen, setExportOpen] = useState(search.get("export") === "1");
  const [shareOpen, setShareOpen] = useState(search.get("share") === "1");

  const commit = useCallback(
    (ops: PatchOp[], opts: { label: string; author?: "user" | "ai" }) => {
      const ok = ed.commit(ops, opts);
      if (ok) setRev((r) => r + 1);
      return ok;
    },
    [ed],
  );

  const deck = ed.deck;
  const pending = proposal?.status === "pending" ? proposal : null;
  const preview: Deck | null = useMemo(() => {
    if (!deck || !pending) return null;
    try {
      return applyDeckPatch(deck, pending.ops).doc;
    } catch {
      return null;
    }
  }, [deck, pending]);
  const shown = preview ?? deck;

  // Clamp instead of syncing state, so deletes and undo never leave the index out of range.
  const slideIndex = Math.max(0, Math.min(rawSlideIndex, (shown?.slides.length ?? 1) - 1));
  const slide = shown?.slides[slideIndex];
  const selected = slide?.elements.find((e) => e.id === selectedId) ?? null;
  const theme = shown ? deckTheme(shown) : getTheme("mono");
  const steps = slide && shown ? stepCount(slide, shown.motionIntensity) : 1;

  const accept = useCallback(() => {
    if (!pending) return;
    if (pending.baseVersionKey !== String(rev)) {
      setProposal({ ...pending, status: "stale" });
      setNotice("The deck changed after that suggestion was made, so it wasn't applied. Ask again.");
      return;
    }
    const ok = commit(pending.ops, { label: `AI: ${pending.instruction.slice(0, 40)}`, author: "ai" });
    setProposal({ ...pending, status: ok ? "accepted" : "stale" });
  }, [pending, rev, commit]);

  const discard = useCallback(() => {
    if (pending) setProposal({ ...pending, status: "discarded" });
  }, [pending]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "Enter" && pending) {
        e.preventDefault();
        accept();
        return;
      }
      if (e.key === "Escape") {
        if (pending) {
          e.preventDefault();
          discard();
        } else if (!isTyping(e.target)) setSelectedId(null);
        return;
      }
      if (isTyping(e.target)) return;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (pending) return;
        if (e.shiftKey) ed.redo();
        else ed.undo();
        setRev((r) => r + 1);
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        if (!pending) ed.redo();
        setRev((r) => r + 1);
      } else if (!mod && (e.key === "ArrowDown" || e.key === "PageDown")) {
        e.preventDefault();
        setSlideIndex((i) => Math.min((shown?.slides.length ?? 1) - 1, i + 1));
        setSelectedId(null);
      } else if (!mod && (e.key === "ArrowUp" || e.key === "PageUp")) {
        e.preventDefault();
        setSlideIndex((i) => Math.max(0, i - 1));
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, accept, discard, ed, shown, setSelectedId]);

  if (ed.loadError) {
    return (
      <main className="mx-auto max-w-[560px] px-6 py-24">
        <ErrorNote onRetry={ed.reload}>{ed.loadError}</ErrorNote>
        <Link href="/decks" className="btn btn-secondary mt-6">Back to decks</Link>
      </main>
    );
  }
  if (!deck || !shown || !slide) {
    return (
      <div className="grid h-dvh grid-cols-[200px_1fr_320px] gap-6 p-6" aria-busy="true">
        <div className="skeleton" />
        <div className="skeleton aspect-video self-start" />
        <div className="skeleton" />
      </div>
    );
  }

  const si = deck.slides.findIndex((s) => s.id === slide.id);
  const editable = !pending && si >= 0;
  const elIndex = (elId: string) => deck.slides[si].elements.findIndex((e) => e.id === elId);

  const editText = (elId: string, value: string) => {
    const ei = elIndex(elId);
    if (ei < 0 || !value) return;
    const ops: PatchOp[] = [{ op: "replace", path: `/slides/${si}/elements/${ei}/content`, value }];
    if (deck.slides[si].elements[ei].aiSuggested) ops.push({ op: "replace", path: `/slides/${si}/elements/${ei}/aiSuggested`, value: false });
    commit(ops, { label: "Edit text" });
  };
  const editItem = (elId: string, k: number, value: string) => {
    const ei = elIndex(elId);
    if (ei < 0) return;
    const el = deck.slides[si].elements[ei];
    if (el.type !== "bullets") return;
    const ops: PatchOp[] = value ? [{ op: "replace", path: `/slides/${si}/elements/${ei}/items/${k}`, value: value.slice(0, 160) }] : el.items.length > 1 ? [{ op: "remove", path: `/slides/${si}/elements/${ei}/items/${k}` }] : [];
    if (ops.length && el.aiSuggested) ops.push({ op: "replace", path: `/slides/${si}/elements/${ei}/aiSuggested`, value: false });
    if (ops.length) commit(ops, { label: "Edit point" });
  };

  const addBlank = () => {
    commit([{ op: "add", path: `/slides/${si + 1}`, value: composeSlide({ layout: "blank", slots: [] }) }], { label: "Add blank slide" });
    setSlideIndex(si + 1);
    setSelectedId(null);
  };
  const addSlide = () => {
    commit([{ op: "add", path: `/slides/${si + 1}`, value: blankSlide() }], { label: "Add slide" });
    setSlideIndex(si + 1);
  };
  const duplicate = (i: number) => {
    commit([{ op: "add", path: `/slides/${i + 1}`, value: cloneSlide(deck.slides[i]) }], { label: "Duplicate slide" });
    setSlideIndex(i + 1);
  };
  const remove = (i: number) => {
    if (deck.slides.length <= 1) return;
    commit([{ op: "remove", path: `/slides/${i}` }], { label: "Delete slide" });
    setSelectedId(null);
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= deck.slides.length || from === to) return;
    commit([{ op: "move", from: `/slides/${from}`, path: `/slides/${to}` }], { label: "Move slide" });
    setSlideIndex(to);
  };

  const play = () => {
    setPlaying(true);
    setStep(steps - 1);
    setPlayKey((k) => k + 1);
  };

  const saveLabel = { saved: "Saved", saving: "Saving", error: "Not saved", conflict: "Changed elsewhere", offline: "Offline" }[ed.saveState];

  return (
    <div className="flex h-dvh flex-col">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-canvas px-4">
        <Link href="/decks" className="btn btn-ghost btn-sm">← Decks</Link>
        <h1 className="min-w-0 truncate text-[15px] font-medium">{deck.title}</h1>
        <span className={`text-[12px] ${ed.saveState === "error" || ed.saveState === "conflict" ? "text-danger" : "text-ink-2"}`} role="status" aria-live="polite">
          {saveLabel}
        </span>
        <div className="ml-4 flex items-center gap-1">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { ed.undo(); setRev((r) => r + 1); }} disabled={!ed.canUndo || !!pending} title={ed.undoLabel ? `Undo ${ed.undoLabel} (Ctrl Z)` : "Undo"}>
            Undo
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { ed.redo(); setRev((r) => r + 1); }} disabled={!ed.canRedo || !!pending} title="Redo (Ctrl Shift Z)">
            Redo
          </button>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShareOpen(true)} disabled={!!pending}>Share</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setExportOpen(true)} disabled={!!pending}>Download</button>
          <Link href={`/d/${deck.id}/present?slide=${si + 1}`} className="btn btn-primary btn-sm">Present</Link>
          <AccountArea />
        </div>
      </header>

      {(ed.saveState === "conflict" || ed.saveState === "error") && (
        <div className="border-b border-line px-4 py-2">
          <ErrorNote onRetry={ed.reload}>{ed.saveError} Reloading discards changes made since the last save.</ErrorNote>
        </div>
      )}
      {notice && (
        <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-2 text-[13px]" role="status">
          {notice}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Slide rail */}
        <nav aria-label="Slides" className="w-[200px] shrink-0 overflow-y-auto border-r border-line bg-canvas p-3">
          <ol className="space-y-3">
            {shown.slides.map((s, i) => {
              const changed = pending?.changedSlideIds.includes(s.id);
              const active = i === slideIndex;
              return (
                <li
                  key={s.id}
                  draggable={!pending}
                  onDragStart={() => setDragFrom(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragFrom !== null) move(dragFrom, i);
                    setDragFrom(null);
                  }}
                  className="group"
                >
                  <div className="flex gap-2">
                    <span className="tabular w-4 pt-1 text-right text-[11px] text-ink-2">{i + 1}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSlideIndex(i);
                        setSelectedId(null);
                        setPlaying(false);
                      }}
                      aria-current={active}
                      aria-label={`Slide ${i + 1}`}
                      className={`block w-full overflow-hidden rounded-[6px] border-2 ${active ? "border-accent" : changed ? "border-dashed border-accent" : "border-transparent hover:border-line"}`}
                    >
                      <SlideView slide={s} theme={theme} intensity={shown.motionIntensity} mode="static" />
                    </button>
                  </div>
                  {active && !pending && (
                    <div className="mt-1 flex flex-wrap justify-end gap-0.5 text-[11px]">
                      <button type="button" className="rounded px-1.5 py-0.5 text-ink-2 hover:bg-line hover:text-ink" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="Move slide up">Up</button>
                      <button type="button" className="rounded px-1.5 py-0.5 text-ink-2 hover:bg-line hover:text-ink" onClick={() => move(i, i + 1)} disabled={i === deck.slides.length - 1} aria-label="Move slide down">Down</button>
                      <button type="button" className="rounded px-1.5 py-0.5 text-ink-2 hover:bg-line hover:text-ink" onClick={() => duplicate(i)}>Copy</button>
                      <button type="button" className="rounded px-1.5 py-0.5 text-ink-2 hover:bg-line hover:text-danger" onClick={() => remove(i)} disabled={deck.slides.length <= 1}>Delete</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          <div className="mt-4 grid grid-cols-2 gap-1.5">
            <button type="button" className="btn btn-secondary btn-sm px-2" onClick={addSlide} disabled={!!pending}>Add slide</button>
            <button type="button" className="btn btn-secondary btn-sm px-2" onClick={addBlank} disabled={!!pending} title="An empty slide for placing text, photos and shapes yourself">Blank</button>
          </div>
        </nav>

        {/* Canvas */}
        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-[color-mix(in_srgb,var(--ink)_4%,var(--canvas))]">
          <div className="mx-auto w-full max-w-[1100px] flex-1 px-8 py-6">
            {editable && !playing && (
              <div className="mb-4">
                <InsertBar
                  count={slide.elements.filter((e) => e.frame).length}
                  onInsert={(el, label) => {
                    if (slide.elements.length >= 60) {
                      setNotice("A slide can hold up to 60 elements. Delete some, or add a new slide.");
                      return;
                    }
                    if (commit([{ op: "add", path: `/slides/${si}/elements/-`, value: el }], { label })) {
                      setSelectedId(el.id);
                      setTab("design");
                    }
                  }}
                />
              </div>
            )}
            <div className={`relative rounded-[8px] ${pending && pending.changedSlideIds.includes(slide.id) ? "outline-[3px] outline-dashed outline-offset-8 outline-accent" : ""}`}>
              {pending && pending.changedSlideIds.includes(slide.id) && (
                <span className="absolute -top-9 right-0 rounded-[6px] bg-accent px-2 py-1 text-[12px] font-medium text-white">Suggested</span>
              )}
              <div className="rounded-[8px] shadow-[0_4px_12px_rgba(0,0,0,0.08)] [&_[data-canvas]>div:first-child]:rounded-[8px]">
                <CanvasEditor
                  deck={deck}
                  slideIndex={si}
                  slide={slide}
                  theme={theme}
                  intensity={shown.motionIntensity}
                  editable={editable}
                  playing={playing}
                  step={step}
                  playKey={`${slide.id}-${playKey}`}
                  page={slideIndex + 1}
                  selectedIds={selectedIds}
                  onSelectIds={(ids) => {
                    setSelectedIds(ids);
                    if (ids.length) setTab((t) => (t === "ask" && ids.length === 1 ? t : "design"));
                  }}
                  commit={commit}
                  onEditText={editText}
                  onEditItem={editItem}
                  onSelectionFrame={setSelectionFrame}
                  label={`Slide ${slideIndex + 1} canvas`}
                />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <button type="button" className="btn btn-secondary btn-sm" onClick={play}>Play slide</button>
                {playing && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPlaying(false)}>Stop and edit</button>
                )}
              </div>
              {steps > 1 && (
                <div className="flex items-center gap-1" role="group" aria-label="Build steps">
                  <span className="mr-1 text-[12px] text-ink-2">Builds</span>
                  {Array.from({ length: steps }).map((_, k) => (
                    <button
                      key={k}
                      type="button"
                      aria-label={`Show build step ${k + 1}`}
                      aria-pressed={playing && step === k}
                      onClick={() => {
                        setPlaying(true);
                        setStep(k);
                        setPlayKey((p) => p + 1);
                      }}
                      className={`h-2.5 w-2.5 rounded-full ${playing && k <= step ? "bg-ink" : "bg-line"}`}
                    />
                  ))}
                </div>
              )}
              <p className="text-[12px] text-ink-2">{editable ? "Click to select, click again to type, drag to move. Shift-click or drag a box to select several. Ctrl G groups." : pending ? "Accept or discard the suggestion to keep editing." : ""}</p>
            </div>
          </div>

          {/* Speaker notes */}
          <section className="border-t border-line bg-surface" aria-label="Speaker notes">
            <button type="button" className="flex w-full items-center justify-between px-6 py-2 text-[13px] font-medium" aria-expanded={notesOpen} onClick={() => setNotesOpen((o) => !o)}>
              Speaker notes <span className="text-ink-2">{notesOpen ? "Hide" : "Show"}</span>
            </button>
            {notesOpen && (
              <div className="px-6 pb-4">
                <NotesEditor key={slide.id + (pending ? "-p" : "")} value={slide.notes} disabled={!editable} onCommit={(v) => commit([{ op: "replace", path: `/slides/${si}/notes`, value: v.slice(0, 5000) }], { label: "Edit notes" })} />
              </div>
            )}
          </section>
        </main>

        {/* Inspector */}
        <aside className="flex w-[320px] shrink-0 flex-col border-l border-line bg-surface" aria-label="Inspector">
          <div role="tablist" aria-label="Inspector" className="flex border-b border-line">
            {(["design", "motion", "ask"] as const).map((t) => (
              <button key={t} type="button" role="tab" id={`tab-${t}`} aria-selected={tab === t} aria-controls={`panel-${t}`} onClick={() => setTab(t)} className={`flex-1 py-3 text-[13px] font-medium ${tab === t ? "border-b-2 border-ink text-ink" : "text-ink-2 hover:text-ink"}`}>
                {t === "design" ? "Design" : t === "motion" ? "Motion" : "Ask"}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="min-h-0 flex-1 overflow-y-auto p-4">
            {tab === "design" &&
              (editable ? <DesignPanel deck={deck} slideIndex={si} selected={selected} selectedIds={selectedIds} onSelectIds={setSelectedIds} commit={commit} frame={selectionFrame} onSelect={setSelectedId} /> : <p className="text-[13px] text-ink-2">Accept or discard the suggestion first.</p>)}
            {tab === "motion" &&
              (editable ? (
                <MotionPanel deck={deck} slideIndex={si} selectedId={selectedId} onSelect={setSelectedId} commit={commit} onPreview={play} />
              ) : (
                <p className="text-[13px] text-ink-2">Accept or discard the suggestion first.</p>
              ))}
            {tab === "ask" && (
              <AskPanel
                deck={deck}
                slideIndex={Math.max(0, si)}
                selected={selected}
                deckKey={String(rev)}
                proposal={proposal}
                onPropose={(p) => {
                  setNotice(null);
                  setPlaying(false);
                  setProposal(p);
                }}
                onAccept={accept}
                onDiscard={discard}
              />
            )}
          </div>
        </aside>
      </div>
      <ExportDialog deck={deck} slideIndex={Math.max(0, si)} open={exportOpen} onClose={() => setExportOpen(false)} />
      <ShareDialog deckId={deck.id} open={shareOpen} onClose={() => setShareOpen(false)} />
    </div>
  );
}

function NotesEditor({ value, disabled, onCommit }: { value: string; disabled: boolean; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setV(value);
  }
  return (
    <textarea
      aria-label="Speaker notes"
      className="field min-h-[80px] resize-y text-[14px]"
      placeholder="What you'll say on this slide."
      value={v}
      disabled={disabled}
      maxLength={5000}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)}
    />
  );
}

export default function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequireUser>
      <Editor id={id} />
    </RequireUser>
  );
}
