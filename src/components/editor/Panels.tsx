"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Play } from "lucide-react";
import type { ChartElement, Deck, Element, Frame, Motion, ShapeKind, Slide } from "@/lib/deck/schema";
import { ElementPanel, MultiPanel } from "./ElementPanel";
import { StockSearch, UnsplashCredit } from "./StockSearch";
import { EASINGS, MOTION_PRESETS, TRANSITIONS, TRIGGERS } from "@/lib/deck/schema";
import type { PatchOp } from "@/lib/deck/patch";
import { LAYOUTS, getLayout } from "@/lib/deck/layouts";
import { THEMES, deckTheme } from "@/lib/deck/themes";
import { SlideView } from "@/components/deck/SlideView";
import { Modal } from "./ui";
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

const SLOT_LABEL: Record<string, string> = { title: "Title", subtitle: "Subtitle", body: "Text", points: "Points", media: "Photo", statement: "Statement", quote: "Quote", attribution: "Attribution", chart: "Chart", kpis: "Numbers", label: "Label", caption: "Caption" };
const slotName = (s: string) => SLOT_LABEL[s] ?? s.charAt(0).toUpperCase() + s.slice(1).replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();

export function elementLabel(el: Element): string {
  if (el.slot === "free" && el.type === "text") return `Text: ${el.content.slice(0, 32)}${el.content.length > 32 ? "…" : ""}`;
  if (el.slot === "free" && el.type === "image") return "Photo";
  if (el.slot === "free" && el.type === "chart") return el.kind === "kpi" ? "Big number" : `${el.kind === "bar" ? "Bar" : "Line"} chart`;
  if (el.slot === "free" && el.type === "bullets") return `List: ${el.items.length} points`;
  if (el.type === "text") return `${slotName(el.slot)}: ${el.content.slice(0, 32)}${el.content.length > 32 ? "…" : ""}`;
  if (el.type === "bullets") return `${slotName(el.slot)}: ${el.items.length} points`;
  if (el.type === "image") return slotName(el.slot) === "Photo" ? "Photo" : `${slotName(el.slot)}: photo`;
  if (el.type === "mockup") return `Product screen (${el.device})`;
  if (el.type === "shape") return `Shape: ${el.text ? el.text.slice(0, 24) : SHAPE_LABEL[el.shape]}`;
  if (el.type === "icon") return `Icon: ${el.name}`;
  if (el.type === "table") return `Table: ${el.rows.length} × ${el.rows[0]?.length ?? 0}`;
  return `${slotName(el.slot)}: ${el.kind === "kpi" ? "numbers" : `${el.kind} chart`}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-[13px]">
      <span className="mb-1 block font-medium text-ink-2">{label}</span>
      {children}
    </label>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-2">{children}</h3>;
}

/** Current layout as a card; opens a visual grid of every layout, previewed with this slide's content. */
function LayoutPicker({ deck, slide, onPick }: { deck: Deck; slide: Slide; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const theme = deckTheme(deck);
  const current = getLayout(slide.layout);
  const groups = LAYOUTS.reduce<Record<string, typeof LAYOUTS>>((g, l) => ((g[l.category] ??= []).push(l), g), {});
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-3 rounded-[10px] border border-line p-2 text-left hover:border-ink-2" aria-haspopup="dialog">
        <span className="w-[88px] flex-none overflow-hidden rounded-[5px] border border-line">
          <SlideView slide={slide} theme={theme} intensity={deck.motionIntensity} mode="static" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] text-ink-2">Layout · {current.category}</span>
          <span className="block truncate text-[13px] font-semibold">{current.name}</span>
        </span>
        <span className="text-[12px] font-medium text-accent">Change</span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Choose a layout" width="w-[min(880px,calc(100vw-32px))]">
        <p className="mb-4 text-[13px] text-ink-2">Previews use this slide&rsquo;s content. Anything a layout can&rsquo;t show moves to speaker notes, and you can undo.</p>
        <div className="space-y-5">
          {Object.entries(groups).map(([cat, list]) => (
            <section key={cat}>
              <h4 className="mb-2 text-[12px] font-semibold text-ink-2">{cat}</h4>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {list.map((l) => {
                  const on = l.id === slide.layout;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        if (!on) onPick(l.id);
                        setOpen(false);
                      }}
                      className="group text-left"
                    >
                      <span className={`block overflow-hidden rounded-[8px] border-2 ${on ? "border-accent" : "border-line group-hover:border-ink-2"}`}>
                        <SlideView slide={on ? slide : swapLayout(slide, l.id)} theme={theme} intensity={deck.motionIntensity} mode="static" />
                      </span>
                      <span className={`mt-1 block truncate text-[12px] ${on ? "font-semibold text-accent" : ""}`}>{l.name}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------

export function DesignPanel({ deck, slideIndex, selected, selectedIds = [], onSelectIds, commit, frame = null, onSelect }: { deck: Deck; slideIndex: number; selected: Element | null; selectedIds?: string[]; onSelectIds?: (ids: string[]) => void; commit: Commit; frame?: Frame | null; onSelect?: (id: string | null) => void }) {
  const slide = deck.slides[slideIndex];
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
      <section>
        <SectionTitle>This slide</SectionTitle>
        <LayoutPicker deck={deck} slide={slide} onPick={(id) => commit([{ op: "replace", path: `/slides/${slideIndex}`, value: swapLayout(slide, id) }], { label: "Change layout" })} />
        <p className="mt-1.5 text-[12px] leading-[17px] text-ink-2">Content that doesn&rsquo;t fit the new layout moves to speaker notes.</p>
      </section>

      <BackgroundPicker key={`bg-${slide.id}`} deck={deck} slide={slide} slideIndex={slideIndex} commit={commit} />

      <section>
        <SectionTitle>Deck theme</SectionTitle>
        <div className="grid grid-cols-3 gap-2">
          {THEMES.map((t) => {
            const on = deck.themeId === t.id;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                onClick={() => commit([{ op: "replace", path: "/themeId", value: t.id }], { label: "Change theme" })}
                className={`group rounded-[10px] border p-1.5 text-left text-[12px] transition-colors ${on ? "border-accent ring-2 ring-[color-mix(in_srgb,var(--accent)_25%,transparent)]" : "border-line hover:border-ink-2"}`}
              >
                <span className="relative mb-1.5 flex aspect-[16/10] flex-col justify-end overflow-hidden rounded-[6px] p-1.5" style={{ background: t.colors.bg }} aria-hidden="true">
                  <span className="mb-1 block h-1.5 w-3/4 rounded-full" style={{ background: t.colors.text }} />
                  <span className="block h-1 w-1/2 rounded-full opacity-60" style={{ background: t.colors.text }} />
                  <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full" style={{ background: t.colors.accent }} />
                </span>
                <span className={`block truncate px-0.5 ${on ? "font-semibold" : ""}`}>{t.name}</span>
              </button>
            );
          })}
        </div>
      </section>

      {selected?.type === "chart" && ei >= 0 && <ChartEditor el={selected} path={`/slides/${slideIndex}/elements/${ei}`} commit={commit} />}
      {selected?.type === "image" && ei >= 0 && <PhotoPicker el={selected} path={`/slides/${slideIndex}/elements/${ei}`} commit={commit} />}
      {!selected && <AddPhoto key={slide.id} slide={slide} slideIndex={slideIndex} commit={commit} />}
      {!selected && slide.elements.some((e) => e.type === "image") && <p className="-mt-3 text-[12px] text-ink-2">Tip: click the photo on the slide to swap it for one of yours.</p>}
      {selected?.type === "mockup" && <p className="rounded-[10px] border border-line p-3 text-[13px] text-ink-2">Product screens are edited by asking for a change in the Ask tab, for example &ldquo;rename the first row to Invoices&rdquo;.</p>}
      <section>
        <SectionTitle>Brand</SectionTitle>
        {deck.brand && (
          <div className="mb-3 flex items-center gap-2.5 rounded-[10px] border border-line p-2.5 text-[13px]">
            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-[6px]" style={{ background: deck.brand.primary }} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{deck.brand.name}</span>
              <span className="block text-[11px] uppercase text-ink-2">{deck.brand.primary}</span>
            </span>
            <button type="button" className="btn btn-ghost btn-sm min-h-7 px-2 text-[12px]" onClick={() => commit([{ op: "remove", path: "/brand" }], { label: "Remove brand" })}>
              Remove
            </button>
          </div>
        )}
        <BrandKitPicker deck={deck} commit={commit} />
      </section>

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

/** A slide's own background colour or photo. Text switches to light or dark to stay readable. */
function BackgroundPicker({ deck, slide, slideIndex, commit }: { deck: Deck; slide: Slide; slideIndex: number; commit: Commit }) {
  const [photoOpen, setPhotoOpen] = useState(false);
  const bg = slide.background;
  const path = `/slides/${slideIndex}/background`;
  const theme = deckTheme(deck);
  const set = (value: NonNullable<Slide["background"]>, label: string) => commit([{ op: "add", path, value }], { label });
  const clear = () => bg && commit([{ op: "remove", path }], { label: "Use theme background" });
  const swatches = [...new Set([theme.colors.bg, "#ffffff", "#f5f3ee", "#0b0b0c", "#14213d", theme.colors.accent, deck.brand?.primary, deck.brand?.secondary].filter((c): c is string => !!c && /^#[0-9a-fA-F]{6}$/.test(c)).map((c) => c.toLowerCase()))].slice(0, 8);
  const [dim, setDim] = useState(bg?.dim ?? 0.35);
  const saveDim = () => bg?.image && dim !== (bg.dim ?? 0.35) && set({ ...bg, dim }, "Darken background photo");
  return (
    <section>
      <div className="flex items-start justify-between">
        <SectionTitle>Background</SectionTitle>
        {bg && (
          <button type="button" className="text-[12px] font-medium text-ink-2 hover:text-ink" onClick={clear}>
            Reset
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Background colour">
        <button type="button" role="radio" aria-checked={!bg} title="Theme background" onClick={clear} className={`flex h-7 items-center rounded-full border px-2.5 text-[11.5px] font-medium ${!bg ? "border-accent text-ink" : "border-line text-ink-2 hover:text-ink"}`}>
          Theme
        </button>
        {swatches.map((c) => {
          const on = !bg?.image && bg?.color?.toLowerCase() === c;
          return (
            <button key={c} type="button" role="radio" aria-checked={on} aria-label={`Background ${c}`} title={c} onClick={() => set({ color: c }, "Change background colour")} className={`h-7 w-7 rounded-full border border-line ${on ? "ring-2 ring-accent ring-offset-2 ring-offset-[var(--surface)]" : ""}`} style={{ background: c }} />
          );
        })}
        <label className="relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-dashed border-ink-2 text-[14px] text-ink-2 hover:text-ink" title="Pick any colour">
          +
          <input type="color" aria-label="Custom background colour" className="absolute inset-0 cursor-pointer opacity-0" value={bg?.color ?? theme.colors.bg} onChange={(e) => set({ ...(bg?.image ? { image: bg.image, dim: bg.dim } : {}), color: e.target.value }, "Change background colour")} />
        </label>
      </div>

      <div className="mt-3 rounded-[10px] border border-line p-2.5">
        {bg?.image ? (
          <>
            <div className="flex items-center gap-2.5">
              <span className="w-[72px] flex-none overflow-hidden rounded-[5px] border border-line">
                <SlideView slide={{ ...slide, elements: [] }} theme={theme} intensity={deck.motionIntensity} mode="static" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-[12.5px] leading-[17px]">{bg.image.alt}</span>
                <span className="mt-1 flex gap-3 text-[12px] font-medium">
                  <button type="button" className="text-accent hover:underline" onClick={() => setPhotoOpen(true)}>Change</button>
                  <button type="button" className="text-ink-2 hover:text-danger" onClick={() => (bg.color ? set({ color: bg.color }, "Remove background photo") : clear())}>Remove</button>
                </span>
              </span>
            </div>
            <label className="mt-2.5 flex items-center gap-2.5 text-[12px] text-ink-2">
              Darken
              <input type="range" min={0} max={0.85} step={0.05} value={dim} onChange={(e) => setDim(Number(e.target.value))} onPointerUp={saveDim} onKeyUp={saveDim} className="flex-1 accent-[var(--accent)]" aria-label="Darken background photo" />
              <span className="tabular w-9 text-right">{Math.round(dim * 100)}%</span>
            </label>
            {bg.image.credit && <UnsplashCredit credit={bg.image.credit} className="mt-2" />}
          </>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm min-h-8 w-full text-[12px]" onClick={() => setPhotoOpen(true)}>
            Use a photo as the background
          </button>
        )}
      </div>
      <p className="mt-1.5 text-[12px] leading-[17px] text-ink-2">Only this slide. Text turns light or dark so it stays readable.</p>
      <Modal open={photoOpen} onClose={() => setPhotoOpen(false)} title="Background photo">
        <PhotoChooser
          value={bg?.image?.src}
          onChoose={(p) => {
            set({ ...(bg?.color ? { color: bg.color } : {}), image: { src: p.src, alt: p.alt, focal: p.focal ?? [0.5, 0.5], ...(p.credit ? { credit: p.credit } : {}) }, dim: bg?.dim ?? 0.35 }, "Set background photo");
            setPhotoOpen(false);
          }}
        />
      </Modal>
    </section>
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


  const ctl = "field h-9 py-0 text-[13px]";
  return (
    <div className="space-y-6">
      <section>
        <SectionTitle>Whole deck</SectionTitle>
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
      </section>

      <section>
        <SectionTitle>Transition into this slide</SectionTitle>
        <div className="grid grid-cols-4 gap-1" role="radiogroup" aria-label="Transition into this slide">
          {TRANSITIONS.map((t) => {
            const on = slide.transition === t;
            return (
              <button key={t} type="button" role="radio" aria-checked={on} onClick={() => !on && commit([{ op: "replace", path: `/slides/${slideIndex}/transition`, value: t }], { label: "Change transition" })} className={`h-8 rounded-[8px] border text-[12px] font-medium transition-colors ${on ? "border-accent bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] text-ink" : "border-line text-ink-2 hover:border-ink-2 hover:text-ink"}`}>
                {TRANSITION_LABEL[t]}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-2.5 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-2">Build order</h3>
          <button type="button" className="btn btn-secondary btn-sm min-h-7 gap-1 px-2.5 text-[12px]" onClick={onPreview}>
            <Play size={12} aria-hidden="true" />
            Preview
          </button>
        </div>
        <ol className="space-y-1.5">
          {ordered.map(({ el, i, m }, pos) => {
            const open = selectedId === el.id;
            const label = elementLabel(el);
            return (
              <li key={el.id} className={`overflow-hidden rounded-[10px] border transition-colors ${open ? "border-accent shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_12%,transparent)]" : "border-line hover:border-[color-mix(in_srgb,var(--ink-2)_50%,var(--line))]"}`}>
                <div className="flex items-center gap-1 py-1.5 pl-2 pr-1">
                  <span className={`tabular flex h-5 w-5 flex-none items-center justify-center rounded-full text-[11px] font-semibold ${open ? "bg-accent text-white" : "bg-[color-mix(in_srgb,var(--ink)_7%,transparent)] text-ink-2"}`} aria-hidden="true">{pos + 1}</span>
                  <button type="button" className="min-w-0 flex-1 px-1 text-left" onClick={() => onSelect(el.id)} aria-expanded={open} title={label}>
                    <span className="block truncate text-[13px] font-medium">{label}</span>
                    <span className="block truncate text-[11.5px] text-ink-2">
                      {m.preset === "none" ? "No animation" : `${PRESET_LABEL[m.preset]} · ${TRIGGER_LABEL[m.trigger].toLowerCase()}`}
                    </span>
                  </button>
                  <button type="button" className="flex h-7 w-7 flex-none items-center justify-center rounded-[6px] text-ink-2 hover:bg-[color-mix(in_srgb,var(--ink)_7%,transparent)] hover:text-ink disabled:opacity-30" aria-label={`Build ${label} earlier`} title="Build earlier" disabled={pos === 0} onClick={() => moveOrder(pos, -1)}>
                    <ArrowUp size={14} aria-hidden="true" />
                  </button>
                  <button type="button" className="flex h-7 w-7 flex-none items-center justify-center rounded-[6px] text-ink-2 hover:bg-[color-mix(in_srgb,var(--ink)_7%,transparent)] hover:text-ink disabled:opacity-30" aria-label={`Build ${label} later`} title="Build later" disabled={pos === ordered.length - 1} onClick={() => moveOrder(pos, 1)}>
                    <ArrowDown size={14} aria-hidden="true" />
                  </button>
                </div>
                {open && (
                  <div className="space-y-2.5 border-t border-line bg-[color-mix(in_srgb,var(--ink)_2%,var(--surface))] p-2.5">
                    <Field label="Effect">
                      <select className={ctl} value={m.preset} onChange={(e) => setMotion(i, { ...m, preset: e.target.value as Motion["preset"] }, "Change effect")}>
                        {MOTION_PRESETS.map((p) => (
                          <option key={p} value={p}>{PRESET_LABEL[p]}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Start">
                      <select className={ctl} value={m.trigger} onChange={(e) => setMotion(i, { ...m, trigger: e.target.value as Motion["trigger"] }, "Change start")}>
                        {TRIGGERS.map((t) => (
                          <option key={t} value={t}>{TRIGGER_LABEL[t]}</option>
                        ))}
                      </select>
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Delay">
                        <span className="relative block">
                          <input type="number" min={0} max={5000} step={50} className={`${ctl} tabular pr-9`} value={m.delayMs} onChange={(e) => setMotion(i, { ...m, delayMs: Math.max(0, Math.min(5000, Math.round(Number(e.target.value) || 0))) }, "Change delay")} />
                          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-ink-2">ms</span>
                        </span>
                      </Field>
                      <Field label="Duration">
                        <span className="relative block">
                          <input type="number" min={80} max={3000} step={20} className={`${ctl} tabular pr-9`} value={m.durationMs} onChange={(e) => setMotion(i, { ...m, durationMs: Math.max(80, Math.min(3000, Math.round(Number(e.target.value) || 320))) }, "Change duration")} />
                          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-ink-2">ms</span>
                        </span>
                      </Field>
                    </div>
                    <Field label="Easing">
                      <select className={ctl} value={m.easing} onChange={(e) => setMotion(i, { ...m, easing: e.target.value as Motion["easing"] }, "Change easing")}>
                        {EASINGS.map((x) => (
                          <option key={x} value={x}>{EASING_LABEL[x]}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        <p className="mt-2.5 text-[12px] leading-[17px] text-ink-2">
          {getLayout(slide.layout).name} layout. &ldquo;On click&rdquo; starts a new build step when you present.
        </p>
      </section>
    </div>
  );
}
