"use client";

// Format panel for the selected element: position and size, arrange, text, fill and border,
// icon, table and photo options. Every control writes one undoable patch.
import { useState } from "react";
import { AlignCenter, AlignCenterVertical, AlignEndVertical, AlignLeft, AlignRight, AlignStartVertical, ArrowDownToLine, ArrowUpToLine, Bold, ChevronDown, ChevronUp, Copy, Italic, RotateCcw, Trash2, Underline } from "lucide-react";
import { Icon } from "@/components/deck/Icon";
import { ICON_NAMES } from "@/lib/deck/icons";
import { isFree, SHAPES, type Deck, type Element, type ElStyle, type Frame, type ShapeKind } from "@/lib/deck/schema";
import type { PatchOp } from "@/lib/deck/patch";
import { deckTheme } from "@/lib/deck/themes";
import { alignToSlide, duplicateElement, round } from "@/lib/deck/canvas";
import { frameOps } from "./CanvasEditor";
import { SHAPE_LABEL } from "./Panels";

type Commit = (ops: PatchOp[], opts: { label: string }) => boolean;

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-t border-line pt-3 first:border-t-0 first:pt-0">
      <legend className="mb-2 text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-2">{title}</legend>
      {children}
    </fieldset>
  );
}

function IconBtn({ label, on, onClick, children, danger }: { label: string; on?: boolean; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} aria-pressed={on} onClick={onClick} className={`flex h-8 min-w-8 items-center justify-center rounded-[6px] border px-1.5 text-[12px] ${on ? "border-accent bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] text-ink" : "border-line text-ink-2 hover:text-ink"} ${danger ? "hover:text-danger" : ""}`}>
      {children}
    </button>
  );
}

function NumField({ label, value, onCommit, min, max, step = 1 }: { label: string; value: number; onCommit: (v: number) => void; min?: number; max?: number; step?: number }) {
  const [v, setV] = useState(String(Math.round(value)));
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setV(String(Math.round(value)));
  }
  const apply = () => {
    const n = Number(v);
    if (!Number.isFinite(n)) return setV(String(Math.round(value)));
    const c = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, n));
    if (Math.round(c) !== Math.round(value)) onCommit(c);
    else setV(String(Math.round(value)));
  };
  return (
    <label className="flex items-center gap-1.5 text-[12px] text-ink-2">
      <span className="w-3.5">{label}</span>
      <input inputMode="numeric" className="field tabular h-8 py-0 text-[13px]" value={v} step={step} onChange={(e) => setV(e.target.value)} onBlur={apply} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} />
    </label>
  );
}

const ROLES = ["text", "muted", "accent", "accent2", "surface", "bg"] as const;
const ROLE_LABEL: Record<(typeof ROLES)[number], string> = { text: "Text colour", muted: "Muted", accent: "Accent", accent2: "Second accent", surface: "Surface", bg: "Background" };

function Swatches({ deck, value, onPick, allowNone }: { deck: Deck; value?: string; onPick: (v: string) => void; allowNone?: boolean }) {
  const theme = deckTheme(deck);
  const hex = value?.startsWith("#") ? value : "#000000";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {ROLES.map((r) => (
        <button key={r} type="button" aria-label={ROLE_LABEL[r]} title={`${ROLE_LABEL[r]} (follows the theme)`} aria-pressed={value === r} onClick={() => onPick(r)} className={`h-7 w-7 rounded-full border ${value === r ? "ring-2 ring-accent ring-offset-2 ring-offset-surface" : "border-line"}`} style={{ background: theme.colors[r] }} />
      ))}
      {allowNone && (
        <button type="button" aria-label="None" title="None" aria-pressed={value === "none"} onClick={() => onPick("none")} className={`relative h-7 w-7 overflow-hidden rounded-full border border-line bg-surface ${value === "none" ? "ring-2 ring-accent ring-offset-2 ring-offset-surface" : ""}`}>
          <span className="absolute left-1/2 top-[-4px] h-9 w-[2px] -translate-x-1/2 rotate-45 bg-danger" />
        </button>
      )}
      <label className={`relative h-7 w-7 cursor-pointer overflow-hidden rounded-full border border-line ${value?.startsWith("#") ? "ring-2 ring-accent ring-offset-2 ring-offset-surface" : ""}`} title="Custom colour">
        <span className="sr-only">Custom colour</span>
        <span className="absolute inset-0" style={{ background: value?.startsWith("#") ? value : "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)" /* slop-lint-ignore: colour wheel swatch */ }} />
        <input type="color" className="absolute inset-0 cursor-pointer opacity-0" value={hex} onChange={(e) => onPick(e.target.value.toUpperCase())} />
      </label>
    </div>
  );
}

