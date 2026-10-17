// Deck review (the "Review" tab): one list of everything worth checking before presenting,
// with one-click fixes where a safe fix exists. Pure functions: the editor re-runs them after
// every change, so fix ops always target the current deck.
import type { Deck, Element, ElStyle, Slide } from "./schema";
import { isFree } from "./schema";
import type { PatchOp } from "./patch";
import type { Theme } from "./themes";
import { contrastRatio } from "./themes";
import { bodyWords, elementText, extractNumbers, LIMITS, wordCount } from "./qa";
import { findBanned, softenCopy } from "./banned";
import { WRITING_TEXT } from "./fill";

export type ReviewRule = "numbers" | "density" | "alt" | "contrast" | "banned" | "placeholder" | "offbrand" | "titles" | "notes";

/** fix: should change before presenting · check: needs a human look · tip: optional polish. */
export type Severity = "fix" | "check" | "tip";

export interface ReviewItem {
  /** Stable across re-runs while the problem exists (used for React keys and "dismissed"). */
  key: string;
  rule: ReviewRule;
  severity: Severity;
  slideIndex: number;
  slideId: string;
  elementId?: string;
  message: string;
  /** A safe automatic fix. Missing when only the user can fix it (alt text, facts). */
  fix?: { label: string; ops: PatchOp[] };
}

export const RULES: Record<ReviewRule, { severity: Severity; title: string; count: (n: number) => string; help: string }> = {
  numbers: { severity: "check", title: "Not in your notes", count: (n) => `${n} detail${n === 1 ? "" : "s"} not found in your notes`, help: "The AI added these. Check each one is true, then mark it checked." },
  density: { severity: "fix", title: "Too much text", count: (n) => `${n} slide${n === 1 ? "" : "s"} with too much text`, help: `Slides read best under ${LIMITS.bodyWords} words. The fix moves the extra text to speaker notes.` },
  alt: { severity: "fix", title: "Photos without alt text", count: (n) => `${n} photo${n === 1 ? "" : "s"} without alt text`, help: "Alt text describes a photo for people using screen readers. One short sentence is enough." },
  contrast: { severity: "fix", title: "Hard to read", count: (n) => `${n} text box${n === 1 ? "" : "es"} with low contrast`, help: "Text needs a contrast of at least 4.5:1 with its background (3:1 for large text)." },
  banned: { severity: "fix", title: "Hype wording", count: (n) => `${n} place${n === 1 ? "" : "s"} with hype wording`, help: "Words like \u201cseamless\u201d and \u201cleverage\u201d make a deck sound machine-written." },
  placeholder: { severity: "fix", title: "Placeholder text", count: (n) => `${n} placeholder${n === 1 ? "" : "s"} left in`, help: "Text from a new slide or box that hasn't been replaced yet." },
  offbrand: { severity: "tip", title: "Colours outside your brand", count: (n) => `${n} element${n === 1 ? "" : "s"} with colours outside your brand`, help: "These use fixed colours. The fix switches them to the nearest brand or theme colour, so they follow theme changes." },
  titles: { severity: "tip", title: "Long titles", count: (n) => `${n} long title${n === 1 ? "" : "s"}`, help: "Titles over 10 words are hard to scan. Use \u201cShorten every title\u201d above to fix them all at once." },
  notes: { severity: "tip", title: "No speaker notes", count: (n) => `${n} slide${n === 1 ? "" : "s"} without speaker notes`, help: "Notes show in presenter view, so you know what to say on each slide." },
};

export const RULE_ORDER: ReviewRule[] = ["numbers", "placeholder", "density", "contrast", "alt", "banned", "offbrand", "titles", "notes"];

/** Text the editor and templates put in new slides and boxes. */
export const PLACEHOLDERS = new Set(
  ["Section title", "A short line under the title", "New slide", "Click to edit this text.", "Three things to know", "First point", "Second point", "Third point", "One sentence your audience should remember.", "Heading", "Type your text here", "Caption", WRITING_TEXT].map((s) => s.toLowerCase()),
);

const GENERIC_ALT = /^(photo|image|picture|img|pic|untitled|screenshot|logo|background|graphic|banner)\s*\d*$/i;
const FILE_ALT = /\.(jpe?g|png|webp|gif|heic|svg)$/i;
const CAMERA_ALT = /^(img|dsc|pxl|dcim|photo)[_ -]?\d+/i;

/** True when alt text doesn't describe anything. */
export function weakAlt(alt: string): boolean {
  const a = alt.trim();
  return a.length < 5 || GENERIC_ALT.test(a) || FILE_ALT.test(a) || CAMERA_ALT.test(a);
}

const TITLE_MAX_WORDS = 10;
const HEX = /^#[0-9a-fA-F]{6}$/;
type Role = keyof Theme["colors"];
const ROLES: Role[] = ["text", "muted", "accent", "accent2", "bg", "surface", "rule"];

