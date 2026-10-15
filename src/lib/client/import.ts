"use client";

// Reads the files people already have (PDF, Word, PowerPoint, Excel, CSV, text) in the browser.
// Text becomes notes for the outline; embedded photos can go to the photo library.
// Nothing is uploaded here: parsing happens on the user's machine.
import { unzipSync, strFromU8 } from "fflate";
import { IMAGE_TYPES } from "./assets";

export interface ImportedImage {
  name: string;
  blob: Blob;
  width: number;
  height: number;
}

export interface ImportResult {
  name: string;
  kind: "pdf" | "docx" | "pptx" | "xlsx" | "csv" | "text";
  text: string;
  images: ImportedImage[];
  /** Short note about anything we skipped. */
  note?: string;
}

export const IMPORT_ACCEPT = ".pdf,.docx,.pptx,.xlsx,.csv,.txt,.md,.markdown";
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
const MAX_IMAGES = 16;
const MIN_IMAGE_EDGE = 300;
const MAX_ROWS = 60;

export class ImportError extends Error {}

export function importKind(name: string): ImportResult["kind"] | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "pptx") return "pptx";
  if (ext === "xlsx") return "xlsx";
  if (ext === "csv") return "csv";
  if (["txt", "md", "markdown"].includes(ext)) return "text";
  return null;
}

export function isImageFile(f: File): boolean {
  return (IMAGE_TYPES as readonly string[]).includes(f.type);
}

export async function importFile(file: File): Promise<ImportResult> {
  const kind = importKind(file.name);
  if (!kind) {
    if (/\.(doc|ppt|xls|key|pages|numbers)$/i.test(file.name)) throw new ImportError(`${file.name}: save it as .docx, .pptx or .xlsx first (older Office and Apple formats can't be read).`);
    throw new ImportError(`${file.name}: this file type isn't supported. Use PDF, Word, PowerPoint, Excel, CSV or text.`);
  }
  if (file.size > MAX_IMPORT_BYTES) throw new ImportError(`${file.name} is over 50 MB.`);
  const buf = new Uint8Array(await file.arrayBuffer());
  try {
    switch (kind) {
      case "pdf":
        return { name: file.name, kind, ...(await readPdf(buf)) };
      case "docx":
        return { name: file.name, kind, ...(await readDocx(buf)) };
      case "pptx":
        return { name: file.name, kind, ...(await readPptx(buf)) };
      case "xlsx":
        return { name: file.name, kind, text: readXlsx(buf), images: [] };
      case "csv":
        return { name: file.name, kind, text: tableToText(file.name.replace(/\.csv$/i, ""), parseCsv(decode(buf))), images: [] };
      case "text":
        return { name: file.name, kind, text: decode(buf).replace(/\r\n/g, "\n").trim(), images: [] };
    }
  } catch (e) {
    if (e instanceof ImportError) throw e;
    throw new ImportError(`${file.name} couldn't be read. If it's password-protected, remove the password and try again.`);
  }
}

// ---------------------------------------------------------------------------
// Shared helpers

function decode(buf: Uint8Array): string {
  return new TextDecoder("utf-8").decode(buf).replace(/^\uFEFF/, "");
}

function xml(s: string): Document {
  const doc = new DOMParser().parseFromString(s, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new ImportError("The file is damaged.");
  return doc;
}

/** Elements by local name, ignoring XML namespace prefixes. */
function all(root: Document | Element, local: string): Element[] {
  return Array.from(root.getElementsByTagNameNS("*", local));
}

const endSentence = (s: string) => (/[.?!:;]$/.test(s) ? s : s + ".");

/** One "topic" block in the format the outline engines read: a heading line, then points. */
function block(heading: string | undefined, lines: string[]): string {
  const body = lines.map((l) => l.trim()).filter(Boolean);
  const head = heading?.trim();
  if (!head && !body.length) return "";
  return [head ? endSentence(head) : "", ...body.map((l) => (l.startsWith("- ") ? l : "- " + endSentence(l)))].filter(Boolean).join("\n");
}

const MIME_BY_EXT: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };

