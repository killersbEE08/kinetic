"use client";

// Home after sign-in (docs/09). Answers "what do I do now?": start a deck (one box, four ways),
// continue the last deck, or start from a template.
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ClipboardPaste, FileUp, PenLine, RefreshCw } from "lucide-react";
import { ErrorNote, UpgradeNote } from "@/components/ui/chrome";
import { RequireUser } from "@/components/auth/RequireUser";
import { AppShell } from "@/components/app/AppShell";
import { SlideView } from "@/components/deck/SlideView";
import { AssetThumb, formatBytes, ImportZone, kindLabel, LibraryPicker, type ImportedDoc } from "@/components/app/assets-ui";
import { ApiError, useBackend, type DeckSummary } from "@/lib/client/backend";
import type { AssetMeta } from "@/lib/client/assets";
import { CreditCost, useMe } from "@/lib/client/me";
import { saveDraft, type DraftPhoto } from "@/lib/client/draft";
import { CREDIT_COST } from "@/lib/billing/credits";
import { DECK_TYPES, type DeckType } from "@/lib/deck/schema";
import { ASSET_PREFIX } from "@/lib/deck/media";
import { THEMES, deckTheme, getTheme, withBrand } from "@/lib/deck/themes";
import { CATEGORIES, CATEGORY_LABEL, TEMPLATES, forkDeck, templateDeck, type TemplateCategory } from "@/lib/deck/templates";

const TYPE_LABEL: Record<DeckType, string> = { pitch: "Pitch", sales: "Sales", launch: "Launch", lesson: "Lesson", report: "Report", custom: "Other" };
const LANGUAGES = ["English", "Hindi", "Spanish", "French", "German", "Portuguese", "Japanese", "Arabic", "Bengali", "Tamil", "Marathi"];
const SLIDE_COUNTS = ["auto", 5, 8, 10, 12, 15, 20] as const;

type Mode = "describe" | "paste" | "import" | "redesign";
const MODES: { id: Mode; label: string; icon: typeof PenLine }[] = [
  { id: "describe", label: "Describe it", icon: PenLine },
  { id: "paste", label: "Paste notes", icon: ClipboardPaste },
  { id: "import", label: "Import files", icon: FileUp },
  { id: "redesign", label: "Redesign a deck", icon: RefreshCw },
];

const IDEAS: { label: string; prompt: string; type: DeckType }[] = [
  { label: "Seed pitch from my memo", prompt: "Seed pitch for investors. Use the numbers in my notes and end with a clear ask.", type: "pitch" },
  { label: "Sales proposal for a named client", prompt: "Sales proposal for <client name>: their problem in their words, our plan, timeline and price.", type: "sales" },
  { label: "Lesson from lecture notes", prompt: "A 30-minute lesson with learning goals, two worked examples and a recap.", type: "lesson" },
  { label: "Quarterly review", prompt: "Quarterly review for the leadership team: results, what went well, what didn't, next quarter's priorities.", type: "report" },
];

const REDESIGN_PROMPT = "Redesign this deck. Keep every fact, number, quote and photo. Tighten the wording and give each slide one clear point.";

function relTime(iso: string) {
  const d = new Date(iso).getTime();
  if (!d) return "";
  const s = Math.round((Date.now() - d) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 172800) return "yesterday";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

const toPhoto = (a: AssetMeta): DraftPhoto => ({ id: a.id, name: a.name, src: ASSET_PREFIX + a.id, alt: a.alt || a.name });
const wordsOf = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <label className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-line bg-surface pl-2.5 text-[13px] text-ink-2 focus-within:border-accent">
      {label}
      <select className="h-full max-w-[180px] cursor-pointer appearance-none truncate bg-transparent pr-2.5 font-medium text-ink outline-none" value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </label>
  );
}

// ---------------------------------------------------------------------------

/** ?mode=import|redesign (from the command palette) opens that tab, including on same-page navigation. */
function ModeFromUrl({ onMode }: { onMode: (m: Mode) => void }) {
  const m = useSearchParams().get("mode");
  useEffect(() => {
    if (m && MODES.some((x) => x.id === m)) onMode(m as Mode);
  }, [m, onMode]);
  return null;
}

