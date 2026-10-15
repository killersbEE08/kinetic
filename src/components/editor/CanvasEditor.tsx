"use client";

// Hand editing on the slide.
//   Click selects (whole group if grouped) · Shift/Ctrl+click adds or removes · drag on empty space
//   draws a selection box · drag moves everything selected (snap guides; Alt turns snapping off) ·
//   handles resize, the round handle rotates (Shift: 15° steps) · click a selected box again to type.
// Keys: arrows nudge (Shift ×10), Delete, Ctrl+A/D/C/V, Ctrl+G group, Ctrl+Shift+G ungroup, Esc.
// Every change is one undoable patch.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { SlideView } from "@/components/deck/SlideView";
import type { Deck, Element, ElStyle, Frame, Intensity, Slide } from "@/lib/deck/schema";
import type { Theme } from "@/lib/deck/themes";
import type { PatchOp } from "@/lib/deck/patch";
import { angleFrom, boundsOf, duplicateElement, HANDLES, intersects, keepsRatio, outerBox, resizeRotated, round, snapMove, snapTargets, type Guides, type Handle } from "@/lib/deck/canvas";
import { newId } from "@/lib/deck/ids";
import { parseColor } from "@/lib/export/scene";

type Commit = (ops: PatchOp[], opts: { label: string }) => boolean;

const TEXT_BEARING = new Set<Element["type"]>(["text", "bullets", "shape", "table"]);
let clipboard: Element[] = [];

/** The slide stage inside the editor canvas (there is only one on the page). */
const stageEl = () => document.querySelector<HTMLElement>("[data-canvas] .k-stage");

/** An element's visible box in slide units, measured from the rendered slide. */
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

/** Where an element is: its own frame when placed by hand, otherwise its measured layout box. */
export const frameOf = (el: Element): Frame | null => el.frame ?? measureElement(el.id);

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

/** Ops for moving several elements to new frames in one undo step. */
export function framesOps(si: number, slide: Slide, frames: Map<string, Frame>): PatchOp[] {
  return slide.elements.flatMap((el, ei) => (frames.has(el.id) ? frameOps(si, ei, el, frames.get(el.id)!) : []));
}

