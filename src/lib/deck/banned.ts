// Banned words and phrases (docs/06 §3). Shared by the AI QA gate and scripts/slop-lint.mjs.
// Keep in sync with scripts/banned-phrases.json (the lint script reads that file).
import list from "../../../scripts/banned-phrases.json";

export const BANNED_PATTERNS: RegExp[] = (list as string[]).map((p) => new RegExp(p, "iu"));

export function findBanned(text: string): string[] {
  const hits: string[] = [];
  for (const rx of BANNED_PATTERNS) {
    const m = text.match(rx);
    if (m) hits.push(m[0]);
  }
  return hits;
}

// Safe replacements used by the auto-fix step. Anything not listed is flagged, not rewritten.
const REPLACEMENTS: [RegExp, string][] = [
  [/\bseamless(ly)?\b/giu, "smooth$1"],
  [/\beffortless(ly)?\b/giu, "easy"],
  [/\bleverag(e|es|ed|ing)\b/giu, "us$1"],
  [/\bunlock(s|ed|ing)?\b/giu, "open$1"],
  [/\brobust\b/giu, "reliable"],
  [/\bstreamlines\b/giu, "simplifies"],
  [/\bstreamlined\b/giu, "simplified"],
  [/\bstreamlining\b/giu, "simplifying"],
  [/\bstreamline\b/giu, "simplify"],
  [/\bempower(s|ed|ing)?\b/giu, "help$1"],
  [/\bcutting[- ]edge\b/giu, "new"],
  [/\bstate[- ]of[- ]the[- ]art\b/giu, "current"],
  [/\bgame[- ]chang(er|ing)\b/giu, "major"],
  [/\bdelv(e|es|ed|ing) into\b/giu, "look$1 at"],
  [/!+/g, "."],
];

export function softenCopy(text: string): string {
  let out = text;
  for (const [rx, rep] of REPLACEMENTS) out = out.replace(rx, rep);
  return out.replace(/\.{2,}/g, ".");
}
