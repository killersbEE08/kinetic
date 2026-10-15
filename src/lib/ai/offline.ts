// Deterministic generator used when GEMINI_API_KEY is not set (and in demo mode).
// It only restructures the user's own words: it never writes facts. Where a deck section
// has no material, it adds a clearly marked "Suggested" placeholder telling the user what to add.
import type { DeckType, GenerationInput, Outline, OutlineSlide } from "../deck/schema";
import type { SlottedSlide, SlotContent } from "../deck/compose";

interface Chunk {
  ref: string;
  text: string;
  sentences: string[];
}

const SECTIONS: Record<DeckType, { title: string; keywords: RegExp; layout?: string; hint: string }[]> = {
  pitch: [
    { title: "The problem", keywords: /problem|pain|today|struggle|manual|slow|costly|hard/i, hint: "Describe who has the problem and what it costs them." },
    { title: "Our solution", keywords: /solution|we built|product|platform|app|tool|lets|helps/i, hint: "Say what the product does in one sentence." },
    { title: "How it works", keywords: /step|first|then|upload|connect|how it works|workflow/i, layout: "process", hint: "List the 3 steps a customer goes through." },
    { title: "Traction", keywords: /revenue|mrr|arr|users|customers|growth|grew|%|retention|signed/i, hint: "Add your real numbers: revenue, users, growth." },
    { title: "Market", keywords: /market|tam|sam|segment|smb|businesses|industry/i, hint: "Size the market with a sourced number." },
    { title: "Business model", keywords: /price|pricing|plan|subscription|per month|fee|margin/i, hint: "Explain how you charge and what it costs to serve." },
    { title: "Team", keywords: /team|founder|ceo|cto|previously|ex-|experience/i, hint: "Name the founders and one relevant credential each." },
    { title: "The ask", keywords: /raise|raising|round|seed|invest|ask|use of funds|runway/i, layout: "closing", hint: "State the amount you are raising and what it pays for." },
  ],
  sales: [
    { title: "What we heard", keywords: /challenge|problem|goal|need|today|currently/i, hint: "Restate the customer's problem in their words." },
    { title: "What we offer", keywords: /solution|product|offer|feature|we/i, hint: "List the 3 capabilities that matter to this buyer." },
    { title: "Results", keywords: /result|saved|increase|reduce|roi|%|customers/i, hint: "Add a customer result with a real number." },
    { title: "Pricing", keywords: /price|pricing|plan|cost|per/i, hint: "Show the plan you recommend." },
    { title: "Next steps", keywords: /next|pilot|trial|start|contract|timeline/i, layout: "closing", hint: "Propose a concrete next step and a date." },
  ],
  launch: [
    { title: "What's new", keywords: /launch|new|introduc|today|release|announce/i, hint: "Name the launch in one line." },
    { title: "Why it matters", keywords: /problem|why|because|customers|asked|need/i, hint: "Say which customer problem this solves." },
    { title: "How it works", keywords: /step|how|works|use|set up|turn on/i, layout: "process", hint: "Show the 3 steps to use it." },
    { title: "Key numbers", keywords: /%|faster|users|beta|tested|x\b/i, hint: "Add a measured result from beta." },
    { title: "Availability", keywords: /available|pricing|plan|rollout|today|access/i, layout: "closing", hint: "Say who gets it and when." },
  ],
  lesson: [
    { title: "What you'll learn", keywords: /learn|objective|goal|today|cover/i, hint: "List 3 learning objectives." },
    { title: "Key idea", keywords: /is|are|defin|means|concept|principle/i, layout: "headlineBody", hint: "Explain the core concept in two sentences." },
    { title: "How it works", keywords: /step|process|first|then|stage/i, layout: "process", hint: "Break the process into steps." },
    { title: "Example", keywords: /example|for instance|case|such as|e\.g\./i, hint: "Give one concrete example." },
    { title: "Recap", keywords: /summary|recap|remember|takeaway|conclusion/i, layout: "closing", hint: "Summarise the 3 takeaways." },
  ],
  report: [
    { title: "Summary", keywords: /summary|overall|quarter|month|year|highlights/i, hint: "State the headline result for the period." },
    { title: "Key metrics", keywords: /%|revenue|users|growth|cost|margin|\d/i, hint: "Add the 3–4 metrics you report on." },
    { title: "What went well", keywords: /well|win|success|achiev|launched|shipped/i, hint: "List the wins." },
    { title: "What didn't", keywords: /miss|issue|risk|problem|delay|churn|declin/i, hint: "List what missed and why." },
    { title: "Next quarter", keywords: /next|plan|goal|priority|focus|will/i, layout: "closing", hint: "List the priorities for next period." },
  ],
  custom: [],
};

