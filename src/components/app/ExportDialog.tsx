"use client";

// Download dialog: PowerPoint (editable, animated), PDF (slides or handout), or one slide as PNG.
import { useEffect, useRef, useState } from "react";
import type { Deck } from "@/lib/deck/schema";
import { hiddenCount, presentable } from "@/lib/deck/slides";
import { Segmented } from "@/components/ui/chrome";
import { track } from "@/lib/client/track";

type Format = "pptx" | "pdf" | "png";

export function ExportDialog({ deck, slideIndex, open, onClose }: { deck: Deck; slideIndex: number; open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [format, setFormat] = useState<Format>("pptx");
  const [fonts, setFonts] = useState<"original" | "office">("original");
  const [animations, setAnimations] = useState(true);
  const [notes, setNotes] = useState(true);
  const [layout, setLayout] = useState<"slides" | "handout">("slides");
  const [quality, setQuality] = useState<"standard" | "high">("standard");
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [withHidden, setWithHidden] = useState(false);
  const hidden = hiddenCount(deck);
  const out = withHidden ? deck : presentable(deck);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  async function run() {
    setError(null);
    setDone(null);
    setProgress("Preparing");
    const tick = (n: number, total: number) => setProgress(`Drawing slide ${n} of ${total}`);
    const t0 = performance.now();
    try {
      const { download, fileBase } = await import("@/lib/export/render");
      const base = fileBase(deck.title);
      if (format === "pptx") {
        const { exportPptx } = await import("@/lib/export/pptx");
        const blob = await exportPptx(out, { fonts, animations, notes }, tick);
        download(blob, `${base}.pptx`);
        setDone(`${base}.pptx downloaded.`);
      } else if (format === "pdf") {
        const { exportPdf } = await import("@/lib/export/pdf");
        const blob = await exportPdf(out, { layout, quality }, tick);
        download(blob, `${base}${layout === "handout" ? " (handout)" : ""}.pdf`);
        setDone("PDF downloaded.");
      } else {
        const { exportSlidePng } = await import("@/lib/export/pdf");
        const blob = await exportSlidePng(deck, slideIndex);
        download(blob, `${base} - slide ${slideIndex + 1}.png`);
        setDone(`Slide ${slideIndex + 1} downloaded.`);
      }
      const ms = Math.round(performance.now() - t0);
      const slides = format === "png" ? 1 : out.slides.length;
      track("deck_downloaded", { deckId: deck.id, props: { format, slides } });
      track("timing", { deckId: deck.id, props: { what: `export_${format}`, ms, slides, ok: true } });
    } catch (e) {
      console.error("[export]", e);
      track("timing", { deckId: deck.id, props: { what: `export_${format}`, ms: Math.round(performance.now() - t0), ok: false } });
      setError("The download couldn't be made. Try again, or try the other format.");
    } finally {
      setProgress(null);
    }
  }

  const busy = progress !== null;

  return (
    <dialog ref={ref} onClose={onClose} onCancel={(e) => busy && e.preventDefault()} className="m-auto w-[min(520px,calc(100vw-32px))] rounded-[20px] border border-line bg-surface p-0 text-ink backdrop:bg-black/40" aria-labelledby="export-title">
      <div className="border-b border-line px-6 py-4">
        <h2 id="export-title" className="text-[17px] font-semibold">Download</h2>
        <p className="mt-0.5 text-[13px] text-ink-2">{format === "png" ? "1 slide" : `${out.slides.length} slides`}{hidden && !withHidden && format !== "png" ? ` (${hidden} hidden left out)` : ""}. Files are made in your browser.</p>
      </div>
      <div className="space-y-5 px-6 py-5">
        <div role="radiogroup" aria-label="Format" className="grid grid-cols-3 gap-2">
          {(
            [
              ["pptx", "PowerPoint", "Edit in PowerPoint, Keynote or Google Slides"],
              ["pdf", "PDF", "Share or print"],
              ["png", "Image", `Slide ${slideIndex + 1} as PNG`],
            ] as const
          ).map(([v, label, hint]) => (
            <button key={v} type="button" role="radio" aria-checked={format === v} onClick={() => setFormat(v)} className={`rounded-[10px] border-2 p-3 text-left ${format === v ? "border-accent" : "border-line hover:border-ink-2"}`}>
              <span className="block text-[14px] font-medium">{label}</span>
              <span className="mt-0.5 block text-[12px] leading-[16px] text-ink-2">{hint}</span>
            </button>
          ))}
        </div>

        {format === "pptx" && (
          <div className="space-y-4 text-[14px]">
            <label className="flex items-start gap-3">
              <input type="checkbox" className="mt-1 h-4 w-4" checked={animations} onChange={(e) => setAnimations(e.target.checked)} />
              <span>
                Animations and transitions
                <span className="block text-[12px] text-ink-2">Builds play on click like in DeckIQ. Morph needs PowerPoint 2019 or 365; older versions fade.</span>
              </span>
            </label>
            <label className="flex items-start gap-3">
              <input type="checkbox" className="mt-1 h-4 w-4" checked={notes} onChange={(e) => setNotes(e.target.checked)} />
              <span>Speaker notes</span>
            </label>
            <div>
              <span className="mb-2 block font-medium">Fonts</span>
              <Segmented size="sm" label="Fonts" value={fonts} onChange={setFonts} options={[{ value: "original", label: "Deck fonts" }, { value: "office", label: "Office-safe" }]} />
              <span className="mt-1 block text-[12px] text-ink-2">
                {fonts === "original" ? "Uses Inter and the theme's heading font. Install them from Google Fonts for an exact match." : "Uses Arial and Georgia, which every computer has. Spacing may shift slightly."}
              </span>
            </div>
            <p className="text-[12px] text-ink-2">Text, shapes and charts stay editable. Charts open with their data in PowerPoint.</p>
          </div>
        )}

        {format === "pdf" && (
          <div className="space-y-4 text-[14px]">
            <div>
              <span className="mb-2 block font-medium">Layout</span>
              <Segmented size="sm" label="PDF layout" value={layout} onChange={setLayout} options={[{ value: "slides", label: "One slide per page" }, { value: "handout", label: "Handout with notes" }]} />
            </div>
            <div>
              <span className="mb-2 block font-medium">Quality</span>
              <Segmented size="sm" label="PDF quality" value={quality} onChange={setQuality} options={[{ value: "standard", label: "Standard" }, { value: "high", label: "High (larger file)" }]} />
            </div>
            <p className="text-[12px] text-ink-2">PDFs show every slide in its final state. Animations need the PowerPoint file or present mode.</p>
          </div>
        )}

        {hidden > 0 && format !== "png" && (
          <label className="flex items-start gap-3 text-[14px]">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={withHidden} onChange={(e) => setWithHidden(e.target.checked)} />
            <span>
              Include {hidden} hidden slide{hidden === 1 ? "" : "s"}
              <span className="block text-[12px] text-ink-2">Hidden slides are left out unless you tick this.</span>
            </span>
          </label>
        )}

        <div aria-live="polite" className="min-h-[20px] text-[13px]">
          {progress && <p className="text-ink-2" role="status">{progress}</p>}
          {done && !progress && <p className="text-success">{done}</p>}
          {error && <p className="text-danger" role="alert">{error}</p>}
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={busy}>Close</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={run} disabled={busy}>
          {busy ? "Working" : format === "pptx" ? "Download .pptx" : format === "pdf" ? "Download PDF" : "Download PNG"}
        </button>
      </div>
    </dialog>
  );
}