const elPath = (si: number, ei: number) => `/slides/${si}/elements/${ei}`;

function styleOp(si: number, ei: number, el: Element, next: ElStyle): PatchOp {
  return { op: el.style ? "replace" : "add", path: `${elPath(si, ei)}/style`, value: next };
}

/** Background colour behind an element, or null when it's a photo (can't be checked). */
function slideBg(slide: Slide, theme: Theme): string | null {
  if (slide.background?.image) return null;
  return slide.background?.color ?? theme.colors.bg;
}

/** Hex value of a stored colour, or null if it depends on something we can't resolve here. */
function resolve(c: string | undefined, slide: Slide, theme: Theme): string | null {
  if (!c || c === "none") return null;
  if (HEX.test(c)) return c.toUpperCase();
  // A slide background colour replaces these roles with black or white text (see backgroundVars).
  if (slide.background && (c === "text" || c === "muted" || c === "surface" || c === "rule")) return null;
  return (theme.colors as Record<string, string>)[c] ?? null;
}

function hexDistance(a: string, b: string): number {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  let d = 0;
  for (const s of [16, 8, 0]) d += (((pa >> s) & 255) - ((pb >> s) & 255)) ** 2;
  return d;
}

/** Theme role closest to a hex colour. */
export function nearestRole(hex: string, theme: Theme): Role {
  let best: Role = "text";
  let bestD = Infinity;
  for (const r of ROLES) {
    const d = hexDistance(hex.toUpperCase(), theme.colors[r].toUpperCase());
    if (d < bestD) [best, bestD] = [r, d];
  }
  return best;
}

const isLarge = (el: Element) => (el.type === "text" && (el.role === "h1" || el.role === "h2" || el.role === "quote")) || (el.style?.fontSize ?? 0) >= 48;

function contrastItem(slide: Slide, si: number, el: Element, ei: number, theme: Theme): ReviewItem | null {
  const st = el.style ?? {};
  let fg: string | null = null;
  let bg: string | null = slideBg(slide, theme);
  let fixed: ElStyle | null = null;
  if (el.type === "shape") {
    const line = el.shape === "line" || el.shape === "arrow";
    if (!el.text.trim()) return null;
    if (!line && st.fill !== "none") bg = resolve(st.fill ?? "accent", slide, theme);
    const onFill = theme.brand?.onPrimary ?? theme.colors.bg;
    fg = st.color ? resolve(st.color, slide, theme) : line || st.fill === "none" ? resolve("text", slide, theme) : onFill;
    if (bg && fg) {
      const better = contrastRatio("#FFFFFF", bg) >= contrastRatio("#0B0B0C", bg) ? "#FFFFFF" : "#0B0B0C";
      fixed = { ...st, color: better };
    }
  } else if ((el.type === "text" || el.type === "bullets" || el.type === "table") && st.color) {
    fg = resolve(st.color, slide, theme);
    fixed = { ...st };
    delete fixed.color;
  } else return null;
  if (!fg || !bg) return null;
  const ratio = contrastRatio(fg, bg);
  const need = isLarge(el) ? 3 : 4.5;
  if (ratio >= need) return null;
  return {
    key: `contrast:${slide.id}:${el.id}`,
    rule: "contrast",
    severity: "fix",
    slideIndex: si,
    slideId: slide.id,
    elementId: el.id,
    message: `Contrast ${ratio.toFixed(1)}:1, needs ${need}:1`,
    fix: fixed ? { label: el.type === "shape" ? "Use readable text colour" : "Use theme text colour", ops: [styleOp(si, ei, el, fixed)] } : undefined,
  };
}

/** Moves text past the word limit to speaker notes: trailing points first, then long paragraphs. */
export function densityFix(slide: Slide, si: number): PatchOp[] {
  let words = bodyWords(slide);
  if (words <= LIMITS.bodyWords) return [];
  const moved: string[] = [];
  const ops: PatchOp[] = [];
  slide.elements.forEach((el, ei) => {
    if (words <= LIMITS.bodyWords || isFree(el)) return;
    if (el.type === "bullets" && el.items.length > 2) {
      const items = [...el.items];
      while (items.length > 2 && words > LIMITS.bodyWords) {
        const last = items.pop()!;
        words -= wordCount(last);
        moved.unshift("- " + last);
      }
      if (items.length !== el.items.length) {
        ops.push({ op: "replace", path: `${elPath(si, ei)}/items`, value: items });
        if (el.icons) ops.push({ op: "replace", path: `${elPath(si, ei)}/icons`, value: el.icons.slice(0, items.length) });
      }
    } else if (el.type === "text" && (el.role === "body" || el.role === "caption")) {
      const n = wordCount(el.content);
      const keep = Math.max(12, n - (words - LIMITS.bodyWords));
      if (keep >= n) return;
      const w = el.content.trim().split(/\s+/);
      // Cut at the last sentence end inside the limit when there is one.
      let head = w.slice(0, keep).join(" ");
      const stop = Math.max(head.lastIndexOf(". "), head.lastIndexOf("? "));
      if (stop > head.length * 0.5) head = head.slice(0, stop + 1);
      const rest = w.slice(wordCount(head)).join(" ");
      words -= n - wordCount(head);
      moved.push(rest);
      ops.push({ op: "replace", path: `${elPath(si, ei)}/content`, value: head });
    }
  });
  if (!ops.length) return [];
  const notes = [slide.notes.trim(), ...moved.filter(Boolean)].filter(Boolean).join("\n\n").slice(0, 5000);
  ops.push({ op: "replace", path: `/slides/${si}/notes`, value: notes });
  return ops;
}

