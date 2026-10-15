// slop-lint: fails if banned phrases (docs/06 §3) or banned visual patterns (docs/06 §2, §7)
// appear in user-facing source. Run: pnpm slop-lint
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "src");

const phrases = JSON.parse(readFileSync(join(ROOT, "scripts", "banned-phrases.json"), "utf8")).map((p) => new RegExp(p, "iu"));

// Visual rules: no gradients, no glassmorphism, no infinite decorative animation, no emoji in UI copy.
const visual = [
  { rx: /linear-gradient|radial-gradient|conic-gradient|bg-gradient-|from-\w+-\d+\s+to-/, why: "gradient" },
  { rx: /backdrop-filter|backdrop-blur/, why: "glassmorphism" },
  { rx: /animation:[^;]*infinite|animate-(bounce|ping|pulse|spin)/, why: "idle animation" },
  { rx: /[\u{1F300}-\u{1FAFF}\u{2728}]/u, why: "emoji" },
];

// Files whose job is to *contain* the banned list, or test it.
const ALLOW = [/banned\.ts$/, /prompts\.ts$/, /\.test\.ts$/, /qa\.ts$/, /edit\.ts$/];

// The one stylesheet allowed to use gradients/texture/blur, by product-owner decision
// (landing page demo panels, CTA banner, story cards). Keep it to this file.
const VISUAL_ALLOW = [/src\/components\/marketing\/marketing\.css$/];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css|mdx|json)$/.test(name)) out.push(p);
  }
  return out;
}

/** Only check string literals and JSX text, not identifiers or comments. */
function userFacingText(line) {
  if (/^\s*(\/\/|\*|\/\*)/.test(line)) return "";
  const strings = [...line.matchAll(/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|`([^`\\]|\\.)*`/g)].map((m) => m[0]);
  const jsxText = [...line.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]);
  // Lines that are pure JSX text continuation (no code tokens).
  const bare = !/[=(){};]/.test(line) && /[a-z]{3,}\s+[a-z]{3,}/i.test(line) ? [line] : [];
  return [...strings, ...jsxText, ...bare].join(" ");
}

let failures = 0;
for (const file of walk(SRC)) {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  const allowPhrases = ALLOW.some((rx) => rx.test(rel));
  readFileSync(file, "utf8")
    .split(/\r?\n/)
    .forEach((line, i) => {
      // Engineering terms are allowed in code (docs/06 §3): skip import lines and identifiers.
      if (/^\s*import\s/.test(line)) return;
      if (!allowPhrases) {
        const text = userFacingText(line);
        for (const rx of phrases) {
          const m = text.match(rx);
          if (m) {
            console.error(`${rel}:${i + 1}  banned phrase "${m[0]}"  →  ${line.trim().slice(0, 120)}`);
            failures++;
          }
        }
        // Exclamation marks in UI copy (but not "!==" / "!x" code).
        const t = userFacingText(line).replace(/!=|!\w|\(!|!\(/g, "");
        if (/[a-z]!(\s|"|'|<|$)/i.test(t)) {
          console.error(`${rel}:${i + 1}  exclamation mark in copy  →  ${line.trim().slice(0, 120)}`);
          failures++;
        }
      }
      for (const v of visual) {
        if (VISUAL_ALLOW.some((rx) => rx.test(rel))) break;
        if (v.rx.test(line) && !/slop-lint-ignore/.test(line)) {
          console.error(`${rel}:${i + 1}  banned visual (${v.why})  →  ${line.trim().slice(0, 120)}`);
          failures++;
        }
      }
    });
}

if (failures) {
  console.error(`\n${failures} slop finding(s). Rewrite the copy or styling (see docs/06-Anti-Slop-Standards.md).`);
  process.exit(1);
}
console.log("slop-lint: clean");