function CreateBox() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("describe");
  const [prompt, setPrompt] = useState("");
  const [notes, setNotes] = useState("");
  const [type, setType] = useState<DeckType>("pitch");
  const [slides, setSlides] = useState<string>("auto");
  const [look, setLook] = useState("theme:mono");
  const [language, setLanguage] = useState("English");
  const [docs, setDocs] = useState<ImportedDoc[]>([]);
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const [picker, setPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);


  const onImported = useCallback((d: ImportedDoc[], p: AssetMeta[]) => {
    setError(null);
    setDocs((x) => [...x, ...d.filter((n) => !x.some((o) => o.id === n.id))]);
    setPhotos((x) => [...x, ...p.map(toPhoto).filter((n) => !x.some((o) => o.id === n.id))].slice(0, 24));
  }, []);

  const words = docs.reduce((n, d) => n + d.words, 0) + wordsOf(notes);

  function go() {
    const p = prompt.trim() || (mode === "redesign" ? REDESIGN_PROMPT : "");
    if (!p && !notes.trim() && !docs.length) {
      setError(mode === "redesign" ? "Add the PowerPoint file you want redesigned." : mode === "import" ? "Add a file first, or describe your talk." : "Describe your talk, or add notes or a file.");
      return;
    }
    if (mode === "redesign" && !docs.length) {
      setError("Add the PowerPoint file you want redesigned.");
      return;
    }
    const [kind, id] = look.split(":");
    saveDraft({
      input: { prompt: p, notes: notes.trim(), deckType: mode === "redesign" ? "custom" : type, slideCount: slides === "auto" ? "auto" : Number(slides), language },
      docs,
      photos,
      themeId: kind === "theme" ? id : undefined,
      look: kind === "tpl" ? id : null,
      autostart: true,
    });
    router.push("/new");
  }

  const dropHint =
    mode === "redesign"
      ? "We keep the slides' text, numbers, notes and photos, write a fresh outline you can edit, then design it in the look you pick."
      : "PDF, Word, PowerPoint, Excel, CSV or text. Photos inside them are saved to your library.";

  return (
    <section className="rounded-[14px] border border-line bg-surface shadow-[0_1px_2px_rgba(16,17,20,.06),0_4px_12px_rgba(16,17,20,.05)]" aria-label="Create a deck">
      <div role="tablist" aria-label="How do you want to start?" className="flex gap-1 overflow-x-auto px-3 pt-2.5">
        {MODES.map((m, i) => {
          const Icon = m.icon;
          const on = m.id === mode;
          return (
            <button
              key={m.id}
              id={`mode-${m.id}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls="create-panel"
              tabIndex={on ? 0 : -1}
              onClick={() => {
                setMode(m.id);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                const next = MODES[(i + (e.key === "ArrowRight" ? 1 : MODES.length - 1)) % MODES.length];
                setMode(next.id);
                document.getElementById(`mode-${next.id}`)?.focus();
              }}
              className={`inline-flex flex-none items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-[14px] font-medium ${on ? "border-ink text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}
            >
              <Icon size={15} strokeWidth={1.75} aria-hidden="true" />
              {m.label}
            </button>
          );
        })}
      </div>

      <div id="create-panel" role="tabpanel" aria-labelledby={`mode-${mode}`} className="border-t border-line px-5 pb-5 pt-4" onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && go()}>
        {mode === "describe" && (
          <textarea
            ref={promptRef}
            aria-label="What are you presenting?"
            className="min-h-[88px] w-full resize-y bg-transparent text-[17px] leading-[1.5] outline-none placeholder:text-ink-2"
            placeholder="What are you presenting, and to whom? For example: Q3 results for the leadership team, using the numbers in my spreadsheet."
            value={prompt}
            maxLength={4000}
            onChange={(e) => setPrompt(e.target.value)}
          />
        )}
        {mode === "paste" && (
          <>
            <input aria-label="What is it for?" className="w-full bg-transparent pb-2 text-[16px] font-medium outline-none placeholder:text-ink-2" placeholder="What is it for? (optional) e.g. Board update, 10 minutes" value={prompt} maxLength={4000} onChange={(e) => setPrompt(e.target.value)} />
            <textarea
              aria-label="Your notes"
              className="field min-h-[180px] resize-y text-[15px]"
              placeholder="Paste a memo, meeting notes, an outline or data. Leave a blank line between topics. Kinetic only uses facts from here."
              value={notes}
              maxLength={400_000}
              onChange={(e) => setNotes(e.target.value)}
            />
            <p className="tabular mt-1 text-right text-[12px] text-ink-2">{wordsOf(notes).toLocaleString()} words</p>
          </>
        )}
        {(mode === "import" || mode === "redesign") && (
          <>
            <ImportZone onImported={onImported}>
              <span className="text-[15px] font-medium">{mode === "redesign" ? "Drop your PowerPoint (.pptx) here, or " : "Drop files or photos here, or "}<span className="text-accent underline">browse</span></span>
              <span className="max-w-[560px] text-[13px] text-ink-2">{dropHint}</span>
            </ImportZone>
            <input aria-label="Instructions (optional)" className="field mt-3 text-[14px]" placeholder={mode === "redesign" ? "Anything to change? (optional) e.g. Shorter, for investors, 10 slides" : "What is it for? (optional) e.g. Seed pitch for investors"} value={prompt} maxLength={4000} onChange={(e) => setPrompt(e.target.value)} />
          </>
        )}

        {(docs.length > 0 || photos.length > 0) && (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Attached">
            {docs.map((d) => (
              <li key={d.id} className="flex h-8 items-center gap-2 rounded-[8px] border border-line bg-canvas pl-2.5 pr-1 text-[12px] text-ink-2" title={d.note}>
                <b className="max-w-[200px] truncate font-semibold text-ink">{d.name}</b>
                {kindLabel(d.kind)} · {d.words.toLocaleString()} words
                <button type="button" className="rounded px-1.5 text-[14px] hover:bg-line" aria-label={`Remove ${d.name}`} onClick={() => setDocs((x) => x.filter((o) => o.id !== d.id))}>×</button>
              </li>
            ))}
            {photos.length > 0 && (
              <li className="flex h-8 items-center gap-2 rounded-[8px] border border-line bg-canvas pl-1 pr-1 text-[12px] text-ink-2">
                <span className="flex -space-x-2">
                  {photos.slice(0, 3).map((p) => <AssetThumb key={p.id} id={p.id} alt="" className="h-6 w-8 rounded-[4px] border border-surface" />)}
                </span>
                {photos.length} photo{photos.length > 1 ? "s" : ""}
                <button type="button" className="rounded px-1.5 text-[14px] hover:bg-line" aria-label="Remove photos" onClick={() => setPhotos([])}>×</button>
              </li>
            )}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {mode !== "redesign" && (
            <Select label="Type" value={type} onChange={(v) => setType(v as DeckType)}>
              {DECK_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </Select>
          )}
          <Select label="Slides" value={slides} onChange={setSlides}>
            {SLIDE_COUNTS.map((n) => <option key={n} value={String(n)}>{n === "auto" ? "Auto" : n}</option>)}
          </Select>
          <Select label="Look" value={look} onChange={setLook}>
            <optgroup label="Themes">
              {THEMES.map((t) => <option key={t.id} value={`theme:${t.id}`}>{t.name}</option>)}
            </optgroup>
            <optgroup label="Template designs">
              {TEMPLATES.map((t) => <option key={t.id} value={`tpl:${t.id}`}>{t.brand.name} ({CATEGORY_LABEL[t.category]})</option>)}
            </optgroup>
          </Select>
          <Select label="Language" value={language} onChange={setLanguage}>
            {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
          </Select>
          {mode !== "import" && mode !== "redesign" && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicker(true)}>{photos.length ? "Add more photos" : "Add photos"}</button>
          )}
          <span className="ml-auto flex items-center gap-3">
            {words > 0 && <span className="tabular hidden text-[12px] text-ink-2 sm:inline">{words.toLocaleString()} words</span>}
            <CreditCost credits={CREDIT_COST.outline} />
            <button type="button" className="btn btn-primary" onClick={go}>
              Write the outline
            </button>
          </span>
        </div>
        {error && <p className="mt-2 text-[13px] text-danger" role="alert">{error}</p>}

        {mode === "describe" && (
          <div className="mt-3 flex flex-wrap gap-2" aria-label="Examples">
            {IDEAS.map((i) => (
              <button
                key={i.label}
                type="button"
                className="rounded-full border border-dashed border-line px-3 py-1 text-[12px] text-ink-2 hover:border-solid hover:border-ink-2 hover:text-ink"
                onClick={() => {
                  setPrompt(i.prompt);
                  setType(i.type);
                  promptRef.current?.focus();
                }}
              >
                {i.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <Suspense fallback={null}>
        <ModeFromUrl onMode={setMode} />
      </Suspense>
      <LibraryPicker open={picker} onClose={() => setPicker(false)} onPick={(a) => onImported([], a)} title="Photos for this deck" />
    </section>
  );
}

// ---------------------------------------------------------------------------

function Status({ deck }: { deck: DeckSummary }) {
  const n = deck.suggestedCount ?? 0;
  if (n > 0) return <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-warning"><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{n} suggested item{n > 1 ? "s" : ""} to check</span>;
  return <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-success"><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />Ready to present</span>;
}

function Thumb({ deck, play, className = "" }: { deck: DeckSummary; play?: boolean; className?: string }) {
  if (!deck.firstSlide) return <div className={`skeleton aspect-video ${className}`} />;
  return (
    <div className={`overflow-hidden rounded-[8px] border border-line ${className}`}>
      <SlideView slide={deck.firstSlide} theme={withBrand(getTheme(deck.themeId), deck.brand)} intensity={deck.motionIntensity} mode={play ? "play" : "static"} step={9} playKey={play ? "on" : "off"} label={`First slide of ${deck.title}`} />
    </div>
  );
}

function Continue({ decks }: { decks: DeckSummary[] }) {
  const [hover, setHover] = useState(false);
  const [first, ...rest] = decks;
  return (
    <section aria-labelledby="cont-h">
      <div className="mb-3.5 flex items-baseline justify-between gap-3">
        <h2 id="cont-h" className="text-[17px] font-semibold tracking-[-0.01em]">Continue where you left off</h2>
        <Link href="/decks" className="text-[13px] font-medium text-accent hover:underline">All decks ({decks.length})</Link>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <article className="grid gap-5 rounded-[14px] border border-line bg-surface p-4 sm:grid-cols-[1.1fr_1fr]" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
          <Link href={`/d/${first.id}`} aria-label={`Open ${first.title}`}>
            <Thumb deck={first} play={hover} />
          </Link>
          <div className="flex min-w-0 flex-col gap-2 py-1">
            <Status deck={first} />
            <h3 className="text-[18px] font-semibold leading-[1.25] tracking-[-0.01em]">{first.title}</h3>
            <p className="text-[13px] text-ink-2">{first.slideCount} slides · edited {relTime(first.updatedAt)} · {getTheme(first.themeId).name}</p>
            <div className="mt-auto flex flex-wrap gap-2 pt-2">
              <Link href={`/d/${first.id}`} className="btn btn-primary btn-sm">Open editor</Link>
              <Link href={`/d/${first.id}/present`} className="btn btn-secondary btn-sm">Present</Link>
              <Link href={`/d/${first.id}?export=1`} className="btn btn-secondary btn-sm">Download</Link>
            </div>
          </div>
        </article>
        {rest.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {rest.slice(0, 3).map((d) => (
              <li key={d.id}>
                <Link href={`/d/${d.id}`} className="grid grid-cols-[112px_1fr] items-center gap-3.5 rounded-[10px] border border-transparent p-2 hover:border-line hover:bg-surface">
                  <Thumb deck={d} />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold">{d.title}</span>
                    <span className="block text-[12px] text-ink-2">{d.slideCount} slides · {relTime(d.updatedAt)}</span>
                    {(d.suggestedCount ?? 0) > 0 && <span className="block text-[12px] text-warning">{d.suggestedCount} to check</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Tips compact />
        )}
      </div>
    </section>
  );
}

function Tips({ compact = false }: { compact?: boolean }) {
  return (
    <aside className={`grid gap-4 ${compact ? "" : "sm:grid-cols-2"}`} aria-label="Tips">
      <div className="rounded-[14px] border border-line bg-surface p-4">
        <h3 className="text-[14px] font-semibold">Have an old deck?</h3>
        <p className="mt-1 text-[13px] leading-[19px] text-ink-2">Use &ldquo;Redesign a deck&rdquo; above. Upload a .pptx and get it back with one clear point per slide, keeping your numbers and photos.</p>
      </div>
      <div className="rounded-[14px] border border-line bg-surface p-4">
        <h3 className="text-[14px] font-semibold">Your photos, on your slides</h3>
        <p className="mt-1 text-[13px] leading-[19px] text-ink-2">Upload team, product or event photos once. Kinetic places them on slides that suit them, and you can swap any photo in the editor.</p>
        <Link href="/assets" className="btn btn-secondary btn-sm mt-3">Open photo library</Link>
      </div>
    </aside>
  );
}

function FirstVisit({ onSample, busy }: { onSample: () => void; busy: boolean }) {
  const sample = useMemo(() => templateDeck("ledgerly-seed")!, []);
  const steps = [
    { done: true, t: "Create your account", d: "Done. Your decks are private until you share or download them." },
    { done: false, t: "Make your first deck", d: "Describe it above or drop a PDF, Word or PowerPoint file. About two minutes." },
    { done: false, t: "Download or present it", d: "Editable PowerPoint with animations, a PDF, or present right in the browser." },
  ];
  return (
    <>
      <ol className="grid gap-3 md:grid-cols-3" aria-label="Getting started">
        {steps.map((s, i) => (
          <li key={s.t} className="flex gap-3 rounded-[10px] border border-line bg-surface px-4 py-3.5">
            <span className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-[12px] font-semibold ${s.done ? "bg-success text-white" : "border border-line"}`} aria-hidden="true">{s.done ? <Check size={14} strokeWidth={3} /> : i + 1}</span>
            <span>
              <span className="block text-[14px] font-semibold">{s.t}<span className="sr-only">{s.done ? " (done)" : ""}</span></span>
              <span className="mt-0.5 block text-[12px] leading-[17px] text-ink-2">{s.d}</span>
            </span>
          </li>
        ))}
      </ol>
      <section className="grid items-center gap-6 rounded-[14px] border border-dashed border-line p-5 md:grid-cols-[1.2fr_1fr]" aria-labelledby="sample-h">
        <div className="overflow-hidden rounded-[10px] border border-line">
          <SlideView slide={sample.slides[4]} theme={deckTheme(sample)} intensity="standard" mode="play" step={9} label="Slide from the sample deck" />
        </div>
        <div>
          <h2 id="sample-h" className="text-[17px] font-semibold">No decks yet</h2>
          <p className="mt-1 text-[14px] leading-[21px] text-ink-2">Open the sample to see how slides build, how AI edits are shown before you accept them, and what the PowerPoint download looks like. It&rsquo;s a {sample.slides.length}-slide pitch for a fictional company.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={onSample} disabled={busy}>{busy ? "Opening" : "Open the sample deck"}</button>
            <Link href="/templates" className="btn btn-secondary btn-sm">Browse {TEMPLATES.length} templates</Link>
          </div>
        </div>
      </section>
    </>
  );
}

function TemplateRow({ onUse, busy }: { onUse: (id: string) => void; busy: string | null }) {
  const [cat, setCat] = useState<TemplateCategory | "all">("all");
  const [hover, setHover] = useState<string | null>(null);
  const list = useMemo(() => TEMPLATES.filter((t) => cat === "all" || t.category === cat).slice(0, 4), [cat]);
  return (
    <section aria-labelledby="tpl-h">
      <div className="mb-3.5 flex items-baseline justify-between gap-3">
        <h2 id="tpl-h" className="text-[17px] font-semibold tracking-[-0.01em]">Start from a template</h2>
        <Link href="/templates" className="text-[13px] font-medium text-accent hover:underline">All {TEMPLATES.length} templates</Link>
      </div>
      <div role="tablist" aria-label="Template type" className="mb-4 flex gap-1.5 overflow-x-auto">
        {(["all", ...CATEGORIES] as const).map((c) => (
          <button key={c} type="button" role="tab" aria-selected={cat === c} onClick={() => setCat(c)} className={`h-[30px] flex-none whitespace-nowrap rounded-full border px-3 text-[12px] font-medium ${cat === c ? "border-ink bg-ink text-canvas" : "border-line bg-surface text-ink-2 hover:text-ink"}`}>
            {c === "all" ? "All" : CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {list.map((t) => {
          const deck = templateDeck(t.id)!;
          const show = deck.slides[t.highlights?.[0] ?? 0] ?? deck.slides[0];
          const on = hover === t.id;
          return (
            <li key={t.id} className="overflow-hidden rounded-[10px] border border-line bg-surface" onMouseEnter={() => setHover(t.id)} onMouseLeave={() => setHover(null)}>
              <Link href={`/t/${t.id}`} className="block" aria-label={`Preview ${t.name}`}>
                <SlideView slide={show} theme={withBrand(getTheme(t.themeId), t.brand)} intensity={t.intensity} mode={on ? "play" : "static"} step={9} playKey={on ? "on" : "off"} />
              </Link>
              <div className="border-t border-line p-3">
                <p className="truncate text-[13px] font-semibold">{t.name}</p>
                <p className="truncate text-[12px] text-ink-2">{CATEGORY_LABEL[t.category]} · {deck.slides.length} slides</p>
                <div className="mt-2.5 flex gap-1.5">
                  <Link href={`/new?look=${t.id}`} className="btn btn-secondary btn-sm min-h-[30px] flex-1 px-2 text-[12px]">Use design</Link>
                  <button type="button" className="btn btn-ghost btn-sm min-h-[30px] flex-1 px-2 text-[12px]" disabled={!!busy} onClick={() => onUse(t.id)}>
                    {busy === t.id ? "Copying" : "Copy deck"}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------

function DashboardInner() {
  const backend = useBackend();
  const router = useRouter();
  const { me } = useMe();
  const [decks, setDecks] = useState<DeckSummary[] | null>(null);
  const [assets, setAssets] = useState<AssetMeta[] | null>(null);
  const [error, setError] = useState<{ text: string; upgrade: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([backend.listDecks(), backend.listAssets().catch(() => ({ assets: [] as AssetMeta[] }))])
      .then(([list, a]) => {
        if (cancelled) return;
        setError(null);
        setDecks(list);
        setAssets(a.assets);
      })
      .catch((e) => !cancelled && setError({ text: e instanceof ApiError ? e.message : "Could not load your decks.", upgrade: false }));
    return () => {
      cancelled = true;
    };
  }, [backend, reload]);

  async function copyTemplate(id: string) {
    setBusy(id);
    setError(null);
    try {
      const deck = await backend.createDeck(forkDeck(templateDeck(id)!));
      router.push(`/d/${deck.id}`);
    } catch (e) {
      setError({ text: e instanceof ApiError ? e.message : "Could not copy the template.", upgrade: e instanceof ApiError && e.status === 402 });
      setBusy(null);
    }
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstVisit = decks !== null && decks.length === 0;
  const toCheck = (decks ?? []).filter((d) => (d.suggestedCount ?? 0) > 0).length;
  const atLimit = me?.plan === "free" && me.deckCount >= 3;

  const subline =
    decks === null
      ? " "
      : firstVisit
        ? "Make your first deck in about two minutes. Start with a sentence, your notes, or a file."
        : `${decks.length} deck${decks.length === 1 ? "" : "s"}${toCheck ? `, ${toCheck} with suggested items to check` : ""}. Last edited ${relTime(decks[0].updatedAt)}.`;

  return (
    <main className="mx-auto flex max-w-[1120px] flex-col gap-9 px-4 py-7 sm:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">{greeting}</h1>
          <p className="mt-1 min-h-[21px] text-[14px] text-ink-2">{subline}</p>
        </div>
        {me && !me.features.gemini && <p className="rounded-[8px] border border-line px-3 py-1.5 text-[12px] text-ink-2">AI is in offline mode: outlines use your own text only.</p>}
      </div>

      {error && (error.upgrade ? <UpgradeNote message={error.text} /> : <ErrorNote onRetry={() => setReload((r) => r + 1)}>{error.text}</ErrorNote>)}
      {atLimit && <UpgradeNote message="You've used 3 of 3 decks on the Free plan. Your decks stay editable; upgrade to create more." />}

      <CreateBox />

      {decks === null && !error ? (
        <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]" aria-busy="true">
          <div className="skeleton h-[220px] rounded-[14px]" />
          <div className="flex flex-col gap-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-[64px]" />)}</div>
        </div>
      ) : firstVisit ? (
        <FirstVisit onSample={() => copyTemplate("ledgerly-seed")} busy={busy === "ledgerly-seed"} />
      ) : decks && decks.length > 0 ? (
        <>
          <Continue decks={decks} />
          {decks.length > 1 && <Tips />}
        </>
      ) : null}

      <TemplateRow onUse={copyTemplate} busy={busy} />

      {assets && assets.length > 0 && (
        <section aria-labelledby="photos-h">
          <div className="mb-3.5 flex items-baseline justify-between gap-3">
            <h2 id="photos-h" className="text-[17px] font-semibold tracking-[-0.01em]">Your photos <span className="tabular text-[13px] font-normal text-ink-2">{assets.length} · {formatBytes(assets.reduce((n, a) => n + a.bytes, 0))}</span></h2>
            <Link href="/assets" className="text-[13px] font-medium text-accent hover:underline">Manage photos</Link>
          </div>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6 lg:grid-cols-8">
            {assets.slice(0, 8).map((a) => (
              <li key={a.id}><AssetThumb id={a.id} alt={a.alt} className="aspect-[4/3] w-full rounded-[8px]" /></li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

export default function DashboardPage() {
  return (
    <RequireUser>
      <AppShell>
        <DashboardInner />
      </AppShell>
    </RequireUser>
  );
}