/** Ops that set alt text on a photo (element or slide background). */
export function altOps(deck: Deck, item: Pick<ReviewItem, "slideIndex" | "elementId">, alt: string): PatchOp[] {
  const text = alt.trim().slice(0, 250);
  if (!text) return [];
  const slide = deck.slides[item.slideIndex];
  if (!slide) return [];
  if (item.elementId === undefined && slide.background?.image) return [{ op: "replace", path: `/slides/${item.slideIndex}/background/image/alt`, value: text }];
  const ei = slide.elements.findIndex((e) => e.id === item.elementId);
  return ei >= 0 ? [{ op: "replace", path: `${elPath(item.slideIndex, ei)}/alt`, value: text }] : [];
}

/** Every check on every visible slide. Hidden slides are skipped (nobody sees them). */
export function reviewDeck(deck: Deck, theme: Theme): ReviewItem[] {
  const items: ReviewItem[] = [];
  const brandHexes = theme.brand ? [...Object.values(theme.colors), "#FFFFFF", "#000000", "#0B0B0C", theme.brand.onPrimary].map((h) => h.toUpperCase()) : [];
  deck.slides.forEach((slide, si) => {
    if (slide.hidden) return;
    const base = { slideIndex: si, slideId: slide.id };

    const density = bodyWords(slide);
    if (density > LIMITS.bodyWords + 10) {
      const ops = densityFix(slide, si);
      items.push({ ...base, key: `density:${slide.id}`, rule: "density", severity: "fix", message: `About ${density} words of body text`, fix: ops.length ? { label: "Move extra text to notes", ops } : undefined });
    }

    if (slide.background?.image && weakAlt(slide.background.image.alt)) {
      items.push({ ...base, key: `alt:${slide.id}:bg`, rule: "alt", severity: "fix", message: "Background photo needs a description" });
    }

    const visibleText = slide.elements.some((e) => e.type === "text" || e.type === "bullets");
    if (!slide.notes.trim() && visibleText) items.push({ ...base, key: `notes:${slide.id}`, rule: "notes", severity: "tip", message: "No speaker notes" });

    slide.elements.forEach((el, ei) => {
      const at = { ...base, elementId: el.id };
      if (el.aiSuggested) {
        const nums = el.type === "chart" ? el.data.series.flatMap((s) => s.values.map(String)) : extractNumbers(elementText(el));
        items.push({
          ...at,
          key: `numbers:${slide.id}:${el.id}`,
          rule: "numbers",
          severity: "check",
          message: nums.length ? `Check ${nums.slice(0, 3).join(", ")}` : "AI-written text not found in your notes",
          fix: { label: "Mark as checked", ops: [{ op: "replace", path: `${elPath(si, ei)}/aiSuggested`, value: false }] },
        });
      }

      if (el.type === "image" && weakAlt(el.alt)) items.push({ ...at, key: `alt:${slide.id}:${el.id}`, rule: "alt", severity: "fix", message: el.alt.trim() ? `Alt text is "${el.alt.trim().slice(0, 30)}"` : "No description" });

      const text = el.type === "text" ? el.content : el.type === "shape" ? el.text : el.type === "bullets" ? el.items.join("\n") : "";
      if (text) {
        const lines = el.type === "bullets" ? el.items : [text];
        if (lines.some((l) => PLACEHOLDERS.has(l.trim().toLowerCase()))) items.push({ ...at, key: `placeholder:${slide.id}:${el.id}`, rule: "placeholder", severity: "fix", message: `"${lines.find((l) => PLACEHOLDERS.has(l.trim().toLowerCase()))!.trim().slice(0, 40)}"` });

        const hits = findBanned(text);
        if (hits.length) {
          let fix: ReviewItem["fix"];
          if (el.type === "text" && softenCopy(el.content) !== el.content) fix = { label: "Use plain wording", ops: [{ op: "replace", path: `${elPath(si, ei)}/content`, value: softenCopy(el.content) }] };
          else if (el.type === "bullets" && el.items.some((i) => softenCopy(i) !== i)) fix = { label: "Use plain wording", ops: [{ op: "replace", path: `${elPath(si, ei)}/items`, value: el.items.map(softenCopy) }] };
          else if (el.type === "shape" && softenCopy(el.text) !== el.text) fix = { label: "Use plain wording", ops: [{ op: "replace", path: `${elPath(si, ei)}/text`, value: softenCopy(el.text) }] };
          items.push({ ...at, key: `banned:${slide.id}:${el.id}`, rule: "banned", severity: "fix", message: hits.slice(0, 3).map((h) => `"${h}"`).join(", "), fix });
        }
      }

      if (el.type === "text" && el.role === "h1" && wordCount(el.content) > TITLE_MAX_WORDS) items.push({ ...at, key: `titles:${slide.id}:${el.id}`, rule: "titles", severity: "tip", message: `${wordCount(el.content)} words` });

      const c = contrastItem(slide, si, el, ei, theme);
      if (c) items.push(c);

      if (brandHexes.length && el.style) {
        const st = el.style;
        const off = (["color", "fill", "stroke"] as const).filter((k) => {
          const v = st[k];
          return typeof v === "string" && HEX.test(v) && !brandHexes.some((b) => hexDistance(b, v.toUpperCase()) < 300);
        });
        // Skip when the contrast check already proposes a colour for this element.
        if (off.length && !c) {
          const next: ElStyle = { ...st };
          for (const k of off) next[k] = nearestRole(st[k] as string, theme);
          items.push({ ...at, key: `offbrand:${slide.id}:${el.id}`, rule: "offbrand", severity: "tip", message: off.map((k) => `${k === "color" ? "text" : k} ${st[k]}`).join(", "), fix: { label: "Use brand colours", ops: [styleOp(si, ei, el, next)] } });
        }
      }
    });
  });
  return items;
}

