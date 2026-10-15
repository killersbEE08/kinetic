"use client";

import { useEffect, useState } from "react";
import type { ChartElement, Deck, Element, Frame, Motion, ShapeKind, Slide } from "@/lib/deck/schema";
import { ElementPanel, MultiPanel } from "./ElementPanel";
import { StockSearch, UnsplashCredit } from "./StockSearch";
import { EASINGS, MOTION_PRESETS, TRANSITIONS, TRIGGERS } from "@/lib/deck/schema";
import type { PatchOp } from "@/lib/deck/patch";
import { LAYOUTS, getLayout } from "@/lib/deck/layouts";
import { THEMES } from "@/lib/deck/themes";
import { ASSET_PREFIX, MEDIA } from "@/lib/deck/media";
import { motionFor } from "@/lib/deck/motion";
import { swapLayout } from "@/lib/deck/compose";
import { addPhotoToSlide, canHavePhoto, type PhotoRef } from "@/lib/deck/place";
import { Segmented } from "@/components/ui/chrome";
import { AssetThumb, ImportZone } from "@/components/app/assets-ui";
import { useBackend, type BrandKit } from "@/lib/client/backend";
import type { AssetMeta } from "@/lib/client/assets";

type Commit = (ops: PatchOp[], opts: { label: string }) => boolean;

const PRESET_LABEL: Record<Motion["preset"], string> = {
  none: "None",
  fadeUp: "Fade up",
  maskReveal: "Mask reveal",
  typeOn: "Type on",
  scaleIn: "Scale in",
  draw: "Draw",
  countUp: "Count up",
  grow: "Grow",
  focus: "Focus",
  kenBurns: "Slow zoom",
  rise: "Rise",
};
const TRIGGER_LABEL: Record<Motion["trigger"], string> = { onClick: "On click", withPrevious: "With previous", afterPrevious: "After previous" };
const EASING_LABEL: Record<Motion["easing"], string> = { standard: "Standard", emphasized: "Emphasized", decelerate: "Decelerate", springSoft: "Spring (soft)", springSnappy: "Spring (snappy)" };
const TRANSITION_LABEL: Record<Slide["transition"], string> = { cut: "Cut", fade: "Fade", push: "Push", morph: "Morph" };

export const SHAPE_LABEL: Record<ShapeKind, string> = { rect: "Rectangle", roundRect: "Rounded rectangle", ellipse: "Ellipse", triangle: "Triangle", diamond: "Diamond", line: "Line", arrow: "Arrow", star: "Star" };