async function zipImages(files: Record<string, Uint8Array>, folder: string): Promise<{ images: ImportedImage[]; skipped: number }> {
  const out: ImportedImage[] = [];
  let skipped = 0;
  const seen = new Set<string>();
  for (const [path, data] of Object.entries(files)) {
    if (!path.startsWith(folder)) continue;
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    const mime = MIME_BY_EXT[ext];
    if (!mime) {
      skipped++;
      continue;
    }
    const key = `${data.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const blob = new Blob([data as BlobPart], { type: mime });
    const dims = await imageSize(blob);
    if (!dims || Math.min(dims.width, dims.height) < MIN_IMAGE_EDGE) continue;
    out.push({ name: path.split("/").pop() ?? "image", blob, ...dims });
    if (out.length >= MAX_IMAGES) break;
  }
  return { images: out, skipped };
}

async function imageSize(blob: Blob): Promise<{ width: number; height: number } | null> {
  try {
    const bmp = await createImageBitmap(blob);
    const r = { width: bmp.width, height: bmp.height };
    bmp.close();
    return r;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Word

async function readDocx(buf: Uint8Array) {
  const files = unzipSync(buf);
  const main = files["word/document.xml"];
  if (!main) throw new ImportError("This Word file has no document body.");
  const doc = xml(strFromU8(main));
  const body = all(doc, "body")[0];
  const blocks: string[] = [];
  let heading: string | undefined;
  let lines: string[] = [];
  const flush = () => {
    const b = block(heading, lines);
    if (b) blocks.push(b);
    heading = undefined;
    lines = [];
  };
  const paraText = (p: Element) =>
    Array.from(p.getElementsByTagNameNS("*", "*"))
      .map((n) => (n.localName === "t" ? n.textContent ?? "" : n.localName === "tab" ? " " : n.localName === "br" ? " " : ""))
      .join("")
      .replace(/\s+/g, " ")
      .trim();

  for (const node of Array.from(body?.children ?? [])) {
    if (node.localName === "tbl") {
      const rows = all(node, "tr").map((tr) => all(tr, "tc").map((tc) => all(tc, "p").map(paraText).join(" ").trim()));
      flush();
      const t = tableToText(undefined, rows);
      if (t) blocks.push(t);
      continue;
    }
    if (node.localName !== "p") continue;
    const text = paraText(node);
    if (!text) continue;
    const style = all(node, "pStyle")[0]?.getAttribute("w:val") ?? all(node, "pStyle")[0]?.getAttributeNS("*", "val") ?? "";
    const isHeading = /^(heading|title|subtitle|berschrift|titre)/i.test(style);
    const isList = all(node, "numPr").length > 0;
    if (isHeading) {
      flush();
      heading = text;
    } else if (isList) {
      lines.push("- " + text);
    } else {
      // A plain paragraph starts a new topic unless it follows a heading directly.
      if (lines.length) flush();
      lines.push(text);
    }
  }
  flush();
  const { images, skipped } = await zipImages(files, "word/media/");
  return { text: blocks.join("\n\n"), images, note: skipped ? `${skipped} drawing${skipped > 1 ? "s" : ""} in a format we can't show were skipped.` : undefined };
}

// ---------------------------------------------------------------------------
// PowerPoint

function relsMap(files: Record<string, Uint8Array>, path: string): Map<string, string> {
  const raw = files[path];
  const out = new Map<string, string>();
  if (!raw) return out;
  for (const r of all(xml(strFromU8(raw)), "Relationship")) out.set(r.getAttribute("Id") ?? "", r.getAttribute("Target") ?? "");
  return out;
}

function resolvePath(base: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = base.split("/").slice(0, -1);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

async function readPptx(buf: Uint8Array) {
  const files = unzipSync(buf);
  const pres = files["ppt/presentation.xml"];
  if (!pres) throw new ImportError("This PowerPoint file has no slides.");
  const rels = relsMap(files, "ppt/_rels/presentation.xml.rels");
  const order = all(xml(strFromU8(pres)), "sldId").map((s) => resolvePath("ppt/presentation.xml", rels.get(s.getAttribute("r:id") ?? s.getAttributeNS("*", "id") ?? "") ?? ""));
  const blocks: string[] = [];

  for (const path of order) {
    const raw = files[path];
    if (!raw) continue;
    const doc = xml(strFromU8(raw));
    let title: string | undefined;
    const lines: string[] = [];
    for (const sp of all(doc, "sp")) {
      const ph = all(sp, "ph")[0]?.getAttribute("type") ?? "";
      const paras = all(sp, "p")
        .map((p) => all(p, "t").map((t) => t.textContent ?? "").join("").replace(/\s+/g, " ").trim())
        .filter(Boolean);
      if (!paras.length) continue;
      if (!title && (ph === "title" || ph === "ctrTitle")) title = paras.join(" ");
      else if (ph !== "sldNum" && ph !== "dt" && ph !== "ftr") lines.push(...paras);
    }
    // Speaker notes carry the talk track; keep them as extra points.
    const slideRels = relsMap(files, path.replace(/slides\/(slide\d+\.xml)$/, "slides/_rels/$1.rels"));
    const notesTarget = [...slideRels.values()].find((t) => /notesSlide\d+\.xml$/.test(t));
    if (notesTarget) {
      const notesRaw = files[resolvePath(path, notesTarget)];
      if (notesRaw) {
        const nd = xml(strFromU8(notesRaw));
        for (const sp of all(nd, "sp")) {
          if ((all(sp, "ph")[0]?.getAttribute("type") ?? "") !== "body") continue;
          lines.push(...all(sp, "p").map((p) => all(p, "t").map((t) => t.textContent ?? "").join("").trim()).filter(Boolean));
        }
      }
    }
    const b = block(title, lines);
    if (b) blocks.push(b);
  }
  const { images, skipped } = await zipImages(files, "ppt/media/");
  return { text: blocks.join("\n\n"), images, note: skipped ? `${skipped} media file${skipped > 1 ? "s" : ""} (video, audio or old drawing formats) were skipped.` : undefined };
}

// ---------------------------------------------------------------------------
// Excel and CSV

function colIndex(ref: string): number {
  const letters = ref.replace(/\d+/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function readXlsx(buf: Uint8Array): string {
  const files = unzipSync(buf);
  const wb = files["xl/workbook.xml"];
  if (!wb) throw new ImportError("This Excel file has no sheets.");
  const shared = files["xl/sharedStrings.xml"] ? all(xml(strFromU8(files["xl/sharedStrings.xml"])), "si").map((si) => all(si, "t").map((t) => t.textContent ?? "").join("")) : [];
  const rels = relsMap(files, "xl/_rels/workbook.xml.rels");
  const blocks: string[] = [];
  for (const sheet of all(xml(strFromU8(wb)), "sheet").slice(0, 6)) {
    const rid = sheet.getAttribute("r:id") ?? sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ?? "";
    const raw = files[resolvePath("xl/workbook.xml", rels.get(rid) ?? "")];
    if (!raw) continue;
    const rows: string[][] = [];
    for (const row of all(xml(strFromU8(raw)), "row").slice(0, 200)) {
      const cells: string[] = [];
      for (const c of all(row, "c")) {
        const i = colIndex(c.getAttribute("r") ?? "A");
        if (i > 25) continue;
        const t = c.getAttribute("t");
        const v = all(c, "v")[0]?.textContent ?? "";
        cells[i] = t === "s" ? shared[Number(v)] ?? "" : t === "inlineStr" ? all(c, "t").map((x) => x.textContent ?? "").join("") : t === "b" ? (v === "1" ? "Yes" : "No") : roundNum(v);
      }
      rows.push(Array.from(cells, (x) => x ?? ""));
    }
    const text = tableToText(sheet.getAttribute("name") ?? undefined, rows);
    if (text) blocks.push(text);
  }
  return blocks.join("\n\n");
}

function roundNum(v: string): string {
  const n = Number(v);
  if (v === "" || !Number.isFinite(n)) return v;
  return String(Math.round(n * 100) / 100);
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const delim = (text.split("\n")[0].match(/;/g)?.length ?? 0) > (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      if (rows.length >= 500) break;
    } else cell += ch;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}

const isNum = (s: string) => /^-?[$€£₹]?\d[\d,]*(\.\d+)?\s?%?$/.test(s.trim());

/**
 * Turns a table into "Label: value" points, which the outline engines turn into charts and
 * KPI slides. Wide tables keep their column headers next to each number.
 */
export function tableToText(title: string | undefined, raw: string[][]): string {
  const rows = raw.map((r) => r.map((c) => (c ?? "").replace(/\s+/g, " ").trim())).filter((r) => r.some(Boolean));
  if (!rows.length) return "";
  const header = rows[0].every((c) => !c || !isNum(c)) && rows.length > 1 ? rows[0] : null;
  const data = (header ? rows.slice(1) : rows).slice(0, MAX_ROWS);
  const lines = data.map((r) => {
    const label = r[0] && !isNum(r[0]) ? r[0] : "";
    const rest = (label ? r.slice(1) : r).map((c, i) => ({ c, h: header?.[i + (label ? 1 : 0)] ?? "" })).filter((x) => x.c);
    if (!rest.length) return label;
    if (label && rest.length === 1) return `${label}: ${rest[0].c}`;
    const parts = rest.map((x) => (x.h ? `${x.h} ${x.c}` : x.c)).join(", ");
    return label ? `${label}: ${parts}` : parts;
  });
  return block(title, lines.map((l) => "- " + l));
}

// ---------------------------------------------------------------------------
// PDF (pdf.js, run on the main thread so no worker file has to be served)

type PdfJs = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfJs> | null = null;

async function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= (async () => {
    // Registering the worker module on globalThis makes pdf.js run it in this thread.
    await import("pdfjs-dist/build/pdf.worker.min.mjs");
    return import("pdfjs-dist");
  })();
  return pdfjsPromise;
}

interface PdfTextItem {
  str: string;
  transform: number[];
  height: number;
  hasEOL?: boolean;
}

async function readPdf(buf: Uint8Array) {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data: buf, disableFontFace: true });
  const doc = await task.promise;
  const pages = Math.min(doc.numPages, 300);
  const paras: string[] = [];
  const images: ImportedImage[] = [];
  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let cur = "";
    let lastY: number | null = null;
    let lastH = 12;
    for (const raw of content.items as PdfTextItem[]) {
      if (typeof raw.str !== "string") continue;
      const y = raw.transform[5];
      const h = raw.height || lastH;
      if (lastY !== null && Math.abs(lastY - y) > Math.max(h, lastH) * 1.7) {
        if (cur.trim()) paras.push(cur.trim());
        cur = "";
      } else if (lastY !== null && Math.abs(lastY - y) > 1 && !cur.endsWith(" ")) cur += " ";
      cur += raw.str;
      if (raw.hasEOL && !cur.endsWith(" ")) cur += " ";
      lastY = y;
      lastH = h;
    }
    if (cur.trim()) paras.push(cur.trim());
    if (images.length < MAX_IMAGES) images.push(...(await pdfImages(pdfjs, page, p, MAX_IMAGES - images.length)));
    page.cleanup();
  }
  await task.destroy();
  const text = paras.map((s) => s.replace(/\s+/g, " ")).filter((s) => s.length > 1).join("\n\n");
  return { text, images, note: text ? undefined : "No text found. Scanned PDFs need to be run through text recognition first." };
}

