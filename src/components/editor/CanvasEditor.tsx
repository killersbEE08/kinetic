"use client";

// Hand editing on the slide: click to select, drag to move (with snap guides), drag handles to
// resize, click a selected box again to type. Arrow keys nudge, Delete removes, Ctrl+D duplicates,
// Ctrl+C / Ctrl+V copy between slides. Every change is one undoable patch.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { SlideView } from "@/components/deck/SlideView";
import type { Deck, Element, ElStyle, Frame, Intensity, Slide } from "@/lib/deck/schema";
import type { Theme } from "@/lib/deck/themes";
import type { PatchOp } from "@/lib/deck/patch";
import { duplicateElement, HANDLES, keepsRatio, resizeFrame, round, snapMove, snapTargets, type Guides, type Handle } from "@/lib/deck/canvas";
import { parseColor } from "@/lib/export/scene";

type Commit = (ops: PatchOp[], opts: { label: string }) => boolean;

const TEXT_BEARING = new Set<Element["type"]>(["text", "bullets", "shape", "table"]);
let clipboard: Element | null = null;

/** The slide stage inside the editor canvas (there is only one on the page). */
const stageEl = () => document.querySelector<HTMLElement>("[data-canvas] .k-stage");

/** An element's current box in slide units, measured from the rendered slide. */
export function measureElement(id: string): Frame | null {
  const stage = stageEl();
  const node = stage?.querySelector<HTMLElement>(`[data-el="${CSS.escape(id)}"]`);
  if (!stage || !node) return null;
  const s = stage.getBoundingClientRect();
  const r = node.getBoundingClientRect();
  const scale = s.width / 1920;
  if (!scale) return null;
  return { x: (r.left - s.left) / scale, y: (r.top - s.top) / scale, w: r.width / scale, h: r.height / scale };
}

/**
 * When a layout element is first moved, its look comes from layout-specific CSS. Capture the
 * rendered size and colour so it looks the same once it's placed by hand.
 */
export function captureLayoutStyle(el: Element): ElStyle | undefined {
  if (el.type !== "text" || el.style) return undefined;
  const node = stageEl()?.querySelector<HTMLElement>(`[data-el="${CSS.escape(el.id)}"]`);
  if (!node) return undefined;
  const cs = getComputedStyle(node);
  const size = parseFloat(cs.fontSize);
  const lh = cs.lineHeight === "normal" ? undefined : parseFloat(cs.lineHeight) / size;
  const color = parseColor(cs.color);
  return { fontSize: Math.round(size), ...(lh ? { lineHeight: Math.round(lh * 100) / 100 } : {}), ...(color.alpha > 0.5 ? { color: "#" + color.hex } : {}) };
}

/** Ops that place `el` (index `ei` on slide `si`) at `frame`, capturing its look the first time. */
export function frameOps(si: number, ei: number, el: Element, frame: Frame): PatchOp[] {
  const ops: PatchOp[] = [{ op: "add", path: `/slides/${si}/elements/${ei}/frame`, value: round(frame) }];
  const style = !el.frame ? captureLayoutStyle(el) : undefined;
  if (style) ops.push({ op: "add", path: `/slides/${si}/elements/${ei}/style`, value: style });
  return ops;
}

function placeCaret(x: number, y: number, root: HTMLElement | null) {
  if (!root) return;
  const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  let range: Range | null = null;
  if (doc.caretPositionFromPoint) {
    const p = doc.caretPositionFromPoint(x, y);
    if (p) {
      range = document.createRange();
      range.setStart(p.offsetNode, p.offset);
    }
  } else if (document.caretRangeFromPoint) range = document.caretRangeFromPoint(x, y);
  const target = (range?.startContainer.parentElement?.closest("[data-edit-text]") as HTMLElement | null) ?? root.querySelector<HTMLElement>("[data-edit-text]");
  if (!target || !root.contains(target)) return;
  target.focus();
  const sel = window.getSelection();
  if (!sel) return;
  if (range && target.contains(range.startContainer)) {
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    const r = document.createRange();
    r.selectNodeContents(target);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
  }
}

interface Gesture {
  id: string;
  mode: "move" | Handle;
  sx: number;
  sy: number;
  start: Frame;
  moved: boolean;
  wasSelected: boolean;
  targets: Guides;
  keepRatio: boolean;
}

