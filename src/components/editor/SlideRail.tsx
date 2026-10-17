"use client";

// Left slide rail and the full-screen slide grid ("Grid view") of the deck editor.
import { useState, type DragEvent } from "react";
import { ArrowDown, ArrowUp, Copy, CopyPlus, Eye, EyeOff, FolderInput, LayoutGrid, MessageSquare, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { SlideView } from "@/components/deck/SlideView";
import { NEW_SLIDES } from "@/lib/deck/starters";
import type { Deck, Slide } from "@/lib/deck/schema";
import type { Theme } from "@/lib/deck/themes";
import { DropMenu, MenuSep, menuItem } from "./ui";

export { NEW_SLIDES };

export function NewSlideMenu({ theme, intensity, onAdd, onDuplicate, onImport, disabled, align = "left", full = false }: { theme: Theme; intensity: Deck["motionIntensity"]; onAdd: (s: Slide, label: string) => void; onDuplicate: () => void; onImport?: () => void; disabled?: boolean; align?: "left" | "right"; full?: boolean }) {
  return (
    <DropMenu
      align={align}
      width="w-[392px]"
      label="New slide"
      trigger={({ toggle, open }) => (
        <button type="button" onClick={toggle} disabled={disabled} aria-expanded={open} aria-haspopup="menu" className={`btn btn-secondary btn-sm min-h-8 gap-1.5 ${full ? "w-full" : ""}`}>
          <Plus size={15} aria-hidden="true" />
          New slide
        </button>
      )}
    >
      {(close) => (
        <div className="p-1">
          <p className="px-1 pb-2 text-[12px] font-medium text-ink-2">Choose a starting layout</p>
          <div className="grid grid-cols-3 gap-2">
            {NEW_SLIDES.map((n) => (
              <button
                key={n.id}
                type="button"
                role="menuitem"
                className="group rounded-[8px] p-1 text-left hover:bg-[color-mix(in_srgb,var(--ink)_6%,transparent)]"
                onClick={() => {
                  close();
                  onAdd(n.make(), `Add ${n.name.toLowerCase()} slide`);
                }}
              >
                <span className="block overflow-hidden rounded-[5px] border border-line group-hover:border-ink-2">
                  <SlideView slide={PREVIEWS[n.id]} theme={theme} intensity={intensity} mode="static" />
                </span>
                <span className="mt-1 block truncate text-[12px]">{n.name}</span>
              </button>
            ))}
          </div>
          <MenuSep />
          <button type="button" role="menuitem" className={menuItem} onClick={() => (close(), onDuplicate())}>
            <Copy size={14} aria-hidden="true" className="text-ink-2" /> Duplicate current slide
          </button>
          {onImport && (
            <button type="button" role="menuitem" className={menuItem} onClick={() => (close(), onImport())}>
              <FolderInput size={14} aria-hidden="true" className="text-ink-2" /> Reuse slides from another deck
            </button>
          )}
        </div>
      )}
    </DropMenu>
  );
}

// Built once so menu previews don't get new ids on every render.
const PREVIEWS: Record<string, Slide> = Object.fromEntries(NEW_SLIDES.map((n) => [n.id, n.make()]));

type RailProps = {
  deck: Deck;
  slides: Slide[];
  theme: Theme;
  current: number;
  locked: boolean;
  changedIds?: string[];
  /** Open comment threads per slide id. */
  commentCounts?: Record<string, number>;
  onSelect: (i: number) => void;
  onMove: (from: number, to: number) => void;
  onDuplicate: (i: number) => void;
  onRemove: (i: number) => void;
  onAdd: (s: Slide, label: string) => void;
  onToggleHidden: (i: number) => void;
  onCopyTo: (i: number) => void;
  onImport: () => void;
};

type Actions = Pick<RailProps, "onMove" | "onDuplicate" | "onRemove" | "onToggleHidden" | "onCopyTo">;

function SlideActions({ i, n, hidden, a }: { i: number; n: number; hidden: boolean; a: Actions }) {
  const { onMove, onDuplicate, onRemove } = a;
  return (
    <DropMenu
      align="left"
      label={`Slide ${i + 1} actions`}
      trigger={({ toggle, open }) => (
        <button
          type="button"
          onClick={toggle}
          aria-label={`Slide ${i + 1} actions`}
          aria-expanded={open}
          className={`flex h-6 w-6 items-center justify-center rounded-[6px] border border-line bg-surface text-ink-2 shadow-sm hover:text-ink ${open ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"}`}
        >
          <MoreHorizontal size={14} aria-hidden="true" />
        </button>
      )}
    >
      {(close) => (
        <>
          <button type="button" role="menuitem" className={menuItem} onClick={() => (close(), onDuplicate(i))}><Copy size={14} className="text-ink-2" aria-hidden="true" />Duplicate</button>
          <button type="button" role="menuitem" className={menuItem} onClick={() => (close(), a.onCopyTo(i))}><CopyPlus size={14} className="text-ink-2" aria-hidden="true" />Copy to another deck</button>
          <button type="button" role="menuitem" className={menuItem} onClick={() => (close(), a.onToggleHidden(i))}>
            {hidden ? <Eye size={14} className="text-ink-2" aria-hidden="true" /> : <EyeOff size={14} className="text-ink-2" aria-hidden="true" />}
            {hidden ? "Show slide" : "Hide slide"}
          </button>
          <button type="button" role="menuitem" className={menuItem} disabled={i === 0} onClick={() => (close(), onMove(i, i - 1))}><ArrowUp size={14} className="text-ink-2" aria-hidden="true" />Move up</button>
          <button type="button" role="menuitem" className={menuItem} disabled={i === n - 1} onClick={() => (close(), onMove(i, i + 1))}><ArrowDown size={14} className="text-ink-2" aria-hidden="true" />Move down</button>
          <MenuSep />
          <button type="button" role="menuitem" className={`${menuItem} text-danger`} disabled={n <= 1} onClick={() => (close(), onRemove(i))}><Trash2 size={14} aria-hidden="true" />Delete slide</button>
        </>
      )}
    </DropMenu>
  );
}

function HiddenBadge() {
  return (
    <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-[5px] bg-[rgba(16,17,20,.78)] px-1.5 py-0.5 text-[10px] font-medium text-white" title="Hidden: skipped when presenting, sharing and downloading">
      <EyeOff size={10} aria-hidden="true" />
      Hidden
    </span>
  );
}

function useDrag(onMove: RailProps["onMove"], locked: boolean) {
  const [from, setFrom] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  return {
    over,
    from,
    props: (i: number) => ({
      draggable: !locked,
      onDragStart: (e: DragEvent) => {
        setFrom(i);
        e.dataTransfer.effectAllowed = "move";
      },
      onDragOver: (e: DragEvent) => {
        if (from === null) return;
        e.preventDefault();
        setOver(i);
      },
      onDragEnd: () => {
        setFrom(null);
        setOver(null);
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        if (from !== null) onMove(from, i);
        setFrom(null);
        setOver(null);
      },
    }),
  };
}

function CommentBadge({ n }: { n: number }) {
  return (
    <span className="tabular absolute bottom-1.5 right-1.5 inline-flex items-center gap-0.5 rounded-[5px] bg-accent px-1.5 py-0.5 text-[10px] font-medium text-white" title={`${n} open comment${n === 1 ? "" : "s"}`}>
      <MessageSquare size={10} aria-hidden="true" />
      {n}
    </span>
  );
}

export function SlideRail({ deck, slides, theme, current, locked, changedIds = [], commentCounts = {}, onSelect, onMove, onDuplicate, onRemove, onAdd, onToggleHidden, onCopyTo, onImport }: RailProps) {
  const drag = useDrag(onMove, locked);
  const actions: Actions = { onMove, onDuplicate, onRemove, onToggleHidden, onCopyTo };
  return (
    <nav aria-label="Slides" className="flex w-[212px] shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex items-center justify-between px-3 pb-2 pt-3">
        <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-2">Slides <span className="tabular font-normal normal-case tracking-normal">{slides.length}</span></span>
      </div>
      <div className="px-3 pb-3">
        <NewSlideMenu theme={theme} intensity={deck.motionIntensity} onAdd={onAdd} onDuplicate={() => onDuplicate(current)} onImport={onImport} disabled={locked} full />
      </div>
      <ol className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2 pb-4">
        {slides.map((s, i) => {
          const active = i === current;
          const changed = changedIds.includes(s.id);
          const dropHere = drag.over === i && drag.from !== null && drag.from !== i;
          return (
            <li key={s.id} {...drag.props(i)} className={`group relative rounded-[10px] p-1.5 ${active ? "bg-[color-mix(in_srgb,var(--accent)_9%,transparent)]" : "hover:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]"} ${drag.from === i ? "opacity-40" : ""}`}>
              {dropHere && <span className={`absolute inset-x-2 h-0.5 rounded-full bg-accent ${(drag.from ?? 0) < i ? "-bottom-1" : "-top-1"}`} aria-hidden="true" />}
              <div className="flex gap-1.5">
                <span className={`tabular w-4 flex-none pt-0.5 text-right text-[11px] ${active ? "font-semibold text-accent" : "text-ink-2"}`}>{i + 1}</span>
                <button
                  type="button"
                  onClick={() => onSelect(i)}
                  onKeyDown={(e) => {
                    if (locked) return;
                    if ((e.key === "Delete" || e.key === "Backspace") && slides.length > 1) {
                      e.preventDefault();
                      onRemove(i);
                    }
                  }}
                  aria-current={active ? "true" : undefined}
                  aria-label={`Slide ${i + 1}${s.hidden ? " (hidden)" : ""}${changed ? " (suggested change)" : ""}${commentCounts[s.id] ? ` (${commentCounts[s.id]} open comments)` : ""}`}
                  className={`relative block w-full overflow-hidden rounded-[6px] border bg-surface transition-shadow ${active ? "border-accent ring-2 ring-[color-mix(in_srgb,var(--accent)_30%,transparent)]" : changed ? "border-dashed border-accent" : "border-line"}`}
                >
                  <span className={`block ${s.hidden ? "opacity-45" : ""}`}><SlideView slide={s} theme={theme} intensity={deck.motionIntensity} mode="static" /></span>
                  {s.hidden && <HiddenBadge />}
                  {!!commentCounts[s.id] && <CommentBadge n={commentCounts[s.id]} />}
                </button>
              </div>
              {!locked && (
                <div className="absolute right-2.5 top-2.5">
                  <SlideActions i={i} n={slides.length} hidden={!!s.hidden} a={actions} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Every slide at a glance: click to open, drag to reorder. */
export function SlideGrid({ deck, slides, theme, current, locked, onSelect, onMove, onDuplicate, onRemove, onAdd, onToggleHidden, onCopyTo, onImport, onClose }: RailProps & { onClose: () => void }) {
  const drag = useDrag(onMove, locked);
  const actions: Actions = { onMove, onDuplicate, onRemove, onToggleHidden, onCopyTo };
  const hidden = slides.filter((s) => s.hidden).length;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
      <div className="mx-auto max-w-[1280px]">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-[17px] font-semibold"><LayoutGrid size={17} aria-hidden="true" />All slides</h2>
            <p className="mt-0.5 text-[13px] text-ink-2">{slides.length} slides{hidden ? `, ${hidden} hidden` : ""}. Drag to reorder, click a slide to edit it.</p>
          </div>
          <div className="flex items-center gap-2">
            <NewSlideMenu theme={theme} intensity={deck.motionIntensity} onAdd={onAdd} onDuplicate={() => onDuplicate(current)} onImport={onImport} disabled={locked} align="right" />
            <button type="button" className="btn btn-primary btn-sm min-h-8" onClick={onClose}>Back to editing</button>
          </div>
        </div>
        <ol className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">
          {slides.map((s, i) => (
            <li key={s.id} {...drag.props(i)} className={`group relative ${drag.from === i ? "opacity-40" : ""}`}>
              <button
                type="button"
                onClick={() => {
                  onSelect(i);
                  onClose();
                }}
                aria-label={`Edit slide ${i + 1}`}
                className={`block w-full overflow-hidden rounded-[10px] border-2 bg-surface shadow-[0_1px_2px_rgba(16,17,20,.06)] transition-shadow hover:shadow-[0_8px_24px_-8px_rgba(16,17,20,.2)] ${drag.over === i && drag.from !== i ? "border-accent" : i === current ? "border-accent" : "border-transparent"}`}
              >
                <span className={`relative block ${s.hidden ? "opacity-45" : ""}`}><SlideView slide={s} theme={theme} intensity={deck.motionIntensity} mode="static" /></span>
                {s.hidden && <HiddenBadge />}
              </button>
              <div className="mt-2 flex items-center justify-between text-[12px] text-ink-2">
                <span className="tabular">{i + 1}{s.hidden ? " · hidden" : ""}</span>
                {s.notes.trim() && <span className="truncate pl-3">Has notes</span>}
              </div>
              {!locked && (
                <div className="absolute right-2 top-2">
                  <SlideActions i={i} n={slides.length} hidden={!!s.hidden} a={actions} />
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