export function elementLabel(el: Element): string {
  if (el.slot === "free" && el.type === "text") return `Text: ${el.content.slice(0, 32)}${el.content.length > 32 ? "…" : ""}`;
  if (el.slot === "free" && el.type === "image") return "Photo";
  if (el.slot === "free" && el.type === "chart") return el.kind === "kpi" ? "Big number" : `${el.kind === "bar" ? "Bar" : "Line"} chart`;
  if (el.slot === "free" && el.type === "bullets") return `List: ${el.items.length} points`;
  if (el.type === "text") return `${el.slot}: ${el.content.slice(0, 32)}${el.content.length > 32 ? "…" : ""}`;
  if (el.type === "bullets") return `${el.slot}: ${el.items.length} points`;
  if (el.type === "image") return `${el.slot}: photo`;
  if (el.type === "mockup") return `${el.slot}: ${el.device} screen`;
  if (el.type === "shape") return `Shape: ${el.text ? el.text.slice(0, 24) : SHAPE_LABEL[el.shape]}`;
  if (el.type === "icon") return `Icon: ${el.name}`;
  if (el.type === "table") return `Table: ${el.rows.length} × ${el.rows[0]?.length ?? 0}`;
  return `${el.slot}: ${el.kind === "kpi" ? "numbers" : `${el.kind} chart`}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-[13px]">
      <span className="mb-1 block font-medium text-ink-2">{label}</span>
      {children}
    </label>
  );
}

// ---------------------------------------------------------------------------

export function DesignPanel({ deck, slideIndex, selected, selectedIds = [], onSelectIds, commit, frame = null, onSelect }: { deck: Deck; slideIndex: number; selected: Element | null; selectedIds?: string[]; onSelectIds?: (ids: string[]) => void; commit: Commit; frame?: Frame | null; onSelect?: (id: string | null) => void }) {
  const slide = deck.slides[slideIndex];
  const [title, setTitle] = useState(deck.title);
  // Re-sync the draft when the title changes elsewhere (undo, AI edit).
  const [seenTitle, setSeenTitle] = useState(deck.title);
  if (seenTitle !== deck.title) {
    setSeenTitle(deck.title);
    setTitle(deck.title);
  }
  const ei = selected ? slide.elements.findIndex((e) => e.id === selected.id) : -1;

  if (selectedIds.length > 1) {
    return <MultiPanel deck={deck} slideIndex={slideIndex} ids={selectedIds} commit={commit} onSelectIds={(ids) => onSelectIds?.(ids)} />;
  }

  if (selected && ei >= 0) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="min-w-0 truncate text-[13px] font-semibold">{elementLabel(selected)}</h3>
          <button type="button" className="btn btn-ghost btn-sm min-h-7 px-2 text-[12px]" onClick={() => onSelect?.(null)}>Slide settings</button>
        </div>
        <ElementPanel deck={deck} slideIndex={slideIndex} el={selected} frame={frame} commit={commit} onSelect={(id) => onSelect?.(id)} />
        {selected.type === "chart" && <ChartEditor el={selected} path={`/slides/${slideIndex}/elements/${ei}`} commit={commit} />}
        {selected.type === "image" && <PhotoPicker el={selected} path={`/slides/${slideIndex}/elements/${ei}`} commit={commit} />}
        {selected.type === "mockup" && <p className="rounded-[10px] border border-line p-3 text-[13px] text-ink-2">Product screens are edited by asking for a change in the Ask tab, for example &ldquo;rename the first row to Invoices&rdquo;.</p>}
        {selected.aiSuggested && (
          <div className="rounded-[10px] border border-dashed border-accent p-3 text-[13px]">
            <p>This element contains something that isn&rsquo;t in your notes{selected.type === "chart" ? " (or still has sample numbers)" : ""}.</p>
            <button type="button" className="btn btn-secondary btn-sm mt-2" onClick={() => commit([{ op: "replace", path: `/slides/${slideIndex}/elements/${ei}/aiSuggested`, value: false }], { label: "Mark as checked" })}>
              I checked it, remove the label
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Field label="Deck title">
        <input
          className="field"
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== deck.title && commit([{ op: "replace", path: "/title", value: title.trim() }], { label: "Rename deck" })}
        />
      </Field>

      <Field label="Layout">
        <select
          className="field"
          value={slide.layout}
          onChange={(e) => commit([{ op: "replace", path: `/slides/${slideIndex}`, value: swapLayout(slide, e.target.value) }], { label: "Change layout" })}
        >
          {LAYOUTS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.category} · {l.name}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-[12px] text-ink-2">Content that doesn&rsquo;t fit the new layout moves to speaker notes.</span>
      </Field>

      <fieldset>
        <legend className="mb-2 text-[13px] font-medium text-ink-2">Theme</legend>
        <div className="grid grid-cols-3 gap-2">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={deck.themeId === t.id}
              onClick={() => commit([{ op: "replace", path: "/themeId", value: t.id }], { label: "Change theme" })}
              className={`rounded-[8px] border p-2 text-left text-[12px] ${deck.themeId === t.id ? "border-accent" : "border-line hover:border-ink-2"}`}
            >
              <span className="mb-1 flex h-6 overflow-hidden rounded-[4px]" aria-hidden="true">
                <span className="flex-1" style={{ background: t.colors.bg }} />
                <span className="w-2" style={{ background: t.colors.text }} />
                <span className="w-2" style={{ background: t.colors.accent }} />
              </span>
              {t.name}
            </button>
          ))}
        </div>
      </fieldset>

      {selected?.type === "chart" && ei >= 0 && <ChartEditor el={selected} path={`/slides/${slideIndex}/elements/${ei}`} commit={commit} />}
      {selected?.type === "image" && ei >= 0 && <PhotoPicker el={selected} path={`/slides/${slideIndex}/elements/${ei}`} commit={commit} />}
      {!selected && <AddPhoto key={slide.id} slide={slide} slideIndex={slideIndex} commit={commit} />}
      {!selected && slide.elements.some((e) => e.type === "image") && <p className="text-[12px] text-ink-2">Click the photo on the slide to swap it for one of yours.</p>}
      {selected?.type === "mockup" && <p className="rounded-[10px] border border-line p-3 text-[13px] text-ink-2">Product screens are edited by asking for a change in the Ask tab, for example &ldquo;rename the first row to Invoices&rdquo;.</p>}
      <BrandKitPicker deck={deck} commit={commit} />
      {deck.brand && (
        <div className="flex items-center justify-between gap-3 rounded-[10px] border border-line p-3 text-[13px]">
          <span>
            Brand: <strong className="font-medium">{deck.brand.name}</strong>
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => commit([{ op: "remove", path: "/brand" }], { label: "Remove brand" })}>
            Use theme colours
          </button>
        </div>
      )}

      {selected?.aiSuggested && ei >= 0 && (
        <div className="rounded-[10px] border border-dashed border-accent p-3 text-[13px]">
          <p>This element contains something that isn&rsquo;t in your notes.</p>
          <button type="button" className="btn btn-secondary btn-sm mt-2" onClick={() => commit([{ op: "replace", path: `/slides/${slideIndex}/elements/${ei}/aiSuggested`, value: false }], { label: "Mark as checked" })}>
            I checked it, remove the label
          </button>
        </div>
      )}
    </div>
  );
}

/** Apply one of the user's brand kits to the whole deck. */
function BrandKitPicker({ deck, commit }: { deck: Deck; commit: Commit }) {
  const backend = useBackend();
  const [kits, setKits] = useState<BrandKit[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    backend
      .listBrandKits()
      .then((k) => !cancelled && setKits(k))
      .catch(() => !cancelled && setKits([]));
    return () => {
      cancelled = true;
    };
  }, [backend]);
  if (!kits) return null;
  const current = kits.find((k) => deck.brand && k.kit.name === deck.brand.name && k.kit.primary === deck.brand.primary);
  return (
    <Field label="Brand kit">
      {kits.length ? (
        <select
          className="field"
          value={current?.id ?? ""}
          onChange={(e) => {
            const k = kits.find((x) => x.id === e.target.value);
            if (k) commit([{ op: "add", path: "/brand", value: k.kit }], { label: `Apply ${k.kit.name} brand` });
            else if (deck.brand) commit([{ op: "remove", path: "/brand" }], { label: "Remove brand" });
          }}
        >
          <option value="">{deck.brand && !current ? `${deck.brand.name} (from template)` : "None (theme colours)"}</option>
          {kits.map((k) => <option key={k.id} value={k.id}>{k.kit.name}</option>)}
        </select>
      ) : (
        <a href="/brand" className="block text-[13px] font-medium text-accent hover:underline">Create a brand kit with your logo and colours</a>
      )}
    </Field>
  );
}

/** Uploaded photos plus the built-in library, as one grid. Used to swap or add a photo. */
export function PhotoChooser({ value, onChoose }: { value?: string; onChoose: (p: PhotoRef) => void }) {
  const backend = useBackend();
  const [uploads, setUploads] = useState<AssetMeta[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    backend
      .listAssets()
      .then((r) => !cancelled && setUploads(r.assets))
      .catch(() => !cancelled && setUploads([]));
    return () => {
      cancelled = true;
    };
  }, [backend]);
  const tile = (key: string, src: string, alt: string, img: React.ReactNode, ref: PhotoRef) => (
    <button key={key} type="button" role="radio" aria-checked={value === src} aria-label={alt} onClick={() => onChoose(ref)} className={`overflow-hidden rounded-[6px] border-2 ${value === src ? "border-accent" : "border-transparent hover:border-line"}`}>
      {img}
    </button>
  );
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-[12px] font-medium text-ink-2">Your photos</p>
        <ImportZone allowDocs={false} compact onImported={(_, p) => setUploads((u) => [...p, ...(u ?? [])])}>
          <span className="text-[12px]">Drop a photo or <span className="text-accent underline">upload</span></span>
        </ImportZone>
        {uploads && uploads.length > 0 && (
          <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Your photos">
            {uploads.map((a) => tile(a.id, ASSET_PREFIX + a.id, a.alt, <AssetThumb id={a.id} alt="" className="aspect-[4/3] w-full" />, { src: ASSET_PREFIX + a.id, alt: a.alt || a.name }))}
          </div>
        )}
      </div>
      <div>
        <p className="mb-1.5 text-[12px] font-medium text-ink-2">Free stock photos</p>
        <StockSearch onChoose={onChoose} />
      </div>
      <div>
        <p className="mb-1.5 text-[12px] font-medium text-ink-2">Built-in library</p>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Built-in photos">
          {/* eslint-disable-next-line @next/next/no-img-element -- small library thumbnails */}
          {MEDIA.map((m) => tile(m.id, m.src, m.alt, <img src={`${m.src}-640.jpg`} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />, { src: m.src, alt: m.alt, focal: m.focal }))}
        </div>
      </div>
    </div>
  );
}

/** Adds a photo to a text slide by switching it to the matching photo layout. */
function AddPhoto({ slide, slideIndex, commit }: { slide: Slide; slideIndex: number; commit: Commit }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!canHavePhoto(slide)) return null;
  return (
    <fieldset className="rounded-[10px] border border-line p-3">
      <legend className="px-1 text-[13px] font-medium text-ink-2">Photo</legend>
      {!open ? (
        <button type="button" className="btn btn-secondary btn-sm w-full" onClick={() => setOpen(true)}>Add a photo to this slide</button>
      ) : (
        <>
          <PhotoChooser
            onChoose={(p) => {
              const next = addPhotoToSlide(slide, p);
              if (!next) {
                setMsg("This slide has too many points for a photo layout. Remove one and try again.");
                return;
              }
              commit([{ op: "replace", path: `/slides/${slideIndex}`, value: next }], { label: "Add photo" });
              setOpen(false);
              setMsg(null);
            }}
          />
          <button type="button" className="btn btn-ghost btn-sm mt-2 w-full" onClick={() => setOpen(false)}>Cancel</button>
        </>
      )}
      {msg && <p className="mt-2 text-[12px] text-danger" role="alert">{msg}</p>}
    </fieldset>
  );
}

/** Swap a photo (uploads or the built-in library), and edit its alt text. */
function PhotoPicker({ el, path, commit }: { el: Extract<Element, { type: "image" }>; path: string; commit: Commit }) {
  const [alt, setAlt] = useState(el.alt);
  const [seen, setSeen] = useState(el.alt);
  if (seen !== el.alt) {
    setSeen(el.alt);
    setAlt(el.alt);
  }
  return (
    <fieldset className="rounded-[10px] border border-line p-3">
      <legend className="px-1 text-[13px] font-medium text-ink-2">Photo</legend>
      <PhotoChooser
        value={el.src}
        onChoose={(m) =>
          commit(
            [
              { op: "replace", path: `${path}/src`, value: m.src },
              { op: "replace", path: `${path}/alt`, value: m.alt },
              { op: "replace", path: `${path}/focal`, value: m.focal ?? [0.5, 0.5] },
              ...(m.credit ? [{ op: "add" as const, path: `${path}/credit`, value: m.credit }] : el.credit ? [{ op: "remove" as const, path: `${path}/credit` }] : []),
            ],
            { label: "Change photo" },
          )
        }
      />
      <label className="mt-3 block text-[12px] font-medium text-ink-2">
        Alt text
        <input className="field mt-1 text-[13px]" value={alt} maxLength={250} onChange={(e) => setAlt(e.target.value)} onBlur={() => alt.trim() && alt !== el.alt && commit([{ op: "replace", path: `${path}/alt`, value: alt.trim() }], { label: "Edit alt text" })} />
      </label>
      <FocalPicker el={el} path={path} commit={commit} />
      {el.credit ? <UnsplashCredit credit={el.credit} className="mt-2" /> : <p className="mt-2 text-[11px] text-ink-2">Library photos are CC0 or public domain. Only upload photos you have the rights to.</p>}
    </fieldset>
  );
}

/** Choose which part of the photo stays in view when it's cropped. */
function FocalPicker({ el, path, commit }: { el: Extract<Element, { type: "image" }>; path: string; commit: Commit }) {
  const spots: [number, number, string][] = [
    [0.5, 0.2, "Top"],
    [0.5, 0.5, "Centre"],
    [0.5, 0.8, "Bottom"],
    [0.2, 0.5, "Left"],
    [0.8, 0.5, "Right"],
  ];
  return (
    <div className="mt-3">
      <span className="block text-[12px] font-medium text-ink-2">Keep in view</span>
      <div className="mt-1 flex flex-wrap gap-1" role="radiogroup" aria-label="Keep in view">
        {spots.map(([x, y, label]) => {
          const on = Math.abs(el.focal[0] - x) < 0.05 && Math.abs(el.focal[1] - y) < 0.05;
          return (
            <button key={label} type="button" role="radio" aria-checked={on} onClick={() => commit([{ op: "replace", path: `${path}/focal`, value: [x, y] }], { label: "Move photo crop" })} className={`h-7 rounded-[6px] border px-2 text-[12px] ${on ? "border-accent text-ink" : "border-line text-ink-2 hover:text-ink"}`}>
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Spreadsheet-style popover for chart data (PRD ED-5). */
function ChartEditor({ el, path, commit }: { el: ChartElement; path: string; commit: Commit }) {
  const toRows = (c: ChartElement) => c.data.labels.map((l, i) => ({ label: l, value: String(c.data.series[0]?.values[i] ?? "") }));
  const [rows, setRows] = useState(() => toRows(el));
  const [unit, setUnit] = useState(el.unit ?? el.units?.find(Boolean) ?? "");
  // Re-sync when the chart changes elsewhere (undo, AI edit, another element selected).
  const [seen, setSeen] = useState(el);
  if (seen !== el) {
    setSeen(el);
    setRows(toRows(el));
    setUnit(el.unit ?? "");
  }
  const valid = rows.length > 0 && rows.every((r) => r.value.trim() !== "" && Number.isFinite(Number(r.value)));
  const apply = () => {
    if (!valid) return;
    const data = { labels: rows.map((r) => r.label.slice(0, 40)), series: [{ name: el.data.series[0]?.name ?? "Value", values: rows.map((r) => Number(r.value)) }, ...el.data.series.slice(1).map((s) => ({ ...s, values: s.values.slice(0, rows.length) }))] };
    const ops: PatchOp[] = [
      { op: "replace", path: `${path}/data`, value: data },
      { op: "replace", path: `${path}/aiSuggested`, value: false },
    ];
    const u = unit.trim().slice(0, 8);
    if (u) ops.push({ op: "add", path: `${path}/unit`, value: u });
    else if (el.unit !== undefined) ops.push({ op: "remove", path: `${path}/unit` });
    // One unit field in this editor: drop per-value units so the chart shows what was typed.
    if (el.units !== undefined) ops.push({ op: "remove", path: `${path}/units` });
    commit(ops, { label: "Edit chart data" });
  };
  return (
    <fieldset className="rounded-[10px] border border-line p-3">
      <legend className="px-1 text-[13px] font-medium text-ink-2">Chart data</legend>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-ink-2">
            <th className="pb-1 font-medium">Label</th>
            <th className="pb-1 font-medium">Value</th>
            <th className="sr-only">Remove</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="pr-1 pb-1">
                <input aria-label={`Label ${i + 1}`} className="field h-8 py-0 text-[13px]" value={r.label} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} />
              </td>
              <td className="pr-1 pb-1">
                <input aria-label={`Value ${i + 1}`} inputMode="decimal" className="field tabular h-8 py-0 text-right text-[13px]" value={r.value} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)))} />
              </td>
              <td className="pb-1">
                <button type="button" className="btn btn-ghost btn-sm px-2" aria-label={`Remove row ${i + 1}`} disabled={rows.length <= 1} onClick={() => setRows(rows.filter((_, k) => k !== i))}>
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" className="btn btn-ghost btn-sm" disabled={rows.length >= (el.kind === "kpi" ? 4 : 12)} onClick={() => setRows([...rows, { label: "", value: "0" }])}>
          Add row
        </button>
        <label className="ml-auto flex items-center gap-1 text-[12px] text-ink-2">
          Unit
          <input className="field h-8 w-16 py-0 text-[13px]" value={unit} maxLength={8} onChange={(e) => setUnit(e.target.value)} />
        </label>
      </div>
      <button type="button" className="btn btn-primary btn-sm mt-3 w-full" onClick={apply} disabled={!valid}>
        Apply data
      </button>
      {!valid && <p className="mt-1 text-[12px] text-danger">Every value must be a number.</p>}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------

export function MotionPanel({ deck, slideIndex, selectedId, onSelect, commit, onPreview }: { deck: Deck; slideIndex: number; selectedId: string | null; onSelect: (id: string) => void; commit: Commit; onPreview: () => void }) {
  const slide = deck.slides[slideIndex];
  const ordered = slide.elements.map((el, i) => ({ el, i, m: motionFor(slide, el, i) })).sort((a, b) => a.m.order - b.m.order);

  const setMotion = (i: number, m: Motion, label: string) => commit([{ op: "add", path: `/slides/${slideIndex}/elements/${i}/motion`, value: m }], { label });

  const moveOrder = (pos: number, d: -1 | 1) => {
    const j = pos + d;
    if (j < 0 || j >= ordered.length) return;
    const next = [...ordered];
    [next[pos], next[j]] = [next[j], next[pos]];
    commit(
      next.map(({ i, m }, order) => ({ op: "add" as const, path: `/slides/${slideIndex}/elements/${i}/motion`, value: { ...m, order } })),
      { label: "Reorder builds" },
    );
  };

  return (
    <div className="space-y-6">
      <Field label="Deck motion">
        <Segmented
          size="sm"
          label="Motion intensity"
          value={deck.motionIntensity}
          onChange={(v) => commit([{ op: "replace", path: "/motionIntensity", value: v }], { label: "Change motion intensity" })}
          options={[
            { value: "calm", label: "Calm" },
            { value: "standard", label: "Standard" },
            { value: "expressive", label: "Expressive" },
          ]}
        />
      </Field>

      <Field label="Transition into this slide">
        <select className="field" value={slide.transition} onChange={(e) => commit([{ op: "replace", path: `/slides/${slideIndex}/transition`, value: e.target.value }], { label: "Change transition" })}>
          {TRANSITIONS.map((t) => (
            <option key={t} value={t}>{TRANSITION_LABEL[t]}</option>
          ))}
        </select>
      </Field>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[13px] font-medium text-ink-2">Build order</h3>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onPreview}>Preview</button>
        </div>
        <ol className="space-y-2">
          {ordered.map(({ el, i, m }, pos) => {
            const open = selectedId === el.id;
            return (
              <li key={el.id} className={`rounded-[10px] border ${open ? "border-accent" : "border-line"}`}>
                <div className="flex items-center gap-1 p-2">
                  <button type="button" className="min-w-0 flex-1 truncate text-left text-[13px]" onClick={() => onSelect(el.id)} aria-expanded={open}>
                    <span className="tabular mr-2 text-ink-2">{pos + 1}</span>
                    {elementLabel(el)}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm px-2" aria-label="Build earlier" disabled={pos === 0} onClick={() => moveOrder(pos, -1)}>↑</button>
                  <button type="button" className="btn btn-ghost btn-sm px-2" aria-label="Build later" disabled={pos === ordered.length - 1} onClick={() => moveOrder(pos, 1)}>↓</button>
                </div>
                {open && (
                  <div className="grid grid-cols-2 gap-2 border-t border-line p-2">
                    <Field label="Effect">
                      <select className="field h-9 py-0 text-[13px]" value={m.preset} onChange={(e) => setMotion(i, { ...m, preset: e.target.value as Motion["preset"] }, "Change effect")}>
                        {MOTION_PRESETS.map((p) => (
                          <option key={p} value={p}>{PRESET_LABEL[p]}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Start">
                      <select className="field h-9 py-0 text-[13px]" value={m.trigger} onChange={(e) => setMotion(i, { ...m, trigger: e.target.value as Motion["trigger"] }, "Change start")}>
                        {TRIGGERS.map((t) => (
                          <option key={t} value={t}>{TRIGGER_LABEL[t]}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Delay (ms)">
                      <input type="number" min={0} max={5000} step={50} className="field tabular h-9 py-0 text-[13px]" value={m.delayMs} onChange={(e) => setMotion(i, { ...m, delayMs: Math.max(0, Math.min(5000, Math.round(Number(e.target.value) || 0))) }, "Change delay")} />
                    </Field>
                    <Field label="Duration (ms)">
                      <input type="number" min={80} max={3000} step={20} className="field tabular h-9 py-0 text-[13px]" value={m.durationMs} onChange={(e) => setMotion(i, { ...m, durationMs: Math.max(80, Math.min(3000, Math.round(Number(e.target.value) || 320))) }, "Change duration")} />
                    </Field>
                    <div className="col-span-2">
                      <Field label="Easing">
                        <select className="field h-9 py-0 text-[13px]" value={m.easing} onChange={(e) => setMotion(i, { ...m, easing: e.target.value as Motion["easing"] }, "Change easing")}>
                          {EASINGS.map((x) => (
                            <option key={x} value={x}>{EASING_LABEL[x]}</option>
                          ))}
                        </select>
                      </Field>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-[12px] text-ink-2">
          {getLayout(slide.layout).name} layout. &ldquo;On click&rdquo; starts a new build step in present mode.
        </p>
      </div>
    </div>
  );
}
