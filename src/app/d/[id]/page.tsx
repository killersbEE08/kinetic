"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Download,
  EyeOff,
  History,
  ListChecks,
  MonitorPlay,
  Keyboard,
  LayoutGrid,
  Loader2,
  Maximize2,
  MessageSquareText,
  Minus,
  PanelLeft,
  PanelRight,
  Play,
  Plus,
  Redo2,
  Search,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Square,
  StickyNote,
  Undo2,
  Zap,
} from "lucide-react";
import { ExportDialog } from "@/components/app/ExportDialog";
import { ShareDialog } from "@/components/app/ShareDialog";
import { NotificationBell } from "@/components/app/NotificationBell";
import { RequireUser } from "@/components/auth/RequireUser";
import { AccountArea, ErrorNote } from "@/components/ui/chrome";
import { CanvasEditor } from "@/components/editor/CanvasEditor";
import { InsertBar } from "@/components/editor/InsertBar";
import { useDeckEditor } from "@/components/editor/useDeckEditor";
import { useGenerationFill } from "@/components/editor/useGenerationFill";
import { DesignPanel, MotionPanel } from "@/components/editor/Panels";
import { AskPanel, type Proposal } from "@/components/editor/AskPanel";
import { ReviewPanel } from "@/components/editor/ReviewPanel";
import { CommentsPanel, useComments } from "@/components/editor/CommentsPanel";
import { track } from "@/lib/client/track";
import { SlideGrid, SlideRail } from "@/components/editor/SlideRail";
import { FindReplace } from "@/components/editor/FindReplace";
import { HistoryView } from "@/components/editor/HistoryView";
import { CopyToDeckDialog, ImportSlidesDialog } from "@/components/editor/SlideTransfer";
import { restoreOps } from "@/lib/deck/versions";
import { reviewDeck, RULES } from "@/lib/deck/review";
import { DropMenu, IconButton, Kbd, Modal, menuItem } from "@/components/editor/ui";
import { deckTheme, getTheme } from "@/lib/deck/themes";
import { stepCount } from "@/lib/deck/motion";
import { applyDeckPatch, type PatchOp } from "@/lib/deck/patch";
import { newId } from "@/lib/deck/ids";
import type { Deck, Frame, Slide } from "@/lib/deck/schema";

type Tab = "design" | "motion" | "ask" | "review" | "comments";
type Zoom = "fit" | number;
const ZOOMS = [0.25, 0.35, 0.5, 0.75, 1] as const;

const TABS: { id: Tab; label: string; icon: typeof Zap }[] = [
  { id: "design", label: "Design", icon: SlidersHorizontal },
  { id: "motion", label: "Motion", icon: Zap },
  { id: "ask", label: "Ask", icon: Sparkles },
  { id: "review", label: "Review", icon: ListChecks },
  { id: "comments", label: "Comments", icon: MessageSquareText },
];

