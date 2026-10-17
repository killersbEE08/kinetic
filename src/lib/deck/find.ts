// Find and replace across a deck: slide text, list points, shape text, table cells and speaker notes.
// Pure functions so the editor can preview matches and turn "Replace all" into one undoable patch.
import type { Deck } from "./schema";
import type { PatchOp } from "./patch";

export interface FindOptions {
  matchCase?: boolean;
  wholeWord?: boolean;
}

export type FieldKind = "text" | "point" | "shape" | "cell" | "notes";

/** One searchable string in the deck, with the JSON pointer that holds it. */
export interface Field {
  slideIndex: number;
  elementId?: string;
  kind: FieldKind;
  path: string;
  value: string;
  max: number;
}

export interface Match {
  field: Field;
  /** Offset of the match inside `field.value`. */
  start: number;
  length: number;
  /** Short text around the match for the results list. */
  before: string;
  hit: string;
  after: string;
}

const LIMIT: Record<FieldKind, number> = { text: 2000, point: 160, shape: 500, cell: 200, notes: 5000 };

/** Every editable string in the deck, in reading order. */
export function deckFields(deck: Deck): Field[] {
  const out: Field[] = [];
  deck.slides.forEach((s, si) => {
    s.elements.forEach((el, ei) => {
      const base = `/slides/${si}/elements/${ei}`;
      if (el.type === "text") out.push({ slideIndex: si, elementId: el.id, kind: "text", path: `${base}/content`, value: el.content, max: LIMIT.text });
      else if (el.type === "bullets") el.items.forEach((it, k) => out.push({ slideIndex: si, elementId: el.id, kind: "point", path: `${base}/items/${k}`, value: it, max: LIMIT.point }));
      else if (el.type === "shape" && el.text) out.push({ slideIndex: si, elementId: el.id, kind: "shape", path: `${base}/text`, value: el.text, max: LIMIT.shape });
      else if (el.type === "table") el.rows.forEach((row, r) => row.forEach((cell, c) => out.push({ slideIndex: si, elementId: el.id, kind: "cell", path: `${base}/rows/${r}/${c}`, value: cell, max: LIMIT.cell })));
    });
    if (s.notes) out.push({ slideIndex: si, kind: "notes", path: `/slides/${si}/notes`, value: s.notes, max: LIMIT.notes });
  });
  return out;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function matcher(query: string, opts: FindOptions = {}): RegExp | null {
  if (!query) return null;
  const body = escape(query);
  // Word boundaries that also work for non-Latin scripts: not preceded/followed by a letter or digit.
  const src = opts.wholeWord ? `(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])` : body;
  return new RegExp(src, `gu${opts.matchCase ? "" : "i"}`);
}

export function findMatches(deck: Deck, query: string, opts: FindOptions = {}, limit = 500): Match[] {
  const rx = matcher(query, opts);
  if (!rx) return [];
  const out: Match[] = [];
  for (const field of deckFields(deck)) {
    rx.lastIndex = 0;
    for (const m of field.value.matchAll(rx)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      out.push({
        field,
        start,
        length: m[0].length,
        before: (start > 28 ? "…" : "") + field.value.slice(Math.max(0, start - 28), start),
        hit: m[0],
        after: field.value.slice(end, end + 40) + (end + 40 < field.value.length ? "…" : ""),
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export interface ReplaceResult {
  ops: PatchOp[];
  /** Matches replaced. */
  count: number;
  /** Fields left unchanged because the result would be too long or empty. */
  skipped: number;
}

/** Replace every match (or only `only`). Clears the AI "Suggested" flag on edited elements. */
export function replaceOps(deck: Deck, query: string, replacement: string, opts: FindOptions = {}, only?: Match): ReplaceResult {
  const rx = matcher(query, opts);
  if (!rx) return { ops: [], count: 0, skipped: 0 };
  const ops: PatchOp[] = [];
  const touched = new Set<string>();
  let count = 0;
  let skipped = 0;
  for (const field of deckFields(deck)) {
    if (only && field.path !== only.field.path) continue;
    let n = 0;
    let next: string;
    if (only) {
      if (field.value.slice(only.start, only.start + only.length) !== only.hit) continue;
      next = field.value.slice(0, only.start) + replacement + field.value.slice(only.start + only.length);
      n = 1;
    } else {
      rx.lastIndex = 0;
      next = field.value.replace(rx, () => (n++, replacement));
    }
    if (!n || next === field.value) continue;
    // Text and points can't be empty; keep the field rather than produce an invalid deck.
    if (next.length > field.max || (field.kind !== "notes" && field.kind !== "cell" && !next.trim())) {
      skipped++;
      continue;
    }
    ops.push({ op: "replace", path: field.path, value: next });
    count += n;
    if (field.elementId) touched.add(`${field.slideIndex}:${field.elementId}`);
  }
  for (const key of touched) {
    const [si, id] = key.split(":");
    const s = deck.slides[Number(si)];
    const ei = s.elements.findIndex((e) => e.id === id);
    if (ei >= 0 && s.elements[ei].aiSuggested) ops.push({ op: "replace", path: `/slides/${si}/elements/${ei}/aiSuggested`, value: false });
  }
  return { ops, count, skipped };
}