/** "3 details not found in your notes, 1 slide with too much text, 2 photos without alt text" */
export function summarize(items: ReviewItem[], severities: Severity[] = ["fix", "check"]): string {
  const parts = RULE_ORDER.filter((r) => severities.includes(RULES[r].severity))
    .map((r) => {
      const n = r === "density" || r === "notes" ? new Set(items.filter((i) => i.rule === r).map((i) => i.slideId)).size : items.filter((i) => i.rule === r).length;
      return n ? RULES[r].count(n) : "";
    })
    .filter(Boolean);
  return parts.join(", ");
}

/** Combined ops for "Fix all" in one group. Items whose ops touch the same path are skipped. */
export function fixAllOps(items: ReviewItem[]): PatchOp[] {
  const seen = new Set<string>();
  const out: PatchOp[] = [];
  for (const it of items) {
    if (!it.fix) continue;
    const paths = it.fix.ops.map((o) => o.path);
    if (paths.some((p) => seen.has(p))) continue;
    paths.forEach((p) => seen.add(p));
    out.push(...it.fix.ops);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Whole-deck AI pass, reviewed slide by slide.

export interface SlideChange {
  slideId: string;
  index: number;
  before: Slide;
  after: Slide;
  /** First headline before and after, for the list. */
  titleBefore: string;
  titleAfter: string;
}

const headline = (s: Slide) => {
  const h = s.elements.find((e) => e.type === "text" && e.role === "h1") ?? s.elements.find((e) => e.type === "text");
  return h?.type === "text" ? h.content : "";
};

/**
 * Splits a proposed whole deck into per-slide changes, matched by slide id. Slides the AI
 * dropped are kept as they are; slides it added are left out (returned as `extra`).
 */
export function perSlideChanges(deck: Deck, proposed: Slide[]): { changes: SlideChange[]; extra: number } {
  const byId = new Map(proposed.map((s) => [s.id, s]));
  const changes: SlideChange[] = [];
  deck.slides.forEach((s, index) => {
    const after = byId.get(s.id);
    if (!after || JSON.stringify(after) === JSON.stringify(s)) return;
    changes.push({ slideId: s.id, index, before: s, after, titleBefore: headline(s), titleAfter: headline(after) });
  });
  const known = new Set(deck.slides.map((s) => s.id));
  return { changes, extra: proposed.filter((s) => !known.has(s.id)).length };
}

/** Ops that apply only the chosen slides of a deck pass. */
export function opsForChanges(changes: SlideChange[], chosen: ReadonlySet<string>): PatchOp[] {
  return changes.filter((c) => chosen.has(c.slideId)).map((c) => ({ op: "replace" as const, path: `/slides/${c.index}`, value: c.after }));
}
