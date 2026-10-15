"use client";

// Insert bar above the canvas: add text, photos, shapes, icons, tables and charts.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChartColumn, ChevronDown, Image as ImageIcon, Shapes, Smile, Table2, Type } from "lucide-react";
import { Icon } from "@/components/deck/Icon";
import { ICON_NAMES, type IconName } from "@/lib/deck/icons";
import { SHAPES, type Element, type ShapeKind } from "@/lib/deck/schema";
import { newChart, newIcon, newImage, newShape, newTable, newText, type TextPreset } from "@/lib/deck/canvas";
import { PhotoChooser, SHAPE_LABEL } from "./Panels";
import { assetIdOf, isUnsplashSrc, libraryUrl, unsplashUrl } from "@/lib/deck/media";
import type { PhotoRef } from "@/lib/deck/place";
import { assetUrlNow } from "@/lib/client/assets";

function Menu({ label, icon, children, disabled, wide = false }: { label: string; icon: ReactNode; children: (close: () => void) => ReactNode; disabled?: boolean; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" className="btn btn-ghost btn-sm gap-1.5 px-2.5" aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={() => setOpen((o) => !o)}>
        {icon}
        {label}
        <ChevronDown size={13} aria-hidden="true" className="text-ink-2" />
      </button>
      {open && (
        <div role="menu" className={`absolute left-0 top-full z-40 mt-1 rounded-[10px] border border-line bg-surface p-1.5 shadow-[0_12px_32px_-12px_rgba(0,0,0,.25)] ${wide ? "w-[340px]" : "min-w-[200px]"}`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

const item = "flex w-full items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-left text-[13px] hover:bg-[color-mix(in_srgb,var(--ink)_6%,transparent)]";

function ShapeGlyph({ s }: { s: ShapeKind }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.6 };
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      {s === "rect" && <rect x="3" y="5" width="16" height="12" {...p} />}
      {s === "roundRect" && <rect x="3" y="5" width="16" height="12" rx="3.5" {...p} />}
      {s === "ellipse" && <ellipse cx="11" cy="11" rx="8" ry="7" {...p} />}
      {s === "triangle" && <polygon points="11,3 19,18 3,18" {...p} />}
      {s === "diamond" && <polygon points="11,2 20,11 11,20 2,11" {...p} />}
      {s === "line" && <line x1="3" y1="11" x2="19" y2="11" {...p} strokeLinecap="round" />}
      {s === "arrow" && (
        <>
          <line x1="3" y1="11" x2="16" y2="11" {...p} />
          <polygon points="19,11 14,7.5 14,14.5" fill="currentColor" />
        </>
      )}
      {s === "star" && <polygon points="11,2.5 13.4,8.4 19.8,8.7 14.8,12.7 16.5,18.9 11,15.3 5.5,18.9 7.2,12.7 2.2,8.7 8.6,8.4" {...p} />}
    </svg>
  );
}

function IconPicker({ onPick }: { onPick: (n: IconName) => void }) {
  const [q, setQ] = useState("");
  const list = ICON_NAMES.filter((n) => n.includes(q.trim().toLowerCase().replace(/\s+/g, "-")));
  return (
    <div className="p-1">
      <input autoFocus className="field mb-2 h-8 py-0 text-[13px]" placeholder="Search icons" aria-label="Search icons" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="grid max-h-[240px] grid-cols-8 gap-1 overflow-y-auto">
        {list.map((n) => (
          <button key={n} type="button" title={n.replace(/-/g, " ")} aria-label={n.replace(/-/g, " ")} onClick={() => onPick(n)} className="flex h-9 items-center justify-center rounded-[6px] text-ink hover:bg-[color-mix(in_srgb,var(--ink)_7%,transparent)]">
            <Icon name={n} size={18} />
          </button>
        ))}
        {!list.length && <p className="col-span-8 py-3 text-center text-[12px] text-ink-2">No icons match.</p>}
      </div>
    </div>
  );
}

function PhotoDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (p: PhotoRef) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} className="m-auto w-[min(560px,calc(100vw-32px))] rounded-[20px] border border-line bg-surface p-0 text-ink backdrop:bg-black/40" aria-label="Insert a photo">
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <h2 className="text-[16px] font-semibold">Insert a photo</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
      </div>
      <div className="max-h-[65vh] overflow-y-auto p-5">
        {open && (
          <PhotoChooser
            onChoose={(p) => {
              onPick(p);
              onClose();
            }}
          />
        )}
      </div>
    </dialog>
  );
}

