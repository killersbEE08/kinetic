"use client";

// PDF and PNG export: each slide is drawn exactly as it looks on screen (fonts and photos
// included), then placed one per page. The handout layout adds speaker notes under each slide.
import type { Deck } from "@/lib/deck/schema";
import { forEachRenderedSlide, STAGE_H, STAGE_W } from "./render";

export interface PdfOptions {
  layout: "slides" | "handout";
  quality: "standard" | "high";
}

async function snapshotter() {
  const h2i = await import("html-to-image");
  let fontCss: string | undefined;
  return async (stage: HTMLElement, type: "jpeg" | "png", pixelRatio: number) => {
    fontCss ??= await h2i.getFontEmbedCSS(stage).catch(() => "");
    const o = { width: STAGE_W, height: STAGE_H, pixelRatio, fontEmbedCSS: fontCss, cacheBust: false, skipAutoScale: true, style: { transform: "none" } };
    return type === "png" ? h2i.toPng(stage, o) : h2i.toJpeg(stage, { ...o, quality: 0.92 });
  };
}

export async function exportPdf(deck: Deck, opts: PdfOptions, onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const [{ jsPDF }, snap] = await Promise.all([import("jspdf"), snapshotter()]);
  const ratio = opts.quality === "high" ? 1.5 : 1;
  const handout = opts.layout === "handout";
  // Slides: a 16:9 page in points (13.333 × 7.5 in). Handout: A4 portrait.
  const pdf = handout ? new jsPDF({ orientation: "p", unit: "pt", format: "a4", compress: true }) : new jsPDF({ orientation: "l", unit: "pt", format: [960, 540], compress: true });
  pdf.setProperties({ title: deck.title, creator: "Kinetic" });

  await forEachRenderedSlide(
    deck,
    async (stage, slide, i) => {
      const img = await snap(stage, "jpeg", ratio);
      if (i > 0) pdf.addPage();
      if (!handout) {
        pdf.addImage(img, "JPEG", 0, 0, 960, 540, undefined, "FAST");
        return;
      }
      const pageW = pdf.internal.pageSize.getWidth();
      const margin = 48;
      const w = pageW - margin * 2;
      const h = (w * 9) / 16;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(110);
      pdf.text(`${deck.title}  ·  ${i + 1} / ${deck.slides.length}`, margin, margin - 14);
      pdf.addImage(img, "JPEG", margin, margin, w, h, undefined, "FAST");
      pdf.setDrawColor(220);
      pdf.rect(margin, margin, w, h);
      pdf.setFontSize(11);
      pdf.setTextColor(30);
      const notes = slide.notes.trim() || "No speaker notes for this slide.";
      const lines = pdf.splitTextToSize(notes, w) as string[];
      pdf.text(lines.slice(0, 40), margin, margin + h + 28, { lineHeightFactor: 1.4 });
    },
    onProgress,
  );
  return pdf.output("blob");
}

/** One slide as a PNG image (for pasting into docs or chats). */
export async function exportSlidePng(deck: Deck, index: number): Promise<Blob> {
  const snap = await snapshotter();
  const [url] = await forEachRenderedSlide(deck, (stage) => snap(stage, "png", 1), undefined, [index]);
  return (await fetch(url)).blob();
}