export function ElementPanel({ deck, slideIndex, el, frame, commit, onSelect }: { deck: Deck; slideIndex: number; el: Element; frame: Frame | null; commit: Commit; onSelect: (id: string | null) => void }) {
  const si = slideIndex;
  const els = deck.slides[si].elements;
  const ei = els.findIndex((e) => e.id === el.id);
  if (ei < 0) return null;
  const st = el.style ?? {};
  const path = `/slides/${si}/elements/${ei}`;
  const f = el.frame ?? frame;

  const setStyle = (patch: Partial<ElStyle>, label: string) => {
    const next = { ...st, ...patch } as Record<string, unknown>;
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
    commit([{ op: "add", path: `${path}/style`, value: next }], { label });
  };
  const setFrame = (nf: Frame, label: string) => commit(frameOps(si, ei, el, nf), { label });
  const moveTo = (to: number, label: string) => {
    const t = Math.max(0, Math.min(els.length - 1, to));
    if (t !== ei) commit([{ op: "move", from: path, path: `/slides/${si}/elements/${t}` }], { label });
  };
  // Only hand-placed elements are drawn above the layout, so layering is among those.
  const placed = els.map((e, i) => ({ e, i })).filter((x) => x.e.frame);
  const pos = placed.findIndex((x) => x.e.id === el.id);

  const hasText = el.type === "text" || el.type === "shape" || el.type === "table";
  const fontSize = st.fontSize ?? (el.type === "shape" ? 36 : el.type === "table" ? 28 : el.type === "text" ? ({ h1: 84, h2: 48, body: 38, caption: 30, quote: 68, label: 24 } as const)[el.role] : 38);

  return (
    <div className="space-y-4 rounded-[10px] border border-line p-3">
      <Sub title="Position and size">
        {f ? (
          <div className="grid grid-cols-2 gap-2">
            <NumField label="X" value={f.x} onCommit={(v) => setFrame({ ...f, x: v }, "Move")} min={-1920} max={3840} />
            <NumField label="Y" value={f.y} onCommit={(v) => setFrame({ ...f, y: v }, "Move")} min={-1080} max={2160} />
            <NumField label="W" value={f.w} onCommit={(v) => setFrame({ ...f, w: v }, "Resize")} min={8} max={3840} />
            <NumField label="H" value={f.h} onCommit={(v) => setFrame({ ...f, h: v }, "Resize")} min={4} max={2160} />
          </div>
        ) : (
          <p className="text-[12px] text-ink-2">Drag the box on the slide to place it.</p>
        )}
        {f && (
          <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Align to slide">
            <IconBtn label="Align left" onClick={() => setFrame(alignToSlide(f, "left"), "Align")}><AlignLeft size={14} /></IconBtn>
            <IconBtn label="Centre horizontally" onClick={() => setFrame(alignToSlide(f, "center"), "Align")}><AlignCenter size={14} /></IconBtn>
            <IconBtn label="Align right" onClick={() => setFrame(alignToSlide(f, "right"), "Align")}><AlignRight size={14} /></IconBtn>
            <IconBtn label="Align top" onClick={() => setFrame(alignToSlide(f, "top"), "Align")}><AlignStartVertical size={14} className="rotate-90" /></IconBtn>
            <IconBtn label="Centre vertically" onClick={() => setFrame(alignToSlide(f, "middle"), "Align")}><AlignCenterVertical size={14} className="rotate-90" /></IconBtn>
            <IconBtn label="Align bottom" onClick={() => setFrame(alignToSlide(f, "bottom"), "Align")}><AlignEndVertical size={14} className="rotate-90" /></IconBtn>
          </div>
        )}
        {!isFree(el) && el.frame && (
          <button type="button" className="btn btn-ghost btn-sm mt-2 px-2 text-[12px]" onClick={() => commit([{ op: "remove", path: `${path}/frame` }, ...(el.style ? [{ op: "remove" as const, path: `${path}/style` }] : [])], { label: "Reset position" })}>
            <RotateCcw size={13} aria-hidden="true" />
            Back to layout position
          </button>
        )}
      </Sub>

      <Sub title="Arrange">
        <div className="flex flex-wrap gap-1">
          {el.frame && (
            <>
              <IconBtn label="Bring to front" onClick={() => moveTo(els.length - 1, "Bring to front")}><ArrowUpToLine size={14} /></IconBtn>
              <IconBtn label="Bring forward" onClick={() => pos < placed.length - 1 && moveTo(placed[pos + 1].i, "Bring forward")}><ChevronUp size={14} /></IconBtn>
              <IconBtn label="Send backward" onClick={() => pos > 0 && moveTo(placed[pos - 1].i, "Send backward")}><ChevronDown size={14} /></IconBtn>
              <IconBtn label="Send to back" onClick={() => placed[0] && moveTo(placed[0].i, "Send to back")}><ArrowDownToLine size={14} /></IconBtn>
            </>
          )}
          <IconBtn
            label="Duplicate (Ctrl D)"
            onClick={() => {
              if (!f || els.length >= 60) return;
              const copy = duplicateElement(el, round(f));
              if (commit([{ op: "add", path: `/slides/${si}/elements/-`, value: copy }], { label: "Duplicate" })) onSelect(copy.id);
            }}
          >
            <Copy size={14} />
          </IconBtn>
          <IconBtn label="Delete (Del)" danger onClick={() => (commit([{ op: "remove", path }], { label: "Delete element" }), onSelect(null))}><Trash2 size={14} /></IconBtn>
        </div>
        <label className="mt-3 flex items-center gap-2 text-[12px] text-ink-2">
          Opacity
          <input type="range" min={10} max={100} step={5} className="flex-1 accent-[var(--accent)]" value={Math.round((st.opacity ?? 1) * 100)} onChange={(e) => setStyle({ opacity: Number(e.target.value) >= 100 ? undefined : Number(e.target.value) / 100 }, "Change opacity")} aria-label="Opacity" />
          <span className="tabular w-9 text-right">{Math.round((st.opacity ?? 1) * 100)}%</span>
        </label>
      </Sub>

      {hasText && (
        <Sub title="Text">
          <div className="flex items-center gap-1">
            <IconBtn label="Smaller" onClick={() => setStyle({ fontSize: Math.max(8, Math.round(fontSize / 1.12)) }, "Text size")}>A−</IconBtn>
            <NumFieldInline value={fontSize} onCommit={(v) => setStyle({ fontSize: v }, "Text size")} />
            <IconBtn label="Larger" onClick={() => setStyle({ fontSize: Math.min(400, Math.round(fontSize * 1.12)) }, "Text size")}>A+</IconBtn>
            <span className="mx-1 h-5 w-px bg-line" />
            <IconBtn label="Bold" on={!!st.bold} onClick={() => setStyle({ bold: st.bold ? undefined : true }, "Bold")}><Bold size={14} /></IconBtn>
            <IconBtn label="Italic" on={!!st.italic} onClick={() => setStyle({ italic: st.italic ? undefined : true }, "Italic")}><Italic size={14} /></IconBtn>
            <IconBtn label="Underline" on={!!st.underline} onClick={() => setStyle({ underline: st.underline ? undefined : true }, "Underline")}><Underline size={14} /></IconBtn>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {(["left", "center", "right"] as const).map((a) => (
              <IconBtn key={a} label={`Align ${a}`} on={(st.align ?? (el.type === "shape" ? "center" : "left")) === a} onClick={() => setStyle({ align: a }, "Align text")}>
                {a === "left" ? <AlignLeft size={14} /> : a === "center" ? <AlignCenter size={14} /> : <AlignRight size={14} />}
              </IconBtn>
            ))}
            {el.type !== "table" && (
              <>
                <span className="mx-1 h-5 w-px bg-line" />
                {(["top", "middle", "bottom"] as const).map((v) => (
                  <IconBtn key={v} label={`Text at ${v}`} on={(st.valign ?? (el.type === "shape" ? "middle" : "top")) === v} onClick={() => setStyle({ valign: v }, "Vertical align")}>
                    <span className="text-[11px]">{v === "top" ? "Top" : v === "middle" ? "Mid" : "Bot"}</span>
                  </IconBtn>
                ))}
              </>
            )}
          </div>
          {el.type === "text" && (
            <div className="mt-2 flex gap-1">
              <IconBtn label="Heading font" on={st.font === "heading"} onClick={() => setStyle({ font: "heading" }, "Font")}>Heading font</IconBtn>
              <IconBtn label="Body font" on={st.font === "body"} onClick={() => setStyle({ font: "body" }, "Font")}>Body font</IconBtn>
            </div>
          )}
          <p className="mb-1.5 mt-3 text-[12px] text-ink-2">Text colour</p>
          <Swatches deck={deck} value={st.color} onPick={(c) => setStyle({ color: c }, "Text colour")} />
        </Sub>
      )}

      {el.type === "shape" && (
        <Sub title="Shape">
          <select className="field h-9 py-0 text-[13px]" aria-label="Shape type" value={el.shape} onChange={(e) => commit([{ op: "replace", path: `${path}/shape`, value: e.target.value as ShapeKind }], { label: "Change shape" })}>
            {SHAPES.map((s) => <option key={s} value={s}>{SHAPE_LABEL[s]}</option>)}
          </select>
          {el.shape !== "line" && el.shape !== "arrow" && (
            <>
              <p className="mb-1.5 mt-3 text-[12px] text-ink-2">Fill</p>
              <Swatches deck={deck} value={st.fill ?? "accent"} allowNone onPick={(c) => setStyle({ fill: c }, "Fill colour")} />
            </>
          )}
          <p className="mb-1.5 mt-3 text-[12px] text-ink-2">{el.shape === "line" || el.shape === "arrow" ? "Line colour" : "Border"}</p>
          <Swatches deck={deck} value={st.stroke ?? (el.shape === "line" || el.shape === "arrow" ? "accent" : "none")} allowNone={el.shape !== "line" && el.shape !== "arrow"} onPick={(c) => setStyle({ stroke: c, strokeWidth: c === "none" ? undefined : (st.strokeWidth ?? 4) }, "Border colour")} />
          <label className="mt-3 flex items-center gap-2 text-[12px] text-ink-2">
            {el.shape === "line" || el.shape === "arrow" ? "Thickness" : "Border width"}
            <input type="range" min={0} max={30} className="flex-1 accent-[var(--accent)]" value={st.strokeWidth ?? (el.shape === "line" || el.shape === "arrow" ? 6 : 0)} onChange={(e) => setStyle({ strokeWidth: Number(e.target.value) }, "Border width")} aria-label="Border width" />
            <span className="tabular w-6 text-right">{st.strokeWidth ?? (el.shape === "line" || el.shape === "arrow" ? 6 : 0)}</span>
          </label>
          {(el.shape === "roundRect" || el.shape === "rect") && (
            <label className="mt-2 flex items-center gap-2 text-[12px] text-ink-2">
              Corners
              <input type="range" min={0} max={200} className="flex-1 accent-[var(--accent)]" value={st.radius ?? (el.shape === "roundRect" ? 48 : 0)} onChange={(e) => setStyle({ radius: Number(e.target.value) }, "Corner radius")} aria-label="Corner radius" />
            </label>
          )}
          <p className="mt-2 text-[11px] text-ink-2">Click the shape again to type inside it.</p>
        </Sub>
      )}

      {el.type === "icon" && (
        <Sub title="Icon">
          <div className="grid max-h-[180px] grid-cols-8 gap-1 overflow-y-auto">
            {ICON_NAMES.map((n) => (
              <button key={n} type="button" aria-label={n.replace(/-/g, " ")} title={n.replace(/-/g, " ")} aria-pressed={el.name === n} onClick={() => commit([{ op: "replace", path: `${path}/name`, value: n }], { label: "Change icon" })} className={`flex h-8 items-center justify-center rounded-[6px] ${el.name === n ? "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]" : "hover:bg-[color-mix(in_srgb,var(--ink)_7%,transparent)]"}`}>
                <Icon name={n} size={16} />
              </button>
            ))}
          </div>
          <p className="mb-1.5 mt-3 text-[12px] text-ink-2">Colour</p>
          <Swatches deck={deck} value={st.color ?? "accent"} onPick={(c) => setStyle({ color: c }, "Icon colour")} />
          <label className="mt-3 flex items-center gap-2 text-[12px] text-ink-2">
            Line weight
            <input type="range" min={1} max={3} step={0.25} className="flex-1 accent-[var(--accent)]" value={st.strokeWidth ?? 1.75} onChange={(e) => setStyle({ strokeWidth: Number(e.target.value) }, "Icon weight")} aria-label="Line weight" />
          </label>
        </Sub>
      )}

      {el.type === "table" && (
        <Sub title="Table">
          <div className="grid grid-cols-2 gap-1.5 text-[12px]">
            <button type="button" className="btn btn-secondary btn-sm min-h-8 px-2" disabled={el.rows.length >= 12} onClick={() => commit([{ op: "add", path: `${path}/rows/-`, value: el.rows[0].map(() => "") }], { label: "Add row" })}>Add row</button>
            <button type="button" className="btn btn-secondary btn-sm min-h-8 px-2" disabled={el.rows.length <= 1} onClick={() => commit([{ op: "remove", path: `${path}/rows/${el.rows.length - 1}` }], { label: "Remove row" })}>Remove row</button>
            <button type="button" className="btn btn-secondary btn-sm min-h-8 px-2" disabled={el.rows[0].length >= 8} onClick={() => commit([{ op: "replace", path: `${path}/rows`, value: el.rows.map((r, i) => [...r, i === 0 && el.header ? `Column ${r.length + 1}` : ""]) }], { label: "Add column" })}>Add column</button>
            <button type="button" className="btn btn-secondary btn-sm min-h-8 px-2" disabled={el.rows[0].length <= 1} onClick={() => commit([{ op: "replace", path: `${path}/rows`, value: el.rows.map((r) => r.slice(0, -1)) }], { label: "Remove column" })}>Remove column</button>
          </div>
          <label className="mt-3 flex items-center gap-2 text-[13px]">
            <input type="checkbox" className="h-4 w-4" checked={el.header} onChange={(e) => commit([{ op: "replace", path: `${path}/header`, value: e.target.checked }], { label: "Header row" })} />
            First row is a header
          </label>
          {el.header && (
            <>
              <p className="mb-1.5 mt-3 text-[12px] text-ink-2">Header colour</p>
              <Swatches deck={deck} value={st.fill ?? "accent"} allowNone onPick={(c) => setStyle({ fill: c }, "Header colour")} />
            </>
          )}
          <p className="mt-2 text-[11px] text-ink-2">Click the table again to type in its cells. Tab moves between cells.</p>
        </Sub>
      )}

      {el.type === "image" && el.frame && (
        <Sub title="Photo frame">
          <div className="flex gap-1">
            <IconBtn label="Fill the frame (crop)" on={(st.fit ?? "cover") === "cover"} onClick={() => setStyle({ fit: undefined }, "Photo fit")}>Fill</IconBtn>
            <IconBtn label="Fit inside the frame" on={st.fit === "contain"} onClick={() => setStyle({ fit: "contain" }, "Photo fit")}>Fit</IconBtn>
          </div>
          <label className="mt-3 flex items-center gap-2 text-[12px] text-ink-2">
            Corners
            <input type="range" min={0} max={200} className="flex-1 accent-[var(--accent)]" value={st.radius ?? 0} onChange={(e) => setStyle({ radius: Number(e.target.value) || undefined }, "Corner radius")} aria-label="Corner radius" />
          </label>
        </Sub>
      )}
    </div>
  );
}

function NumFieldInline({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [v, setV] = useState(String(value));
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setV(String(value));
  }
  return (
    <input
      aria-label="Text size"
      inputMode="numeric"
      className="field tabular h-8 w-14 px-1.5 py-0 text-center text-[13px]"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const n = Math.round(Number(v));
        if (Number.isFinite(n) && n >= 8 && n <= 400 && n !== value) onCommit(n);
        else setV(String(value));
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
    />
  );
}