/** Copies of elements with new ids; members of a copied group get a new shared group id. */
function copiesOf(els: Element[]): Element[] {
  const groups = new Map<string, string>();
  return els.map((el) => {
    const f = el.frame ?? measureElement(el.id) ?? { x: 760, y: 440, w: 400, h: 200 };
    const copy = duplicateElement(el, round(f));
    if (el.group) {
      if (!groups.has(el.group)) groups.set(el.group, newId("g"));
      copy.group = groups.get(el.group);
    } else delete copy.group;
    return copy;
  });
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

type Gesture =
  | { kind: "move"; ids: string[]; starts: Map<string, Frame>; sx: number; sy: number; moved: boolean; clickedId: string; wasOnlySelected: boolean; targets: Guides }
  | { kind: "resize"; id: string; handle: Handle; start: Frame; sx: number; sy: number; moved: boolean; keepRatio: boolean }
  | { kind: "rotate"; id: string; start: Frame; moved: boolean }
  | { kind: "marquee"; sx: number; sy: number; ox: number; oy: number; moved: boolean; additive: boolean; base: string[] };

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
  selectedIds,
  onSelectIds,
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
  selectedIds: string[];
  onSelectIds: (ids: string[]) => void;
  commit: Commit;
  onEditText: (id: string, v: string) => void;
  onEditItem: (id: string, i: number, v: string) => void;
  onSelectionFrame: (f: Frame | null) => void;
  label: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [draft, setDraft] = useState<{ frames: Map<string, Frame>; styles: Map<string, ElStyle>; rotating?: boolean } | null>(null);
  const [guides, setGuides] = useState<Guides>({ x: [], y: [] });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [boxes, setBoxes] = useState<Map<string, Frame>>(new Map());
  const [marquee, setMarquee] = useState<Frame | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const interactive = editable && !playing;
  const si = slideIndex;
  const single = selectedIds.length === 1 ? (slide.elements.find((e) => e.id === selectedIds[0]) ?? null) : null;

  // Stop typing when the selection moves elsewhere.
  const selKey = selectedIds.join(",");
  const [seenSel, setSeenSel] = useState(selKey);
  if (seenSel !== selKey) {
    setSeenSel(selKey);
    if (editingId && !(selectedIds.length === 1 && selectedIds[0] === editingId)) setEditingId(null);
  }

  const shown = useMemo<Slide>(() => {
    if (!draft) return slide;
    return { ...slide, elements: slide.elements.map((e) => (draft.frames.has(e.id) ? { ...e, frame: draft.frames.get(e.id), style: e.style ?? draft.styles.get(e.id) } : e)) };
  }, [slide, draft]);

  // Frames of the selected elements (hand-placed: exact incl. rotation; layout: measured).
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const update = () => {
      setScale(el.clientWidth / 1920);
      const m = new Map<string, Frame>();
      for (const id of selectedIds) {
        const e = shown.elements.find((x) => x.id === id);
        const f = e?.frame ?? measureElement(id);
        if (f) m.set(id, f);
      }
      setBoxes(m);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    const t = setTimeout(update, 60); // after images and fonts settle
    return () => {
      ro.disconnect();
      clearTimeout(t);
    };
  }, [shown, selKey]); // eslint-disable-line react-hooks/exhaustive-deps -- selKey stands in for selectedIds

  useEffect(() => {
    onSelectionFrame(single && !draft ? (boxes.get(single.id) ?? null) : null);
  }, [boxes, single, draft, onSelectionFrame]);

  const startEditing = useCallback((id: string, x: number, y: number) => {
    setEditingId(id);
    requestAnimationFrame(() => requestAnimationFrame(() => placeCaret(x, y, stageEl()?.querySelector<HTMLElement>(`[data-el="${CSS.escape(id)}"]`) ?? null)));
  }, []);

  /** An element plus everything grouped with it. */
  const withGroup = useCallback((id: string) => {
    const el = slide.elements.find((e) => e.id === id);
    return el?.group ? slide.elements.filter((e) => e.group === el.group).map((e) => e.id) : [id];
  }, [slide]);

  const toStage = (clientX: number, clientY: number) => {
    const r = stageEl()?.getBoundingClientRect();
    return r && scale ? { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale } : { x: 0, y: 0 };
  };

  // --- Pointer gestures --------------------------------------------------------
  const onPointerDown = (e: React.PointerEvent) => {
    if (!interactive || e.button !== 0) return;
    const target = e.target as HTMLElement;
    const handleEl = target.closest<HTMLElement>("[data-handle]");
    // A hand-placed element's frame may be larger than its content (e.g. a tall text box): the frame counts.
    const node = target.closest<HTMLElement>("[data-el]") ?? target.closest<HTMLElement>("[data-free-for]");
    const nodeId = node?.dataset.el ?? node?.dataset.freeFor;
    const inStage = !!target.closest(".k-stage") || !!handleEl;
    if (!inStage) return;
    if (!handleEl && nodeId && editingId === nodeId) return; // typing: let the caret move
    e.preventDefault();
    const active = document.activeElement as HTMLElement | null;
    if (active?.isContentEditable) active.blur();
    if (editingId) setEditingId(null);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    if (handleEl && single) {
      const start = single.frame ?? measureElement(single.id);
      if (!start) return;
      const h = handleEl.dataset.handle!;
      gesture.current = h === "rotate" ? { kind: "rotate", id: single.id, start, moved: false } : { kind: "resize", id: single.id, handle: h as Handle, start, sx: e.clientX, sy: e.clientY, moved: false, keepRatio: keepsRatio(single) };
      return;
    }

    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    if (!node) {
      const p = toStage(e.clientX, e.clientY);
      gesture.current = { kind: "marquee", sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, moved: false, additive, base: additive ? selectedIds : [] };
      return;
    }
    const id = nodeId!;
    const ids = withGroup(id);
    let next: string[];
    if (additive) {
      const has = ids.every((x) => selectedIds.includes(x));
      next = has ? selectedIds.filter((x) => !ids.includes(x)) : [...selectedIds, ...ids.filter((x) => !selectedIds.includes(x))];
    } else next = selectedIds.includes(id) ? selectedIds : ids;
    if (next.join(",") !== selKey) onSelectIds(next);
    if (additive && !next.includes(id)) return; // removed from the selection: nothing to drag
    const moving = next;
    const starts = new Map<string, Frame>();
    for (const mid of moving) {
      const el = slide.elements.find((x) => x.id === mid);
      const f = el && frameOf(el);
      if (f) starts.set(mid, f);
    }
    const others = slide.elements.filter((x) => !moving.includes(x.id)).map((x) => (x.frame ? outerBox(x.frame) : measureElement(x.id))).filter((f): f is Frame => !!f);
    gesture.current = { kind: "move", ids: moving, starts, sx: e.clientX, sy: e.clientY, moved: false, clickedId: id, wasOnlySelected: selectedIds.length === 1 && selectedIds[0] === id, targets: snapTargets(others) };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || !scale) return;
    if (g.kind === "rotate") {
      g.moved = true;
      const c = { x: g.start.x + g.start.w / 2, y: g.start.y + g.start.h / 2 };
      const r = angleFrom(c, toStage(e.clientX, e.clientY), e.shiftKey);
      const el = slide.elements.find((x) => x.id === g.id);
      setDraft({ frames: new Map([[g.id, { ...g.start, r }]]), styles: new Map(el && !el.frame ? [[g.id, captureLayoutStyle(el) ?? {}]] : []), rotating: true });
      return;
    }
    if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 4) return;
    g.moved = true;
    const dx = (e.clientX - g.sx) / scale;
    const dy = (e.clientY - g.sy) / scale;

    if (g.kind === "marquee") {
      const p = toStage(e.clientX, e.clientY);
      const box = { x: Math.min(g.ox, p.x), y: Math.min(g.oy, p.y), w: Math.abs(p.x - g.ox), h: Math.abs(p.y - g.oy) };
      setMarquee(box);
      const hit = slide.elements.filter((el) => {
        const f = el.frame ? outerBox(el.frame) : measureElement(el.id);
        return f && intersects(box, f);
      });
      const ids = new Set<string>(g.base);
      for (const el of hit) for (const id of withGroup(el.id)) ids.add(id);
      const next = [...ids];
      if (next.join(",") !== selectedIds.join(",")) onSelectIds(next);
      return;
    }

    const styles = new Map<string, ElStyle>();
    if (g.kind === "resize") {
      const el = slide.elements.find((x) => x.id === g.id);
      if (!el) return;
      if (!el.frame) styles.set(el.id, captureLayoutStyle(el) ?? {});
      setDraft({ frames: new Map([[g.id, resizeRotated(g.start, g.handle, dx, dy, g.keepRatio !== e.shiftKey)]]), styles });
      setGuides({ x: [], y: [] });
      return;
    }
    // move: snap the selection's visible bounds, then shift every member by the same amount
    const all = [...g.starts.values()];
    const bounds = boundsOf(all);
    const moved = e.altKey ? { frame: { ...bounds, x: bounds.x + dx, y: bounds.y + dy }, guides: { x: [], y: [] } } : snapMove({ ...bounds, x: bounds.x + dx, y: bounds.y + dy }, g.targets, 7 / scale);
    const ddx = moved.frame.x - bounds.x;
    const ddy = moved.frame.y - bounds.y;
    const frames = new Map<string, Frame>();
    for (const [id, f] of g.starts) {
      frames.set(id, { ...f, x: f.x + ddx, y: f.y + ddy });
      const el = slide.elements.find((x) => x.id === id);
      if (el && !el.frame) styles.set(id, captureLayoutStyle(el) ?? {});
    }
    setDraft({ frames, styles });
    setGuides(moved.guides);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    setGuides({ x: [], y: [] });
    setMarquee(null);
    if (!g) return;
    if (g.kind === "marquee") {
      if (!g.moved && !g.additive) onSelectIds([]); // click on empty space clears the selection
      return;
    }
    if (g.moved && draft) {
      const label = g.kind === "rotate" ? "Rotate" : g.kind === "resize" ? "Resize" : g.ids.length > 1 ? `Move ${g.ids.length} elements` : "Move";
      commit(framesOps(si, slide, draft.frames), { label });
      setDraft(null);
      return;
    }
    setDraft(null);
    // A click (no drag) on the only selected box starts typing.
    if (g.kind === "move" && !g.moved && g.wasOnlySelected && !(e.shiftKey || e.ctrlKey || e.metaKey)) {
      const el = slide.elements.find((x) => x.id === g.clickedId);
      if (el && TEXT_BEARING.has(el.type) && !el.group) startEditing(el.id, e.clientX, e.clientY);
    }
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
      const key = e.key.toLowerCase();
      const sel = slide.elements.filter((x) => selectedIds.includes(x.id));
      const stop = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };

      if (mod && key === "a") {
        stop();
        onSelectIds(slide.elements.map((x) => x.id));
        return;
      }
      if (mod && key === "v" && clipboard.length) {
        stop();
        if (slide.elements.length + clipboard.length > 60) return;
        const copies = copiesOf(clipboard);
        if (commit(copies.map((c) => ({ op: "add" as const, path: `/slides/${si}/elements/-`, value: c })), { label: copies.length > 1 ? `Paste ${copies.length} elements` : "Paste" })) {
          clipboard = copies.map((c) => structuredClone(c));
          onSelectIds(copies.map((c) => c.id));
        }
        return;
      }
      if (!sel.length) return;

      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onSelectIds([]);
        return;
      }
      if (mod && key === "c") {
        e.stopImmediatePropagation();
        clipboard = sel.map((el) => structuredClone({ ...el, frame: el.frame ?? measureElement(el.id) ?? undefined }));
        return;
      }
      if (mod && key === "d") {
        stop();
        if (slide.elements.length + sel.length > 60) return;
        const copies = copiesOf(sel);
        if (commit(copies.map((c) => ({ op: "add" as const, path: `/slides/${si}/elements/-`, value: c })), { label: "Duplicate" })) onSelectIds(copies.map((c) => c.id));
        return;
      }
      if (mod && key === "g") {
        stop();
        const idx = slide.elements.map((el, ei) => (selectedIds.includes(el.id) ? ei : -1)).filter((i) => i >= 0);
        if (e.shiftKey) {
          const ops = idx.filter((ei) => slide.elements[ei].group).map((ei) => ({ op: "remove" as const, path: `/slides/${si}/elements/${ei}/group` }));
          if (ops.length) commit(ops, { label: "Ungroup" });
        } else if (idx.length > 1) {
          const g = newId("g");
          commit(idx.map((ei) => ({ op: "add" as const, path: `/slides/${si}/elements/${ei}/group`, value: g })), { label: "Group" });
        }
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        stop();
        const idx = slide.elements.map((el, ei) => (selectedIds.includes(el.id) ? ei : -1)).filter((i) => i >= 0).sort((a, b) => b - a);
        commit(idx.map((ei) => ({ op: "remove" as const, path: `/slides/${si}/elements/${ei}` })), { label: idx.length > 1 ? `Delete ${idx.length} elements` : "Delete element" });
        onSelectIds([]);
        return;
      }
      if (e.key === "Enter" && single && TEXT_BEARING.has(single.type)) {
        stop();
        const r = stageEl()?.querySelector(`[data-el="${CSS.escape(single.id)}"]`)?.getBoundingClientRect();
        if (r) startEditing(single.id, r.right - 2, r.bottom - 2);
        return;
      }
      const dirs: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const d = dirs[e.key];
      if (d && !mod) {
        stop();
        const n = e.shiftKey ? 10 : 1;
        const frames = new Map<string, Frame>();
        for (const el of sel) {
          const f = frameOf(el);
          if (f) frames.set(el.id, { ...f, x: f.x + d[0] * n, y: f.y + d[1] * n });
        }
        commit(framesOps(si, slide, frames), { label: "Nudge" });
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [interactive, selectedIds, single, slide, si, commit, onSelectIds, startEditing]);

  const indexOf = useCallback((id: string) => deck.slides[si]?.elements.findIndex((e) => e.id === id) ?? -1, [deck, si]);
  const editField = useCallback(
    (id: string, field: string, value: string) => {
      const ei = indexOf(id);
      if (ei < 0) return;
      commit([{ op: "replace", path: `/slides/${si}/elements/${ei}/${field}`, value }], { label: field === "text" ? "Edit shape text" : "Edit table" });
    },
    [indexOf, si, commit],
  );

  const singleBox = single ? boxes.get(single.id) : undefined;
  const handles = single && single.type !== "mockup" ? (single.type === "shape" && (single.shape === "line" || single.shape === "arrow") ? (["w", "e"] as Handle[]) : HANDLES) : [];
  const groupBox = selectedIds.length > 1 && boxes.size > 1 ? boundsOf([...boxes.values()]) : null;
  const rotatable = !!single && single.type !== "mockup" && single.type !== "table";

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
        setMarquee(null);
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
        onSelect={() => {}}
        onEditText={onEditText}
        onEditItem={onEditItem}
        onEditField={editField}
        label={label}
      />
      {interactive && scale > 0 && (
        <div className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden="true">
          {guides.x.map((x) => <div key={`gx${x}`} className="absolute bottom-0 top-0 w-px bg-[#e5007a]" style={{ left: x * scale }} />)}
          {guides.y.map((y) => <div key={`gy${y}`} className="absolute left-0 right-0 h-px bg-[#e5007a]" style={{ top: y * scale }} />)}
          {marquee && <div className="absolute border border-accent bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]" style={{ left: marquee.x * scale, top: marquee.y * scale, width: marquee.w * scale, height: marquee.h * scale }} />}

          {/* Several selected: thin outline per element plus a dashed box around all of them. */}
          {selectedIds.length > 1 &&
            [...boxes.entries()].map(([id, b]) => (
              <div key={id} className="absolute border border-accent" style={{ left: b.x * scale, top: b.y * scale, width: b.w * scale, height: b.h * scale, transform: b.r ? `rotate(${b.r}deg)` : undefined }} />
            ))}
          {groupBox && (
            <div className="absolute border-2 border-dashed border-accent" style={{ left: groupBox.x * scale - 4, top: groupBox.y * scale - 4, width: groupBox.w * scale + 8, height: groupBox.h * scale + 8 }}>
              <span className="tabular absolute -top-7 left-0 whitespace-nowrap rounded-[4px] bg-accent px-1.5 py-0.5 text-[11px] font-medium text-white">{selectedIds.length} selected</span>
            </div>
          )}

          {single && singleBox && (
            <div
              className={`absolute ${editingId === single.id ? "border-2 border-dashed border-accent" : "border-2 border-accent"}`}
              style={{ left: singleBox.x * scale - 1, top: singleBox.y * scale - 1, width: singleBox.w * scale + 2, height: singleBox.h * scale + 2, transform: singleBox.r ? `rotate(${singleBox.r}deg)` : undefined }}
            >
              {draft && (
                <span className="tabular absolute -top-7 left-0 whitespace-nowrap rounded-[4px] bg-accent px-1.5 py-0.5 text-[11px] font-medium text-white">
                  {draft.rotating ? `${Math.round(singleBox.r ?? 0)}°` : `${Math.round(singleBox.w)} × ${Math.round(singleBox.h)}`}
                </span>
              )}
              {editingId !== single.id && (
                <>
                  {handles.map((h) => (
                    <span
                      key={h}
                      data-handle={h}
                      className="pointer-events-auto absolute h-3 w-3 rounded-[2px] border-2 border-accent bg-white"
                      style={{ left: h.includes("w") ? -7 : h.includes("e") ? "calc(100% - 5px)" : "calc(50% - 6px)", top: h.includes("n") ? -7 : h.includes("s") ? "calc(100% - 5px)" : "calc(50% - 6px)", cursor: `${h}-resize` }}
                    />
                  ))}
                  {rotatable && (
                    <>
                      <span className="absolute left-1/2 top-[-26px] h-[20px] w-px bg-accent" />
                      <span data-handle="rotate" title="Rotate (Shift: 15° steps)" className="pointer-events-auto absolute left-[calc(50%-7px)] top-[-36px] h-3.5 w-3.5 cursor-grab rounded-full border-2 border-accent bg-white" />
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