export function CanvasEditor({
  deck,
  slideIndex,
  slide,
  theme,
  intensity,
  editable,
  playing,
  step,
  playKey,
  page,
  selectedId,
  onSelect,
  commit,
  onEditText,
  onEditItem,
  onSelectionFrame,
  label,
}: {
  deck: Deck;
  slideIndex: number;
  slide: Slide;
  theme: Theme;
  intensity: Intensity;
  editable: boolean;
  playing: boolean;
  step: number;
  playKey: string;
  page: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  commit: Commit;
  onEditText: (id: string, v: string) => void;
  onEditItem: (id: string, i: number, v: string) => void;
  onSelectionFrame: (f: Frame | null) => void;
  label: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [draft, setDraft] = useState<{ id: string; frame: Frame; style?: ElStyle } | null>(null);
  const [guides, setGuides] = useState<Guides>({ x: [], y: [] });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [box, setBox] = useState<Frame | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const interactive = editable && !playing;
  const si = slideIndex;

  // Stop typing when the selection moves elsewhere.
  const [seenSel, setSeenSel] = useState(selectedId);
  if (seenSel !== selectedId) {
    setSeenSel(selectedId);
    if (editingId && editingId !== selectedId) setEditingId(null);
  }

  const shown = useMemo<Slide>(() => {
    if (!draft) return slide;
    return { ...slide, elements: slide.elements.map((e) => (e.id === draft.id ? { ...e, frame: draft.frame, style: e.style ?? draft.style } : e)) };
  }, [slide, draft]);

  const selected = slide.elements.find((e) => e.id === selectedId) ?? null;

  // Keep the selection box in sync with the rendered slide.
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const update = () => {
      setScale(el.clientWidth / 1920);
      const f = draft?.frame ?? (selectedId ? measureElement(selectedId) : null);
      setBox(f);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    const t = setTimeout(update, 60); // after images and fonts settle
    return () => {
      ro.disconnect();
      clearTimeout(t);
    };
  }, [shown, selectedId, draft]);

  useEffect(() => {
    onSelectionFrame(selectedId && !draft ? box : null);
  }, [box, selectedId, draft, onSelectionFrame]);

  const indexOf = useCallback((id: string) => deck.slides[si]?.elements.findIndex((e) => e.id === id) ?? -1, [deck, si]);

  const startEditing = useCallback((id: string, x: number, y: number) => {
    setEditingId(id);
    requestAnimationFrame(() => requestAnimationFrame(() => placeCaret(x, y, stageEl()?.querySelector<HTMLElement>(`[data-el="${CSS.escape(id)}"]`) ?? null)));
  }, []);

  // --- Pointer gestures --------------------------------------------------------
  const onPointerDown = (e: React.PointerEvent) => {
    if (!interactive || e.button !== 0) return;
    const target = e.target as HTMLElement;
    const handle = target.closest<HTMLElement>("[data-handle]")?.dataset.handle as Handle | undefined;
    const node = target.closest<HTMLElement>("[data-el]");
    const id = handle ? selectedId : node?.dataset.el;
    if (!id) return; // empty slide area: the stage's own click handler clears the selection
    if (!handle && editingId === id) return; // typing: let the caret move
    const el = slide.elements.find((x) => x.id === id);
    if (!el) return;
    e.preventDefault();
    const active = document.activeElement as HTMLElement | null;
    if (active?.isContentEditable) active.blur();
    const start = measureElement(id) ?? el.frame;
    if (!start) return;
    const others: Frame[] = slide.elements.filter((x) => x.id !== id).map((x) => measureElement(x.id)).filter((f): f is Frame => !!f);
    gesture.current = { id, mode: handle ?? "move", sx: e.clientX, sy: e.clientY, start, moved: false, wasSelected: selectedId === id, targets: snapTargets(others), keepRatio: keepsRatio(el) };
    if (selectedId !== id) onSelect(id);
    if (editingId && editingId !== id) setEditingId(null);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || !scale) return;
    const dx = (e.clientX - g.sx) / scale;
    const dy = (e.clientY - g.sy) / scale;
    if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 4) return;
    g.moved = true;
    const el = slide.elements.find((x) => x.id === g.id);
    if (!el) return;
    const threshold = 7 / scale;
    let next: Frame;
    if (g.mode === "move") {
      const snapped = e.altKey ? { frame: { ...g.start, x: g.start.x + dx, y: g.start.y + dy }, guides: { x: [], y: [] } } : snapMove({ ...g.start, x: g.start.x + dx, y: g.start.y + dy }, g.targets, threshold);
      next = snapped.frame;
      setGuides(snapped.guides);
    } else {
      next = resizeFrame(g.start, g.mode, dx, dy, g.keepRatio !== e.shiftKey);
      setGuides({ x: [], y: [] });
    }
    setDraft({ id: g.id, frame: next, style: !el.frame ? captureLayoutStyle(el) : undefined });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    setGuides({ x: [], y: [] });
    if (!g) return;
    const el = slide.elements.find((x) => x.id === g.id);
    const ei = indexOf(g.id);
    if (g.moved && draft && el && ei >= 0) {
      commit(frameOps(si, ei, el, draft.frame), { label: g.mode === "move" ? "Move" : "Resize" });
      setDraft(null);
      return;
    }
    setDraft(null);
    // A click (no drag) on an already selected box starts typing.
    if (!g.moved && g.wasSelected && g.mode === "move" && el && TEXT_BEARING.has(el.type)) startEditing(g.id, e.clientX, e.clientY);
  };

  // Leave typing mode when focus leaves the box being edited.
  const onBlurCapture = (e: React.FocusEvent) => {
    if (!editingId) return;
    const next = e.relatedTarget as Node | null;
    const node = stageEl()?.querySelector(`[data-el="${CSS.escape(editingId)}"]`);
    if (!next || !node?.contains(next)) setTimeout(() => setEditingId((cur) => (cur === editingId && !node?.contains(document.activeElement) ? null : cur)), 0);
  };

  // --- Keyboard ----------------------------------------------------------------
  useEffect(() => {
    if (!interactive) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (t?.closest("dialog")) return;
      const mod = e.ctrlKey || e.metaKey;
      const sel = selectedId ? slide.elements.find((x) => x.id === selectedId) : null;
      const ei = sel ? indexOf(sel.id) : -1;

      if (mod && e.key.toLowerCase() === "v" && clipboard) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (slide.elements.length >= 60) return;
        const base = clipboard.frame ?? { x: 760, y: 440, w: 400, h: 200 };
        const copy = duplicateElement(clipboard, base);
        if (commit([{ op: "add", path: `/slides/${si}/elements/-`, value: copy }], { label: "Paste" })) {
          clipboard = { ...clipboard, frame: copy.frame };
          onSelect(copy.id);
        }
        return;
      }
      if (!sel || ei < 0) return;
      const frame = sel.frame ?? measureElement(sel.id);

      if (mod && e.key.toLowerCase() === "c") {
        e.stopImmediatePropagation();
        clipboard = structuredClone({ ...sel, frame: frame ?? undefined });
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!frame || slide.elements.length >= 60) return;
        const copy = duplicateElement(sel, frame);
        if (commit([{ op: "add", path: `/slides/${si}/elements/-`, value: copy }], { label: "Duplicate" })) onSelect(copy.id);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        e.stopImmediatePropagation();
        commit([{ op: "remove", path: `/slides/${si}/elements/${ei}` }], { label: "Delete element" });
        onSelect(null);
        return;
      }
      if (e.key === "Enter" && TEXT_BEARING.has(sel.type)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const r = stageEl()?.querySelector(`[data-el="${CSS.escape(sel.id)}"]`)?.getBoundingClientRect();
        if (r) startEditing(sel.id, r.right - 2, r.bottom - 2);
        return;
      }
      const dirs: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const d = dirs[e.key];
      if (d && frame && !mod) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const n = e.shiftKey ? 10 : 1;
        commit(frameOps(si, ei, sel, { ...frame, x: frame.x + d[0] * n, y: frame.y + d[1] * n }), { label: "Nudge" });
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [interactive, selectedId, slide, si, indexOf, commit, onSelect, startEditing]);

  const editField = useCallback(
    (id: string, field: string, value: string) => {
      const ei = indexOf(id);
      if (ei < 0) return;
      commit([{ op: "replace", path: `/slides/${si}/elements/${ei}/${field}`, value }], { label: field === "text" ? "Edit shape text" : "Edit table" });
    },
    [indexOf, si, commit],
  );

  const handles = selected && selected.type !== "mockup" ? (selected.type === "shape" && (selected.shape === "line" || selected.shape === "arrow") ? (["w", "e"] as Handle[]) : HANDLES) : [];

  return (
    <div
      ref={wrap}
      data-canvas=""
      className="relative touch-none select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        gesture.current = null;
        setDraft(null);
        setGuides({ x: [], y: [] });
      }}
      onBlurCapture={onBlurCapture}
    >
      <SlideView
        slide={shown}
        theme={theme}
        intensity={intensity}
        mode={playing ? "play" : "static"}
        step={step}
        playKey={playKey}
        editable={interactive}
        page={page}
        showSuggested
        selectedId={null}
        editingId={editingId}
        onSelect={(id) => {
          if (!gesture.current) onSelect(id);
        }}
        onEditText={onEditText}
        onEditItem={onEditItem}
        onEditField={editField}
        label={label}
      />
      {interactive && scale > 0 && (
        <div className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden="true">
          {guides.x.map((x) => <div key={`gx${x}`} className="absolute bottom-0 top-0 w-px bg-[#e5007a]" style={{ left: x * scale }} />)}
          {guides.y.map((y) => <div key={`gy${y}`} className="absolute left-0 right-0 h-px bg-[#e5007a]" style={{ top: y * scale }} />)}
          {selected && box && (
            <div className={`absolute ${editingId === selected.id ? "border-2 border-dashed border-accent" : "border-2 border-accent"}`} style={{ left: box.x * scale - 1, top: box.y * scale - 1, width: box.w * scale + 2, height: box.h * scale + 2 }}>
              {draft && <span className="tabular absolute -top-7 left-0 whitespace-nowrap rounded-[4px] bg-accent px-1.5 py-0.5 text-[11px] font-medium text-white">{Math.round(box.w)} × {Math.round(box.h)}</span>}
              {editingId !== selected.id &&
                handles.map((h) => (
                  <span
                    key={h}
                    data-handle={h}
                    className="pointer-events-auto absolute h-3 w-3 rounded-[2px] border-2 border-accent bg-white"
                    style={{
                      left: h.includes("w") ? -7 : h.includes("e") ? "calc(100% - 5px)" : "calc(50% - 6px)",
                      top: h.includes("n") ? -7 : h.includes("s") ? "calc(100% - 5px)" : "calc(50% - 6px)",
                      cursor: `${h}-resize`,
                    }}
                  />
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