function chunk(notes: string): Chunk[] {
  return notes
    .split(/\n\s*\n|\r\n\s*\r\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 2)
    .map((text, i) => ({
      ref: `¶${i + 1}`,
      text,
      sentences: text
        .split(/(?<=[.?!])\s+|\s*[•·]\s+|\s+-\s+/)
        .map((s) => s.trim().replace(/^[-*]\s*/, ""))
        .filter((s) => s.length > 2),
    }));
}

function titleFromPrompt(prompt: string, notes: string): string {
  const firstLine = (prompt || notes).split(/\n/)[0].trim();
  const cleaned = firstLine.replace(/^(make|create|build|generate|write)\s+(me\s+)?(a|an)?\s*/i, "").replace(/[.?!]+$/, "");
  const words = cleaned.split(/\s+/).slice(0, 9).join(" ");
  return words ? words[0].toUpperCase() + words.slice(1) : "Untitled deck";
}

export function offlineOutline(input: GenerationInput): Outline {
  const chunks = chunk(input.notes || input.prompt);
  const title = titleFromPrompt(input.prompt, input.notes);
  const sections = SECTIONS[input.deckType];
  const used = new Set<number>();
  const slides: OutlineSlide[] = [{ title, points: input.audience ? [{ text: `For ${input.audience}` }] : [], layoutHint: "title" }];

  if (sections.length) {
    for (const sec of sections) {
      // Pick the best-matching unused paragraph for this section.
      let best = -1;
      let bestScore = 0;
      chunks.forEach((c, i) => {
        if (used.has(i)) return;
        const score = (c.text.match(new RegExp(sec.keywords.source, "gi")) ?? []).length;
        if (score > bestScore) [best, bestScore] = [i, score];
      });
      if (best >= 0) {
        used.add(best);
        const c = chunks[best];
        slides.push({ title: sec.title, points: c.sentences.slice(0, 5).map((s) => ({ text: s, source: c.ref })), layoutHint: sec.layout });
      } else {
        slides.push({ title: sec.title, points: [{ text: `Suggested: ${sec.hint}` }], layoutHint: sec.layout });
      }
    }
  }
  // Any paragraph not yet used becomes its own slide, so nothing the user wrote is dropped.
  chunks.forEach((c, i) => {
    if (used.has(i)) return;
    const [head, ...rest] = c.sentences;
    const shortHead = head && head.split(/\s+/).length <= 10;
    slides.push({
      title: shortHead ? head.replace(/[.:]$/, "") : c.sentences.length > 1 ? head.split(/\s+/).slice(0, 7).join(" ").replace(/[,.:;]$/, "") : `Point ${slides.length}`,
      points: (shortHead ? rest : c.sentences).slice(0, 5).map((s) => ({ text: s, source: c.ref })),
    });
  });

  let result = slides;
  if (input.slideCount !== "auto" && result.length > input.slideCount) {
    // Keep the first n-1 slides and the closing slide; fold dropped slides' points into the
    // last kept body slide (QA later moves anything over the limit into speaker notes).
    const n = input.slideCount;
    const kept = slides.slice(0, n - 1);
    const dropped = slides.slice(n - 1, -1);
    const target = kept[kept.length - 1];
    if (target && kept.length > 1) {
      target.points = [...target.points, ...dropped.flatMap((d) => d.points)].slice(0, 8);
    }
    result = [...kept, slides[slides.length - 1]];
  } else if (result.length > 20) {
    result = result.slice(0, 20);
  }
  if (!sections.length && result.length < 3) {
    result.push({ title: "Next steps", points: [{ text: "Suggested: Say what you want the audience to do next." }], layoutHint: "closing" });
  }
  return { title, slides: result.slice(0, 40) };
}

// ---------------- Outline → slotted slides ----------------

const NUM_LABEL_RX = /^(.*?)[:\-–—]?\s*((?:[$€£₹])?\d[\d,]*(?:\.\d+)?)\s*(%|k|m|bn|x)?\b(.*)$/i;

function parseMetric(text: string): { label: string; value: number; unit?: string } | null {
  const m = text.match(NUM_LABEL_RX);
  if (!m) return null;
  const value = Number(m[2].replace(/[^\d.]/g, ""));
  if (!Number.isFinite(value)) return null;
  const currency = m[2].match(/[$€£₹]/)?.[0];
  const label = (m[1] + " " + m[4]).replace(/\s+/g, " ").replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, "").slice(0, 40) || "Value";
  const unit = [currency, m[3]].filter(Boolean).join("") || undefined;
  return { label, value, unit: unit?.slice(0, 8) };
}