function cloneSlide(s: Slide): Slide {
  return { ...structuredClone(s), id: newId("sl"), elements: s.elements.map((e) => ({ ...structuredClone(e), id: newId("el") })) };
}

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/** Width of the slide on screen for a zoom level, given the free space around it. */
function useCanvasWidth(zoom: Zoom) {
  const [node, attach] = useState<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    if (!node) return;
    const update = () => setBox({ w: node.clientWidth, h: node.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  const fit = Math.max(320, Math.min(box.w - 80, ((box.h - 72) * 16) / 9));
  return { attach, width: zoom === "fit" ? fit : 1920 * zoom, fit };
}

function SaveStatus({ state }: { state: "saved" | "saving" | "error" | "conflict" | "offline" }) {
  const map = {
    saved: { icon: <Check size={13} aria-hidden="true" />, text: "Saved", cls: "text-ink-2" },
    saving: { icon: <Loader2 size={13} aria-hidden="true" />, text: "Saving", cls: "text-ink-2" },
    error: { icon: <AlertCircle size={13} aria-hidden="true" />, text: "Not saved", cls: "text-danger" },
    conflict: { icon: <AlertCircle size={13} aria-hidden="true" />, text: "Changed elsewhere", cls: "text-danger" },
    offline: { icon: <CloudOff size={13} aria-hidden="true" />, text: "Offline", cls: "text-warning" },
  }[state];
  return (
    <span className={`inline-flex flex-none items-center gap-1 text-[12px] ${map.cls}`} role="status" aria-live="polite">
      {map.icon}
      {map.text}
    </span>
  );
}

/** Deck title, editable in place. */
function TitleInput({ value, onCommit, disabled }: { value: string; onCommit: (v: string) => void; disabled?: boolean }) {
  const [v, setV] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setV(value);
  }
  return (
    <input
      aria-label="Deck title"
      value={v}
      disabled={disabled}
      maxLength={200}
      size={Math.max(8, Math.min(40, v.length + 1))}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => (v.trim() && v.trim() !== value ? onCommit(v.trim()) : setV(value))}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setV(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className="min-w-0 max-w-[360px] truncate rounded-[6px] border border-transparent bg-transparent px-1.5 py-1 text-[14px] font-semibold outline-none hover:border-line focus:border-accent focus:bg-surface"
    />
  );
}

const SHORTCUTS: [string, string[]][] = [
  ["Undo", ["Ctrl", "Z"]],
  ["Find in deck", ["Ctrl", "F"]],
  ["Find and replace", ["Ctrl", "H"]],
  ["Redo", ["Ctrl", "Shift", "Z"]],
  ["Previous / next slide", ["↑", "↓"]],
  ["Select several", ["Shift", "Click"]],
  ["Nudge selection", ["Arrows"]],
  ["Nudge 10×", ["Shift", "Arrows"]],
  ["Duplicate element", ["Ctrl", "D"]],
  ["Copy / paste element", ["Ctrl", "C / V"]],
  ["Group / ungroup", ["Ctrl", "G"]],
  ["Delete element", ["Del"]],
  ["Zoom in / out", ["Ctrl", "+ / −"]],
  ["Fit slide to window", ["Ctrl", "0"]],
  ["Grid view", ["Ctrl", "Shift", "G"]],
  ["Play this slide", ["Ctrl", "P"]],
  ["Accept / discard suggestion", ["Ctrl", "Enter / Esc"]],
  ["Show shortcuts", ["?"]],
];

function Editor({ id }: { id: string }) {
  const ed = useDeckEditor(id);
  const comments = useComments(id);
  const [rev, setRev] = useState(0);
  const [rawSlideIndex, setSlideIndex] = useState(0);
  // Selection: one or more elements on the current slide.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const setSelectedId = useCallback((id: string | null) => setSelectedIds(id ? [id] : []), []);
  const [selectionFrame, setSelectionFrame] = useState<Frame | null>(null);
  // /d/<id>?export=1 (from the dashboard) opens the download dialog; ?comments=1 (from an alert) opens comments.
  const search = useSearchParams();
  const [tab, setTab] = useState<Tab>(search.get("comments") === "1" ? "comments" : search.get("review") === "1" ? "review" : "design");
  const [playKey, setPlayKey] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(0);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [notesOpen, setNotesOpen] = useState(true);
  const [railOpen, setRailOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [grid, setGrid] = useState(false);
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [helpOpen, setHelpOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(search.get("export") === "1");
  const [shareOpen, setShareOpen] = useState(search.get("share") === "1");
  const [historyOpen, setHistoryOpen] = useState(search.get("history") === "1");
  const [find, setFind] = useState<null | "find" | "replace">(null);
  const [copyFrom, setCopyFrom] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const { attach: attachCanvas, width: canvasWidth, fit: canvasFit } = useCanvasWidth(zoom);

  const editedOnce = useRef(false);
  const commit = useCallback(
    (ops: PatchOp[], opts: { label: string; author?: "user" | "ai" }) => {
      const ok = ed.commit(ops, opts);
      if (ok) setRev((r) => r + 1);
      // Activation funnel: the first change to this deck in this session.
      if (ok && !editedOnce.current && ed.deck) {
        editedOnce.current = true;
        track("deck_edited", { deckId: ed.deck.id, props: { by: opts.author ?? "user" } });
      }
      return ok;
    },
    [ed],
  );

  const deck = ed.deck;
  const pending = proposal?.status === "pending" ? proposal : null;
  const fill = useGenerationFill(id, !!deck, ed.current, ed.commit, !!pending);
  const preview: Deck | null = useMemo(() => {
    if (!deck || !pending) return null;
    try {
      return applyDeckPatch(deck, pending.ops).doc;
    } catch {
      return null;
    }
  }, [deck, pending]);
  const shown = preview ?? deck;
  // Badge on the Review tab: things to fix or check (tips not counted).
  const reviewCount = useMemo(() => (deck ? reviewDeck(deck, deckTheme(deck)).filter((i) => RULES[i.rule].severity !== "tip").length : 0), [deck]);

  // Clamp instead of syncing state, so deletes and undo never leave the index out of range.
  const slideIndex = Math.max(0, Math.min(rawSlideIndex, (shown?.slides.length ?? 1) - 1));
  const slide = shown?.slides[slideIndex];
  const selected = slide?.elements.find((e) => e.id === selectedId) ?? null;
  const theme = shown ? deckTheme(shown) : getTheme("mono");
  const steps = slide && shown ? stepCount(slide, shown.motionIntensity) : 1;
  const total = shown?.slides.length ?? 1;

  const goTo = useCallback(
    (i: number) => {
      setSlideIndex(Math.max(0, Math.min(total - 1, i)));
      setSelectedId(null);
      setPlaying(false);
    },
    [total, setSelectedId],
  );

  const play = useCallback(() => {
    setPlaying(true);
    setStep(steps - 1);
    setPlayKey((k) => k + 1);
  }, [steps]);

  const zoomBy = useCallback(
    (dir: 1 | -1) =>
      setZoom((z) => {
        const cur = z === "fit" ? canvasFit / 1920 : z;
        const next = dir > 0 ? ZOOMS.find((x) => x > cur + 0.01) : [...ZOOMS].reverse().find((x) => x < cur - 0.01);
        return next ?? z;
      }),
    [canvasFit],
  );

  const accept = useCallback(() => {
    if (!pending) return;
    if (pending.baseVersionKey !== String(rev)) {
      setProposal({ ...pending, status: "stale" });
      setNotice("The deck changed after that suggestion was made, so it wasn't applied. Ask again.");
      return;
    }
    const ok = commit(pending.ops, { label: `AI: ${pending.instruction.slice(0, 40)}`, author: "ai" });
    if (ok) track("ai_edit_accepted", { deckId: deck?.id, props: { scope: pending.scopeLabel === "Whole deck" ? "deck" : "slide", slides: pending.changedSlideIds.length, engine: pending.engine } });
    setProposal({ ...pending, status: ok ? "accepted" : "stale" });
  }, [pending, rev, commit, deck?.id]);

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
      // Find works even while typing, like other editors.
      if (mod && !e.shiftKey && (e.key.toLowerCase() === "f" || e.key.toLowerCase() === "h")) {
        e.preventDefault();
        setHistoryOpen(false);
        setGrid(false);
        setFind(e.key.toLowerCase() === "h" ? "replace" : "find");
        return;
      }
      if (e.key === "Escape") {
        if (pending) {
          e.preventDefault();
          discard();
        } else if (find) setFind(null);
        else if (historyOpen) setHistoryOpen(false);
        else if (grid) setGrid(false);
        else if (!isTyping(e.target)) setSelectedId(null);
        return;
      }
      // Zoom works everywhere except while typing.
      if (mod && !isTyping(e.target) && (e.key === "=" || e.key === "+" || e.key === "-" || e.key === "0")) {
        e.preventDefault();
        if (e.key === "0") setZoom("fit");
        else zoomBy(e.key === "-" ? -1 : 1);
        return;
      }
      if (isTyping(e.target)) return;
      if (mod && e.shiftKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        setGrid((g) => !g);
      } else if (mod && e.key.toLowerCase() === "p") {
        e.preventDefault();
        play();
      } else if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (pending) return;
        if (e.shiftKey) ed.redo();
        else ed.undo();
        setRev((r) => r + 1);
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        if (!pending) ed.redo();
        setRev((r) => r + 1);
      } else if (!mod && e.key === "?") {
        e.preventDefault();
        setHelpOpen(true);
      } else if (!mod && (e.key === "ArrowDown" || e.key === "PageDown") && !selectedIds.length) {
        e.preventDefault();
        goTo(slideIndex + 1);
      } else if (!mod && (e.key === "ArrowUp" || e.key === "PageUp") && !selectedIds.length) {
        e.preventDefault();
        goTo(slideIndex - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, accept, discard, ed, setSelectedId, grid, zoomBy, play, goTo, slideIndex, selectedIds.length, find, historyOpen]);

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
      <div className="flex h-dvh flex-col" aria-busy="true">
        <div className="h-14 border-b border-line bg-surface" />
        <div className="grid flex-1 grid-cols-[212px_1fr_320px]">
          <div className="space-y-3 border-r border-line bg-surface p-3">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton aspect-video" />)}</div>
          <div className="p-10"><div className="skeleton mx-auto aspect-video max-w-[960px]" /></div>
          <div className="border-l border-line bg-surface p-4"><div className="skeleton h-40" /></div>
        </div>
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

  const addSlide = (s: Slide, label: string) => {
    if (deck.slides.length >= 100) {
      setNotice("A deck can hold up to 100 slides.");
      return;
    }
    if (commit([{ op: "add", path: `/slides/${si + 1}`, value: s }], { label })) {
      setSlideIndex(si + 1);
      setSelectedId(null);
    }
  };
  const duplicate = (i: number) => {
    if (deck.slides.length >= 100) return setNotice("A deck can hold up to 100 slides.");
    commit([{ op: "add", path: `/slides/${i + 1}`, value: cloneSlide(deck.slides[i]) }], { label: "Duplicate slide" });
    setSlideIndex(i + 1);
  };
  const remove = (i: number) => {
    if (deck.slides.length <= 1) return;
    commit([{ op: "remove", path: `/slides/${i}` }], { label: "Delete slide" });
    setSelectedId(null);
  };
  const toggleHidden = (i: number) => {
    const s = deck.slides[i];
    const visible = deck.slides.filter((x) => !x.hidden).length;
    if (!s.hidden && visible <= 1) return setNotice("At least one slide has to stay visible.");
    commit([s.hidden ? { op: "remove", path: `/slides/${i}/hidden` } : { op: "add", path: `/slides/${i}/hidden`, value: true }], { label: s.hidden ? "Show slide" : "Hide slide" });
  };
  const insertSlides = (list: Slide[]) => {
    if (deck.slides.length + list.length > 100) return setNotice("A deck can hold up to 100 slides.");
    if (commit(list.map((s, k) => ({ op: "add" as const, path: `/slides/${si + 1 + k}`, value: s })), { label: `Add ${list.length} slide${list.length === 1 ? "" : "s"} from another deck` })) {
      setSlideIndex(si + 1);
      setSelectedId(null);
    }
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= deck.slides.length || from === to) return;
    commit([{ op: "move", from: `/slides/${from}`, path: `/slides/${to}` }], { label: "Move slide" });
    setSlideIndex(to);
  };

  const undo = () => {
    ed.undo();
    setRev((r) => r + 1);
  };
  /** From the review and comment lists: open a slide and select the element in question. */
  const goToElement = (i: number, elId?: string) => {
    setPlaying(false);
    setGrid(false);
    setHistoryOpen(false);
    setSlideIndex(i);
    setSelectedIds(elId && shown.slides[i]?.elements.some((e) => e.id === elId) ? [elId] : []);
  };
  const redo = () => {
    ed.redo();
    setRev((r) => r + 1);
  };

  const railProps = {
    deck,
    slides: shown.slides,
    theme,
    current: slideIndex,
    locked: !!pending,
    changedIds: pending?.changedSlideIds,
    commentCounts: comments.openBySlide,
    onSelect: goTo,
    onMove: move,
    onDuplicate: duplicate,
    onRemove: remove,
    onAdd: addSlide,
    onToggleHidden: toggleHidden,
    onCopyTo: (i: number) => setCopyFrom(i),
    onImport: () => setImportOpen(true),
  };
  const pct = Math.round((canvasWidth / 1920) * 100);
  const changedHere = !!pending?.changedSlideIds.includes(slide.id);

  return (
    <div className="flex h-dvh flex-col bg-canvas">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-3">
        <Link href="/decks" className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-ink-2 hover:bg-[color-mix(in_srgb,var(--ink)_7%,transparent)] hover:text-ink" aria-label="Back to decks" title="Back to decks">
          <ArrowLeft size={17} aria-hidden="true" />
        </Link>
        <span className="h-5 w-px bg-line" aria-hidden="true" />
        <IconButton label={railOpen ? "Hide slides" : "Show slides"} onClick={() => setRailOpen((o) => !o)} active={railOpen}>
          <PanelLeft size={16} aria-hidden="true" />
        </IconButton>
        <div className="flex min-w-0 items-center gap-2">
          <TitleInput value={deck.title} disabled={!!pending} onCommit={(v) => commit([{ op: "replace", path: "/title", value: v }], { label: "Rename deck" })} />
          <SaveStatus state={ed.saveState} />
        </div>
        <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
        <div className="flex items-center">
          <IconButton label={ed.undoLabel ? `Undo ${ed.undoLabel}` : "Undo"} shortcut="Ctrl Z" onClick={undo} disabled={!ed.canUndo || !!pending}>
            <Undo2 size={16} aria-hidden="true" />
          </IconButton>
          <IconButton label="Redo" shortcut="Ctrl Shift Z" onClick={redo} disabled={!ed.canRedo || !!pending}>
            <Redo2 size={16} aria-hidden="true" />
          </IconButton>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <IconButton label="Find and replace" shortcut="Ctrl F" onClick={() => (setHistoryOpen(false), setGrid(false), setFind((f) => (f ? null : "find")))} active={!!find}>
            <Search size={16} aria-hidden="true" />
          </IconButton>
          <IconButton label="Version history" onClick={() => (setFind(null), setGrid(false), setHistoryOpen((h) => !h))} active={historyOpen} disabled={!!pending}>
            <History size={16} aria-hidden="true" />
          </IconButton>
          <IconButton label={comments.openCount ? `Comments (${comments.openCount} open)` : "Comments"} onClick={() => (setInspectorOpen(true), setGrid(false), setTab("comments"))} active={inspectorOpen && tab === "comments"}>
            <span className="relative">
              <MessageSquareText size={16} aria-hidden="true" />
              {comments.openCount > 0 && <span className="absolute -right-1.5 -top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-accent" aria-hidden="true" />}
            </span>
          </IconButton>
          <IconButton label="Grid view" shortcut="Ctrl Shift G" onClick={() => (setHistoryOpen(false), setGrid((g) => !g))} active={grid}>
            <LayoutGrid size={16} aria-hidden="true" />
          </IconButton>
          <IconButton label="Keyboard shortcuts" shortcut="?" onClick={() => setHelpOpen(true)}>
            <Keyboard size={16} aria-hidden="true" />
          </IconButton>
          <IconButton label={inspectorOpen ? "Hide inspector" : "Show inspector"} onClick={() => setInspectorOpen((o) => !o)} active={inspectorOpen}>
            <PanelRight size={16} aria-hidden="true" />
          </IconButton>
          <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
          <button type="button" className="btn btn-ghost btn-sm min-h-8 gap-1.5 px-2.5" onClick={() => setShareOpen(true)} disabled={!!pending}>
            <Share2 size={15} aria-hidden="true" />
            <span className="hidden lg:inline">Share</span>
          </button>
          <button type="button" className="btn btn-ghost btn-sm min-h-8 gap-1.5 px-2.5" onClick={() => setExportOpen(true)} disabled={!!pending}>
            <Download size={15} aria-hidden="true" />
            <span className="hidden lg:inline">Download</span>
          </button>
          <div className="flex items-stretch">
            <Link href={`/d/${deck.id}/present?slide=${si + 1}`} style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }} className="btn btn-primary btn-sm min-h-8 gap-1.5 pl-3 pr-3">
              <Play size={14} fill="currentColor" aria-hidden="true" />
              Present
            </Link>
            <DropMenu
              align="right"
              label="Present options"
              trigger={({ toggle, open }) => (
                <button type="button" onClick={toggle} aria-expanded={open} aria-label="Present options" style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }} className="btn btn-primary btn-sm h-full min-h-8 border-l border-[color-mix(in_srgb,white_30%,transparent)] px-1.5">
                  <ChevronDown size={14} aria-hidden="true" />
                </button>
              )}
            >
              {(close) => (
                <>
                  <Link role="menuitem" href={`/d/${deck.id}/present?slide=${si + 1}`} className={menuItem} onClick={close}>From this slide ({si + 1})</Link>
                  <Link role="menuitem" href={`/d/${deck.id}/present?slide=1`} className={menuItem} onClick={close}>From the start</Link>
                  <Link role="menuitem" href={`/d/${deck.id}/present?slide=${si + 1}&view=presenter`} className={menuItem} onClick={close}>
                    <MonitorPlay size={14} className="text-ink-2" aria-hidden="true" />
                    Presenter view (notes, timer, next slide)
                  </Link>
                  <button type="button" role="menuitem" className={menuItem} onClick={() => (close(), play())}>Preview this slide here</button>
                </>
              )}
            </DropMenu>
          </div>
          <span className="ml-1 flex items-center gap-1"><NotificationBell align="right" /><AccountArea /></span>
        </div>
      </header>

      {(ed.saveState === "conflict" || ed.saveState === "error") && (
        <div className="border-b border-line px-4 py-2">
          <ErrorNote onRetry={ed.reload}>{ed.saveError} Reloading discards changes made since the last save.</ErrorNote>
        </div>
      )}
      {fill && (fill.status === "running" || fill.status === "error") && (
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-2 text-[13px]" role="status" aria-live="polite">
          {fill.status === "running" ? (
            <>
              <Loader2 size={14} className="text-accent" aria-hidden="true" />
              <span><b className="font-semibold">Writing slides: {fill.ready} of {fill.total} ready.</b> <span className="text-ink-2">Edit the ones that are ready. Slides you change are never overwritten.{pending ? " New slides wait until you accept or discard the suggestion." : ""}</span></span>
              <button type="button" className="btn btn-ghost btn-sm ml-auto min-h-7" onClick={fill.stop}>Stop writing</button>
            </>
          ) : (
            <span className="text-danger">Writing stopped at {fill.ready} of {fill.total} slides{fill.error ? `: ${fill.error}` : "."} Slides that say &ldquo;Writing this slide&hellip;&rdquo; weren&rsquo;t finished; the Review tab lists them.</span>
          )}
        </div>
      )}
      {notice && (
        <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-2 text-[13px]" role="status">
          {notice}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}
      {pending && (
        <div className="flex flex-wrap items-center gap-3 border-b border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_7%,var(--surface))] px-4 py-2 text-[13px]" role="status">
          <span className="font-medium">Reviewing a suggestion on {pending.changedSlideIds.length} slide{pending.changedSlideIds.length === 1 ? "" : "s"}.</span>
          <span className="text-ink-2">Changed slides have a dashed outline.</span>
          <span className="ml-auto flex gap-2">
            <button type="button" className="btn btn-secondary btn-sm min-h-8" onClick={discard}>Discard <Kbd>Esc</Kbd></button>
            <button type="button" className="btn btn-primary btn-sm min-h-8" onClick={accept}>Accept <span className="opacity-80">Ctrl Enter</span></button>
          </span>
        </div>
      )}

      {historyOpen ? (
        <HistoryView
          deck={deck}
          saveState={ed.saveState}
          onClose={() => setHistoryOpen(false)}
          onRestore={(target, label) => {
            const ok = commit(restoreOps(deck, target), { label: `Restore ${label}` });
            if (ok) {
              setSlideIndex(0);
              setSelectedId(null);
              setNotice(`Restored "${label}". Undo (Ctrl Z) goes back, and the deck as it was is saved in version history.`);
            }
            return ok;
          }}
        />
      ) : (
      <div className="flex min-h-0 flex-1">
        {railOpen && !grid && <SlideRail {...railProps} />}

        {grid ? (
          <SlideGrid {...railProps} onClose={() => setGrid(false)} />
        ) : (
          <main className="relative flex min-w-0 flex-1 flex-col bg-[color-mix(in_srgb,var(--ink)_4%,var(--canvas))]">
            {find && (
              <FindReplace
                deck={shown}
                locked={!!pending}
                showReplace={find === "replace"}
                onShowReplace={(v) => setFind(v ? "replace" : "find")}
                onClose={() => setFind(null)}
                commit={commit}
                onGo={(i, elId) => {
                  setPlaying(false);
                  setSlideIndex(i);
                  setSelectedIds(elId ? [elId] : []);
                  if (!elId) setNotesOpen(true);
                }}
              />
            )}
            {/* Insert toolbar */}
            <div className="flex h-14 shrink-0 items-center justify-center px-4">
              {editable && !playing ? (
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
                      setInspectorOpen(true);
                    }
                  }}
                />
              ) : playing ? (
                <div className="flex items-center gap-3 rounded-full border border-line bg-surface px-4 py-1.5 text-[13px] shadow-[0_1px_2px_rgba(16,17,20,.06)]">
                  <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
                  Previewing builds
                  <button type="button" className="btn btn-secondary btn-sm min-h-7 px-2.5 text-[12px]" onClick={() => setPlaying(false)}>Stop and edit</button>
                </div>
              ) : null}
            </div>

            {/* Canvas */}
            <div ref={attachCanvas} className="relative min-h-0 flex-1 overflow-auto" onPointerDown={(e) => e.target === e.currentTarget && setSelectedId(null)}>
              <div className="flex min-h-full min-w-full items-center justify-center p-8" style={{ width: zoom === "fit" ? undefined : canvasWidth + 64 }} onPointerDown={(e) => e.target === e.currentTarget && setSelectedId(null)}>
                <div className={`relative flex-none rounded-[6px] ${changedHere ? "outline-[3px] outline-dashed outline-offset-8 outline-accent" : ""}`} style={{ width: canvasWidth }}>
                  {slide.hidden && !changedHere && (
                    <span className="absolute -top-9 left-0 inline-flex items-center gap-2 rounded-[8px] border border-line bg-surface px-2 py-1 text-[12px] text-ink-2 shadow-sm">
                      <EyeOff size={13} aria-hidden="true" />
                      Hidden from presenting, sharing and downloads
                      {editable && <button type="button" className="font-medium text-accent hover:underline" onClick={() => toggleHidden(si)}>Show</button>}
                    </span>
                  )}
                  {changedHere && <span className="absolute -top-9 right-0 rounded-[6px] bg-accent px-2 py-1 text-[12px] font-medium text-white">Suggested</span>}
                  <div className="rounded-[6px] shadow-[0_1px_3px_rgba(16,17,20,.08),0_12px_32px_-12px_rgba(16,17,20,.22)] [&_[data-canvas]>div:first-child]:rounded-[6px]">
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
                        if (ids.length) setTab((t) => ((t === "ask" || t === "comments" || t === "review") && ids.length === 1 ? t : "design"));
                      }}
                      commit={commit}
                      onEditText={editText}
                      onEditItem={editItem}
                      onSelectionFrame={setSelectionFrame}
                      label={`Slide ${slideIndex + 1} canvas`}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom bar */}
            <div className="flex h-11 shrink-0 items-center gap-2 border-t border-line bg-surface px-3 text-[12px]">
              <button type="button" className={`btn btn-sm min-h-8 gap-1.5 px-2.5 ${playing ? "btn-secondary" : "btn-ghost"}`} onClick={playing ? () => setPlaying(false) : play} title="Play this slide (Ctrl P)">
                {playing ? <Square size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
                {playing ? "Stop" : "Play slide"}
              </button>
              {steps > 1 && (
                <div className="flex items-center gap-1.5" role="group" aria-label="Build steps">
                  <span className="text-ink-2">Builds</span>
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
                      className={`h-2 rounded-full transition-all ${playing && k <= step ? "w-4 bg-accent" : "w-2 bg-line hover:bg-ink-2"}`}
                    />
                  ))}
                </div>
              )}

              <div className="mx-auto flex items-center gap-1">
                <IconButton label="Previous slide" shortcut="↑" onClick={() => goTo(slideIndex - 1)} disabled={slideIndex === 0}>
                  <ChevronLeft size={16} aria-hidden="true" />
                </IconButton>
                <span className="tabular min-w-[64px] text-center text-ink-2">
                  <b className="font-semibold text-ink">{slideIndex + 1}</b> / {total}
                </span>
                <IconButton label="Next slide" shortcut="↓" onClick={() => goTo(slideIndex + 1)} disabled={slideIndex >= total - 1}>
                  <ChevronRight size={16} aria-hidden="true" />
                </IconButton>
              </div>

              <button type="button" className={`btn btn-sm min-h-8 gap-1.5 px-2.5 ${notesOpen ? "btn-secondary" : "btn-ghost"}`} aria-expanded={notesOpen} aria-controls="speaker-notes" onClick={() => setNotesOpen((o) => !o)}>
                <StickyNote size={14} aria-hidden="true" />
                Notes
              </button>
              <div className="flex items-center rounded-[8px] border border-line" role="group" aria-label="Zoom">
                <IconButton label="Zoom out" shortcut="Ctrl −" onClick={() => zoomBy(-1)} className="h-7 w-7">
                  <Minus size={14} aria-hidden="true" />
                </IconButton>
                <DropMenu
                  align="right"
                  side="top"
                  width="w-[150px]"
                  label="Zoom level"
                  trigger={({ toggle, open }) => (
                    <button type="button" onClick={toggle} aria-expanded={open} className="tabular h-7 min-w-[52px] px-1 text-[12px] font-medium hover:bg-[color-mix(in_srgb,var(--ink)_6%,transparent)]" aria-label={`Zoom ${pct}%`}>
                      {pct}%
                    </button>
                  )}
                >
                  {(close) => (
                    <>
                      <button type="button" role="menuitem" className={menuItem} onClick={() => (close(), setZoom("fit"))}>
                        <Maximize2 size={13} className="text-ink-2" aria-hidden="true" />Fit to window
                      </button>
                      {ZOOMS.map((z) => (
                        <button key={z} type="button" role="menuitem" className={`${menuItem} tabular`} onClick={() => (close(), setZoom(z))}>
                          <span className="w-[13px]" aria-hidden="true">{zoom === z ? <Check size={13} /> : null}</span>
                          {Math.round(z * 100)}%
                        </button>
                      ))}
                    </>
                  )}
                </DropMenu>
                <IconButton label="Zoom in" shortcut="Ctrl +" onClick={() => zoomBy(1)} className="h-7 w-7">
                  <Plus size={14} aria-hidden="true" />
                </IconButton>
              </div>
            </div>

            {/* Speaker notes */}
            {notesOpen && (
              <section id="speaker-notes" className="shrink-0 border-t border-line bg-surface px-4 pb-3 pt-2.5" aria-label="Speaker notes">
                <div className="mb-1.5 flex items-center justify-between text-[12px]">
                  <span className="font-semibold">Speaker notes · slide {slideIndex + 1}</span>
                  <span className="tabular text-ink-2">{slide.notes.trim() ? `${slide.notes.trim().split(/\s+/).length} words · about ${Math.max(1, Math.round(slide.notes.trim().split(/\s+/).length / 2.5))} s to say` : "Only you see these while presenting"}</span>
                </div>
                <NotesEditor key={slide.id + (pending ? "-p" : "")} value={slide.notes} disabled={!editable} onCommit={(v) => commit([{ op: "replace", path: `/slides/${si}/notes`, value: v.slice(0, 5000) }], { label: "Edit notes" })} />
              </section>
            )}
          </main>
        )}

        {/* Inspector */}
        {inspectorOpen && !grid && (
          <aside className="flex w-[320px] shrink-0 flex-col border-l border-line bg-surface" aria-label="Inspector">
            <div className="p-2.5">
              <div role="tablist" aria-label="Inspector" className="grid grid-cols-5 gap-0.5 rounded-[10px] bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] p-0.5">
                {TABS.map((t) => {
                  const Icon = t.icon;
                  const on = tab === t.id;
                  const badge = t.id === "comments" ? comments.openCount : t.id === "review" ? reviewCount : 0;
                  return (
                    <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={on} aria-controls={`panel-${t.id}`} onClick={() => setTab(t.id)} className={`relative flex h-11 flex-col items-center justify-center gap-0.5 rounded-[8px] text-[11px] font-medium transition-colors ${on ? "bg-surface text-ink shadow-[0_1px_2px_rgba(16,17,20,.1)]" : "text-ink-2 hover:text-ink"}`}>
                      <Icon size={15} aria-hidden="true" />
                      {t.label}
                      {badge > 0 && <span className="tabular absolute right-1 top-1 min-w-[16px] rounded-full bg-accent px-1 text-[10px] leading-[16px] text-white" aria-label={`${badge} open`}>{badge > 99 ? "99+" : badge}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
            <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-2">
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
              {tab === "review" && (
                <ReviewPanel deck={deck} theme={deckTheme(deck)} deckKey={String(rev)} locked={!!pending} proposal={proposal} commit={commit} onGo={goToElement} onPropose={(p) => (setNotice(null), setPlaying(false), setProposal(p))} onAccept={accept} onDiscard={discard} />
              )}
              {tab === "comments" && <CommentsPanel deck={deck} slideIndex={Math.max(0, si)} selected={selected} api={comments} onGo={goToElement} />}
            </div>
          </aside>
        )}
      </div>
      )}

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title="Keyboard shortcuts">
        <p className="mb-4 text-[13px] text-ink-2">Click an element to select it, click again to type, drag to move. Drag on empty space to select several. On a Mac, use ⌘ for Ctrl.</p>
        <dl className="grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
          {SHORTCUTS.map(([what, keys]) => (
            <div key={what} className="flex items-center justify-between gap-3 border-b border-line pb-2 text-[13px]">
              <dt>{what}</dt>
              <dd className="flex flex-none gap-1">{keys.map((k) => <Kbd key={k}>{k}</Kbd>)}</dd>
            </div>
          ))}
        </dl>
      </Modal>
      {copyFrom !== null && <CopyToDeckDialog open onClose={() => setCopyFrom(null)} deck={deck} slideIndex={Math.min(copyFrom, deck.slides.length - 1)} />}
      <ImportSlidesDialog open={importOpen} onClose={() => setImportOpen(false)} deck={deck} onInsert={insertSlides} />
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
      className="field min-h-[64px] resize-y py-2 text-[14px] leading-[21px]"
      rows={2}
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