interface PdfImageObj {
  width: number;
  height: number;
  bitmap?: ImageBitmap;
  data?: Uint8ClampedArray;
  kind?: number;
}

async function pdfImages(pdfjs: PdfJs, page: Awaited<ReturnType<Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>["getPage"]>>, pageNo: number, max: number): Promise<ImportedImage[]> {
  const out: ImportedImage[] = [];
  try {
    const ops = await page.getOperatorList();
    const names = new Set<string>();
    ops.fnArray.forEach((fn, i) => {
      if (fn === pdfjs.OPS.paintImageXObject) names.add(String(ops.argsArray[i][0]));
    });
    for (const name of names) {
      if (out.length >= max) break;
      const store = name.startsWith("g_") ? page.commonObjs : page.objs;
      const obj = await new Promise<PdfImageObj | null>((resolve) => {
        const t = setTimeout(() => resolve(null), 1500);
        try {
          store.get(name, (o: PdfImageObj) => {
            clearTimeout(t);
            resolve(o);
          });
        } catch {
          clearTimeout(t);
          resolve(null);
        }
      });
      if (!obj || Math.min(obj.width, obj.height) < MIN_IMAGE_EDGE) continue;
      const canvas = document.createElement("canvas");
      canvas.width = obj.width;
      canvas.height = obj.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      if (obj.bitmap) ctx.drawImage(obj.bitmap, 0, 0);
      else if (obj.data) {
        const px = obj.width * obj.height;
        const rgba = new Uint8ClampedArray(px * 4);
        if (obj.kind === 3) rgba.set(obj.data.subarray(0, px * 4));
        else if (obj.kind === 2) for (let i = 0; i < px; i++) rgba.set([obj.data[i * 3], obj.data[i * 3 + 1], obj.data[i * 3 + 2], 255], i * 4);
        else continue;
        ctx.putImageData(new ImageData(rgba, obj.width, obj.height), 0, 0);
      } else continue;
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
      if (blob) out.push({ name: `page-${pageNo}-image-${out.length + 1}.jpg`, blob, width: obj.width, height: obj.height });
    }
  } catch {
    // Images are a bonus; text import still succeeds.
  }
  return out;
}