function pickLayout(s: OutlineSlide, index: number, total: number): string {
  if (s.layoutHint) return s.layoutHint;
  if (index === 0) return "title";
  const texts = s.points.map((p) => p.text);
  const metrics = texts.map(parseMetric).filter(Boolean);
  if (/["“].{10,}["”]/.test(texts.join(" "))) return "quote";
  if (metrics.length >= 3 && metrics.length === texts.length) return "kpiRow";
  if (metrics.length === 1 && texts.length <= 2 && texts[0].split(/\s+/).length <= 12) return "bigNumber";
  if (/\b(how|steps?|process|workflow)\b/i.test(s.title) && texts.length >= 3) return "process";
  if (/\b(vs\.?|versus|before|after|compare)\b/i.test(s.title) && texts.length >= 4) return "twoColumn";
  if (index === total - 1 && /\b(ask|next|thank|contact|join|start)\b/i.test(s.title)) return "closing";
  if (texts.length === 1 && texts[0].split(/\s+/).length > 14) return "headlineBody";
  if (texts.length === 0) return "statement";
  return "bullets";
}

const suggested = (t: string) => t.startsWith("Suggested: ");
const clean = (t: string) => t.replace(/^Suggested:\s*/, "");

export function outlineSlideToSlotted(s: OutlineSlide, index: number, total: number): SlottedSlide {
  const layout = pickLayout(s, index, total);
  const texts = s.points.map((p) => p.text);
  const anySuggested = texts.some(suggested);
  const plain = texts.map(clean);
  const slots: SlotContent[] = [];
  const notes: string[] = [];

  switch (layout) {
    case "title":
      slots.push({ slot: "title", text: s.title });
      if (plain[0]) slots.push({ slot: "subtitle", text: plain[0] });
      break;
    case "statement":
      slots.push({ slot: "statement", text: plain[0] ?? s.title });
      break;
    case "headlineBody":
      slots.push({ slot: "title", text: s.title }, { slot: "body", text: plain.join(" "), suggested: anySuggested });
      break;
    case "quote": {
      const q = plain.find((t) => /["“]/.test(t)) ?? plain[0] ?? "";
      const attribution = q.match(/["”]\s*[-–—,]?\s*(.+)$/)?.[1] ?? s.title;
      slots.push({ slot: "quote", text: q.replace(/["”]\s*[-–—,]?\s*.+$/, "").replace(/^["“]/, "") }, { slot: "attribution", text: attribution });
      break;
    }
    case "bigNumber": {
      // The metric may be any point (or missing when the user picked this layout by hand).
      const at = plain.findIndex((t) => parseMetric(t));
      if (at < 0) return outlineSlideToSlotted({ ...s, layoutHint: "bullets" }, index, total);
      const m = parseMetric(plain[at])!;
      const rest = plain.filter((_, k) => k !== at);
      slots.push(
        { slot: "number", chart: { kind: "kpi", labels: [m.label], series: [{ name: m.label, values: [m.value] }], unit: m.unit } },
        { slot: "label", text: s.title },
      );
      if (rest[0]) slots.push({ slot: "context", text: rest[0] });
      notes.push(...rest.slice(1));
      break;
    }
    case "kpiRow": {
      const ms = plain.map(parseMetric).filter((m): m is NonNullable<typeof m> => !!m).slice(0, 4);
      if (!ms.length) return outlineSlideToSlotted({ ...s, layoutHint: "bullets" }, index, total);
      slots.push(
        { slot: "title", text: s.title },
        { slot: "kpis", chart: { kind: "kpi", labels: ms.map((m) => m.label), series: [{ name: "Value", values: ms.map((m) => m.value) }], units: ms.map((m) => m.unit ?? "") } },
      );
      break;
    }
    case "process":
      slots.push({ slot: "title", text: s.title }, { slot: "steps", items: plain.slice(0, 4), suggested: anySuggested });
      notes.push(...plain.slice(4));
      break;
    case "twoColumn": {
      const half = Math.ceil(plain.length / 2);
      slots.push(
        { slot: "title", text: s.title },
        { slot: "leftLabel", text: "Before" },
        { slot: "left", items: plain.slice(0, half) },
        { slot: "rightLabel", text: "After" },
        { slot: "right", items: plain.slice(half) },
      );
      break;
    }
    case "closing":
      slots.push({ slot: "title", text: s.title });
      if (plain[0]) slots.push({ slot: "body", text: plain[0], suggested: suggested(texts[0]) });
      if (plain[1]) slots.push({ slot: "contact", text: plain[1] });
      break;
    default:
      slots.push({ slot: "title", text: s.title }, { slot: "points", items: plain.slice(0, 5), suggested: anySuggested });
      notes.push(...plain.slice(5));
  }
  return { layout, slots, notes: notes.join("\n") };
}

export function offlineSlides(outline: Outline): SlottedSlide[] {
  return outline.slides.map((s, i) => outlineSlideToSlotted(s, i, outline.slides.length));
}