/** Width ? height of a library photo or upload, so it's inserted without cropping. */
async function photoAspect(src: string): Promise<number> {
  const id = assetIdOf(src);
  const url = id ? assetUrlNow(id) : isUnsplashSrc(src) ? unsplashUrl(src, 400) : libraryUrl(src, 640);
  if (!url) return 4 / 3;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    await img.decode();
    return img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 4 / 3;
  } catch {
    return 4 / 3;
  }
}

/** Adds a new element to the current slide; `count` nudges repeated inserts so they don't stack. */
export function InsertBar({ onInsert, count, disabled }: { onInsert: (el: Element, label: string) => void; count: number; disabled?: boolean }) {
  const [photo, setPhoto] = useState(false);
  const text = (p: TextPreset, label: string) => onInsert(newText(p, count), label);
  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-[10px] border border-line bg-surface p-1" role="toolbar" aria-label="Insert">
      <span className="px-2 text-[12px] font-medium text-ink-2">Insert</span>
      <Menu label="Text" icon={<Type size={15} aria-hidden="true" />} disabled={disabled}>
        {(close) => (
          <>
            <button type="button" role="menuitem" className={item} onClick={() => (close(), text("heading", "Add heading"))}><span className="text-[17px] font-bold">Heading</span></button>
            <button type="button" role="menuitem" className={item} onClick={() => (close(), text("body", "Add text"))}><span className="text-[14px]">Body text</span></button>
            <button type="button" role="menuitem" className={item} onClick={() => (close(), text("caption", "Add caption"))}><span className="text-[12px] text-ink-2">Caption</span></button>
          </>
        )}
      </Menu>
      <button type="button" className="btn btn-ghost btn-sm gap-1.5 px-2.5" onClick={() => setPhoto(true)} disabled={disabled}>
        <ImageIcon size={15} aria-hidden="true" />
        Photo
      </button>
      <Menu label="Shape" icon={<Shapes size={15} aria-hidden="true" />} disabled={disabled}>
        {(close) => (
          <div className="grid grid-cols-2 gap-0.5">
            {SHAPES.map((s) => (
              <button key={s} type="button" role="menuitem" className={item} onClick={() => (close(), onInsert(newShape(s, count), `Add ${SHAPE_LABEL[s].toLowerCase()}`))}>
                <ShapeGlyph s={s} />
                {SHAPE_LABEL[s]}
              </button>
            ))}
          </div>
        )}
      </Menu>
      <Menu label="Icon" icon={<Smile size={15} aria-hidden="true" />} disabled={disabled} wide>
        {(close) => <IconPicker onPick={(n) => (close(), onInsert(newIcon(n, count), "Add icon"))} />}
      </Menu>
      <button type="button" className="btn btn-ghost btn-sm gap-1.5 px-2.5" onClick={() => onInsert(newTable(4, 3, count), "Add table")} disabled={disabled}>
        <Table2 size={15} aria-hidden="true" />
        Table
      </button>
      <Menu label="Chart" icon={<ChartColumn size={15} aria-hidden="true" />} disabled={disabled}>
        {(close) => (
          <>
            <button type="button" role="menuitem" className={item} onClick={() => (close(), onInsert(newChart("bar", count), "Add bar chart"))}>Bar chart</button>
            <button type="button" role="menuitem" className={item} onClick={() => (close(), onInsert(newChart("line", count), "Add line chart"))}>Line chart</button>
            <button type="button" role="menuitem" className={item} onClick={() => (close(), onInsert(newChart("kpi", count), "Add big number"))}>Big number</button>
            <p className="px-2.5 pb-1 pt-1.5 text-[11px] leading-[15px] text-ink-2">Starts with sample numbers marked Suggested. Enter yours in the Design panel.</p>
          </>
        )}
      </Menu>
      <PhotoDialog
        open={photo}
        onClose={() => setPhoto(false)}
        onPick={async (p) => {
          const el = newImage(p.src, p.alt, await photoAspect(p.src), count);
          onInsert(p.credit && el.type === "image" ? { ...el, credit: p.credit } : el, "Add photo");
        }}
      />
    </div>
  );
}
