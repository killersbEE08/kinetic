"use client";

// Home after sign-in (docs/09). Answers "what do I do now?": start a deck (one box, four ways),
// continue the last deck, or start from a template.
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Check, ClipboardPaste, Download, Eye, FilePlus2, FileUp, Images, Palette, PenLine, Play, RefreshCw, Share2 } from "lucide-react";
import { NEW_SLIDES } from "@/lib/deck/starters";
import { newId } from "@/lib/deck/ids";
import type { Deck } from "@/lib/deck/schema";
import { ErrorNote, UpgradeNote } from "@/components/ui/chrome";
import { RequireUser } from "@/components/auth/RequireUser";
import { AppShell } from "@/components/app/AppShell";
import { SlideView } from "@/components/deck/SlideView";
import { AssetThumb, formatBytes, ImportZone, kindLabel, LibraryPicker, type ImportedDoc } from "@/components/app/assets-ui";
import { ApiError, useBackend, type BrandKit, type DeckSummary, type ShareLink } from "@/lib/client/backend";
import { fmtDuration, relTime as relTimeShare } from "@/components/app/ShareDialog";
import type { AssetMeta } from "@/lib/client/assets";
import { CreditCost, useMe } from "@/lib/client/me";
import { saveDraft, type DraftPhoto } from "@/lib/client/draft";
import { setPendingRedesign } from "@/lib/client/redesign";
import { CREDIT_COST } from "@/lib/billing/credits";
import { DECK_TYPES, type DeckType } from "@/lib/deck/schema";
import { ASSET_PREFIX } from "@/lib/deck/media";
import { THEMES, deckTheme, getTheme, withBrand } from "@/lib/deck/themes";
import { CATEGORIES, CATEGORY_LABEL, TEMPLATES, forkDeck, templateDeck, type TemplateCategory } from "@/lib/deck/templates";

const TYPE_LABEL: Record<DeckType, string> = { pitch: "Pitch", sales: "Sales", launch: "Launch", lesson: "Lesson", academic: "Academics", report: "Report", custom: "Other" };
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
  { label: "Thesis or research talk", prompt: "Research presentation: question, background, method, results with numbers, discussion and conclusion.", type: "academic" },
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
    <label className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-line bg-surface pl-2.5 text-[13px] text-ink-2 transition-shadow focus-within:border-accent focus-within:ring-2 focus-within:ring-[color-mix(in_srgb,var(--accent)_25%,transparent)]">
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
  const [kits, setKits] = useState<BrandKit[]>([]);
  const backend = useBackend();
  useEffect(() => {
    let cancelled = false;
    backend
      .listBrandKits()
      .then((k) => {
        if (cancelled) return;
        setKits(k);
        const d = k.find((x) => x.isDefault);
        if (d) setLook(`kit:${d.id}`);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [backend]);
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
      brandKitId: kind === "kit" ? id : null,
      autostart: true,
    });
    router.push("/new");
  }

  const dropHint =
    mode === "redesign"
      ? "We keep the slides' text, numbers, notes and photos, write a fresh outline you can edit, then design it in the look you pick."
      : "PDF, Word, PowerPoint, Excel, CSV or text. Photos inside them are saved to your library.";

  return (
    <section className="rounded-[18px] border border-line bg-surface shadow-[0_1px_2px_rgba(16,17,20,.05),0_12px_32px_-16px_rgba(16,17,20,.16)] transition-shadow focus-within:border-[color-mix(in_srgb,var(--accent)_45%,var(--line))] focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_12%,transparent),0_12px_32px_-16px_rgba(16,17,20,.16)]" aria-label="Create a deck">
      <div role="tablist" aria-label="How do you want to start?" className="flex gap-1 overflow-x-auto px-3 pt-3">
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
              className={`inline-flex h-9 flex-none items-center gap-2 whitespace-nowrap rounded-[10px] px-3 text-[13.5px] font-medium transition-colors ${on ? "bg-[color-mix(in_srgb,var(--ink)_7%,transparent)] text-ink" : "text-ink-2 hover:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)] hover:text-ink"}`}
            >
              <Icon size={15} strokeWidth={1.75} aria-hidden="true" />
              {m.label}
            </button>
          );
        })}
      </div>

      <div id="create-panel" role="tabpanel" aria-labelledby={`mode-${mode}`} className="px-5 pb-4 pt-3" onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && go()}>
        {mode === "describe" && (
          <textarea
            ref={promptRef}
            aria-label="What are you presenting?"
            className="min-h-[96px] w-full resize-none bg-transparent text-[18px] leading-[1.5] tracking-[-0.005em] outline-none placeholder:text-[color-mix(in_srgb,var(--ink-2)_80%,transparent)]"
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
              placeholder="Paste a memo, meeting notes, an outline or data. Leave a blank line between topics. DeckIQ only uses facts from here."
              value={notes}
              maxLength={400_000}
              onChange={(e) => setNotes(e.target.value)}
            />
            <p className="tabular mt-1 text-right text-[12px] text-ink-2">{wordsOf(notes).toLocaleString()} words</p>
          </>
        )}
        {mode === "redesign" && (
          <label
            className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-[10px] border-2 border-dashed border-line px-6 py-8 text-center hover:border-ink-2"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) {
                setPendingRedesign(f);
                router.push("/redesign");
              }
            }}
          >
            <span className="text-[15px] font-medium">Drop your PowerPoint (.pptx) here, or <span className="text-accent underline">browse</span></span>
            <span className="max-w-[560px] text-[13px] text-ink-2">See each original slide next to its redesign, then keep the new design or the original, slide by slide. Facts, numbers, notes and photos are kept.</span>
            <input
              type="file"
              accept=".pptx"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setPendingRedesign(f);
                  router.push("/redesign");
                }
              }}
            />
          </label>
        )}
        {mode === "import" && (
          <>
            <ImportZone onImported={onImported}>
              <span className="text-[15px] font-medium">Drop files or photos here, or <span className="text-accent underline">browse</span></span>
              <span className="max-w-[560px] text-[13px] text-ink-2">{dropHint}</span>
            </ImportZone>
            <input aria-label="Instructions (optional)" className="field mt-3 text-[14px]" placeholder="What is it for? (optional) e.g. Seed pitch for investors" value={prompt} maxLength={4000} onChange={(e) => setPrompt(e.target.value)} />
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

        {mode === "describe" && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Examples">
            {IDEAS.map((i) => (
              <button
                key={i.label}
                type="button"
                className="rounded-full border border-line bg-canvas px-3 py-1 text-[12px] text-ink-2 transition-colors hover:border-ink-2 hover:text-ink"
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
        <div className="-mx-5 mt-4 flex flex-wrap items-center gap-2 border-t border-line px-5 pt-3.5">
          {mode !== "redesign" && (
            <Select label="Type" value={type} onChange={(v) => setType(v as DeckType)}>
              {DECK_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </Select>
          )}
          <Select label="Slides" value={slides} onChange={setSlides}>
            {SLIDE_COUNTS.map((n) => <option key={n} value={String(n)}>{n === "auto" ? "Auto" : n}</option>)}
          </Select>
          <Select label="Look" value={look} onChange={setLook}>
            {kits.length > 0 && (
              <optgroup label="Your brand kits">
                {kits.map((k) => <option key={k.id} value={`kit:${k.id}`}>{k.kit.name}</option>)}
              </optgroup>
            )}
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

      </div>
      <Suspense fallback={null}>
        <ModeFromUrl onMode={setMode} />
      </Suspense>
      <LibraryPicker open={picker} onClose={() => setPicker(false)} onPick={(a) => onImported([], a)} title="Photos for this deck" />
    </section>
  );
}


// ---------------------------------------------------------------------------

function Status({ deck, compact = false }: { deck: DeckSummary; compact?: boolean }) {
  const n = deck.suggestedCount ?? 0;
  if (n > 0)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] px-2 py-0.5 text-[11.5px] font-medium text-warning">
        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
        {compact ? `${n} to check` : `${n} suggested item${n > 1 ? "s" : ""} to check`}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--success)_12%,transparent)] px-2 py-0.5 text-[11.5px] font-medium text-success">
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      Ready
    </span>
  );
}

function Thumb({ deck, play, className = "" }: { deck: DeckSummary; play?: boolean; className?: string }) {
  if (!deck.firstSlide) return <div className={`skeleton aspect-video ${className}`} />;
  return (
    <div className={`overflow-hidden ${className}`}>
      <SlideView slide={deck.firstSlide} theme={withBrand(getTheme(deck.themeId), deck.brand)} intensity={deck.motionIntensity} mode={play ? "play" : "static"} step={9} playKey={play ? "on" : "off"} label={`First slide of ${deck.title}`} />
    </div>
  );
}

function SectionHead({ id, title, count, href, link }: { id: string; title: string; count?: string; href?: string; link?: string }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <h2 id={id} className="text-[16px] font-semibold tracking-[-0.01em]">
        {title}
        {count && <span className="tabular ml-2 text-[13px] font-normal text-ink-2">{count}</span>}
      </h2>
      {href && (
        <Link href={href} className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-ink">
          {link}
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

/** The deck you were last working on, large, with its next actions. */
function ContinueCard({ deck }: { deck: DeckSummary }) {
  const [hover, setHover] = useState(false);
  return (
    <article className="group grid overflow-hidden rounded-[18px] border border-line bg-surface md:grid-cols-[1.25fr_1fr]" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <Link href={`/d/${deck.id}`} aria-label={`Open ${deck.title}`} className="block bg-[color-mix(in_srgb,var(--ink)_4%,var(--canvas))] p-5">
        <Thumb deck={deck} play={hover} className="rounded-[10px] shadow-[0_1px_2px_rgba(16,17,20,.08),0_12px_28px_-14px_rgba(16,17,20,.3)] transition-transform duration-300 group-hover:-translate-y-0.5" />
      </Link>
      <div className="flex min-w-0 flex-col gap-3 p-6">
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-2">
          <span className="font-semibold uppercase tracking-[0.07em]">Continue editing</span>
          <Status deck={deck} />
        </div>
        <h3 className="text-[22px] font-semibold leading-[1.2] tracking-[-0.02em]">{deck.title}</h3>
        <dl className="grid grid-cols-3 gap-3 border-y border-line py-3 text-[12px]">
          <div><dt className="text-ink-2">Slides</dt><dd className="tabular mt-0.5 text-[15px] font-semibold">{deck.slideCount}</dd></div>
          <div><dt className="text-ink-2">Edited</dt><dd className="mt-0.5 text-[15px] font-semibold">{relTime(deck.updatedAt)}</dd></div>
          <div className="min-w-0"><dt className="text-ink-2">Look</dt><dd className="mt-0.5 truncate text-[15px] font-semibold">{deck.brand?.name ?? getTheme(deck.themeId).name}</dd></div>
        </dl>
        <p className="text-[13px] leading-[20px] text-ink-2">
          {(deck.suggestedCount ?? 0) > 0
            ? "Some numbers or claims aren't in your notes yet. Open the editor and check each one marked Suggested before you present."
            : "Every slide is checked. Present it here, download an editable PowerPoint, or share a link and see who opens it."}
        </p>
        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          <Link href={`/d/${deck.id}`} className="btn btn-primary btn-sm gap-1.5"><PenLine size={14} aria-hidden="true" />Open editor</Link>
          <Link href={`/d/${deck.id}/present`} className="btn btn-secondary btn-sm gap-1.5"><Play size={13} aria-hidden="true" />Present</Link>
          <Link href={`/d/${deck.id}?export=1`} className="btn btn-secondary btn-sm gap-1.5" aria-label="Download"><Download size={14} aria-hidden="true" /><span className="hidden sm:inline">Download</span></Link>
          <Link href={`/d/${deck.id}?share=1`} className="btn btn-secondary btn-sm gap-1.5" aria-label="Share"><Share2 size={14} aria-hidden="true" /><span className="hidden sm:inline">Share</span></Link>
        </div>
      </div>
    </article>
  );
}

function DeckCard({ deck }: { deck: DeckSummary }) {
  const [hover, setHover] = useState(false);
  return (
    <li className="group relative" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <Link href={`/d/${deck.id}`} className="block rounded-[14px] outline-offset-4" aria-label={`Open ${deck.title}`}>
        <Thumb deck={deck} play={hover} className="rounded-[12px] border border-line shadow-[0_1px_2px_rgba(16,17,20,.05)] transition-shadow duration-200 group-hover:shadow-[0_12px_28px_-12px_rgba(16,17,20,.28)]" />
        <span className="mt-2.5 flex items-start justify-between gap-2 px-0.5">
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-semibold">{deck.title}</span>
            <span className="tabular block text-[12px] text-ink-2">{deck.slideCount} slides · {relTime(deck.updatedAt)}</span>
          </span>
          {(deck.suggestedCount ?? 0) > 0 && <Status deck={deck} compact />}
        </span>
      </Link>
      <Link href={`/d/${deck.id}/present`} className="absolute right-2.5 top-2.5 inline-flex h-8 items-center gap-1.5 rounded-full bg-[rgba(16,17,20,.78)] px-3 text-[12px] font-medium text-white opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100" aria-label={`Present ${deck.title}`}>
        <Play size={12} fill="currentColor" aria-hidden="true" />
        Present
      </Link>
    </li>
  );
}

function RecentDecks({ decks }: { decks: DeckSummary[] }) {
  const [first, ...rest] = decks;
  return (
    <section aria-labelledby="cont-h" className="space-y-8">
      <div>
        <SectionHead id="cont-h" title="Pick up where you left off" href="/decks" link={`All decks (${decks.length})`} />
        <ContinueCard deck={first} />
      </div>
      {rest.length > 0 && (
        <div>
          <SectionHead id="recent-h" title="Recent decks" />
          <ul className="grid grid-cols-2 gap-x-5 gap-y-6 lg:grid-cols-4" aria-labelledby="recent-h">
            {rest.slice(0, 8).map((d) => <DeckCard key={d.id} deck={d} />)}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Two shortcuts to the other ways in. Shown under the deck list. */
function Shortcuts() {
  const items = [
    { href: "/dashboard?mode=redesign", icon: RefreshCw, t: "Redesign an old deck", d: "Upload a .pptx. Compare each slide with its redesign and keep the one you like." },
    { href: "/brand", icon: Palette, t: "Set up your brand kit", d: "Logo, colours and heading font, applied to new decks and PowerPoint downloads." },
    { href: "/assets", icon: Images, t: "Add your own photos", d: "Upload team, product or event photos once and place them on any slide." },
  ];
  return (
    <ul className="grid gap-3 md:grid-cols-3" aria-label="Shortcuts">
      {items.map(({ href, icon: Icon, t, d }) => (
        <li key={t}>
          <Link href={href} className="group flex h-full gap-3.5 rounded-[14px] border border-line bg-surface p-4 transition-colors hover:border-ink-2">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] text-ink" aria-hidden="true"><Icon size={17} strokeWidth={1.75} /></span>
            <span className="min-w-0">
              <span className="flex items-center gap-1 text-[14px] font-semibold">{t}<ArrowRight size={14} className="text-ink-2 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></span>
              <span className="mt-0.5 block text-[12.5px] leading-[18px] text-ink-2">{d}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Latest visits on the user's share links (docs/09 §4.3). Hidden until something was shared. */
function Activity() {
  const backend = useBackend();
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  useEffect(() => {
    if (backend.mode !== "cloud") return;
    let cancelled = false;
    backend
      .listShares()
      .then((l) => !cancelled && setLinks(l))
      .catch(() => !cancelled && setLinks([]));
    return () => {
      cancelled = true;
    };
  }, [backend]);
  if (!links?.length) return null;
  const visits = links
    .flatMap((l) => (l.recent ?? []).map((r) => ({ ...r, l })))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 5);
  return (
    <section aria-labelledby="act-h">
      <SectionHead id="act-h" title="Activity on your shared decks" href="/shared" link="All analytics" />
      {visits.length === 0 ? (
        <p className="rounded-[14px] border border-dashed border-line px-5 py-6 text-[14px] text-ink-2">Nobody has opened your links yet. When they do, you&rsquo;ll see it here.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-surface">
          {visits.map((v, i) => {
            const per = v.l.perSlideMs ?? [];
            const top = per.length ? per.indexOf(Math.max(...per)) : -1;
            const pct = v.l.slideCount ? Math.round((v.slidesSeen / v.l.slideCount) * 100) : 0;
            return (
              <li key={i} className="flex items-center gap-4 px-4 py-3 text-[14px]">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-accent" aria-hidden="true"><Eye size={15} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    <b className="font-semibold">{v.email ?? (v.l.name ? `Someone from ${v.l.name}` : "Someone")}</b> opened <b className="font-semibold">{v.l.deckTitle}</b>
                  </span>
                  <span className="tabular block text-[12px] text-ink-2">
                    {v.slidesSeen} of {v.l.slideCount} slides · {fmtDuration(v.totalMs)}
                    {top >= 0 && per[top] > 0 ? ` · most time on slide ${top + 1}` : ""}
                  </span>
                </span>
                <span className="hidden w-24 sm:block" aria-hidden="true">
                  <span className="block h-1.5 overflow-hidden rounded-full bg-line"><span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} /></span>
                </span>
                <span className="w-16 flex-none text-right text-[12px] text-ink-2">{relTimeShare(v.at)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function FirstVisit({ onSample, busy }: { onSample: () => void; busy: boolean }) {
  const sample = useMemo(() => templateDeck("ledgerly-seed")!, []);
  const [hover, setHover] = useState(false);
  const steps = [
    { done: true, t: "Create your account", d: "Your decks are private until you share or download them." },
    { done: false, t: "Make your first deck", d: "Describe it above or drop a PDF, Word or PowerPoint file." },
    { done: false, t: "Download or present it", d: "Editable PowerPoint with animations, a PDF, or the browser." },
  ];
  return (
    <section className="grid gap-5 lg:grid-cols-[1fr_1.2fr]" aria-labelledby="start-h">
      <div className="rounded-[18px] border border-line bg-surface p-6">
        <div className="flex items-baseline justify-between">
          <h2 id="start-h" className="text-[16px] font-semibold tracking-[-0.01em]">Getting started</h2>
          <span className="tabular text-[12px] text-ink-2">1 of 3 done</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true"><div className="h-full w-1/3 rounded-full bg-success" /></div>
        <ol className="mt-5 space-y-4">
          {steps.map((s, i) => (
            <li key={s.t} className="flex gap-3">
              <span className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-[12px] font-semibold ${s.done ? "bg-success text-white" : "border border-line text-ink-2"}`} aria-hidden="true">{s.done ? <Check size={13} strokeWidth={3} /> : i + 1}</span>
              <span>
                <span className={`block text-[14px] font-semibold ${s.done ? "text-ink-2 line-through decoration-[1.5px]" : ""}`}>{s.t}<span className="sr-only">{s.done ? " (done)" : ""}</span></span>
                <span className="mt-0.5 block text-[12.5px] leading-[18px] text-ink-2">{s.d}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
      <div className="group overflow-hidden rounded-[18px] border border-line bg-surface" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        <div className="bg-[color-mix(in_srgb,var(--ink)_4%,var(--canvas))] p-5">
          <div className="overflow-hidden rounded-[10px] shadow-[0_1px_2px_rgba(16,17,20,.08),0_12px_28px_-14px_rgba(16,17,20,.3)]">
            <SlideView slide={sample.slides[4]} theme={deckTheme(sample)} intensity="standard" mode={hover ? "play" : "static"} step={9} playKey={hover ? "on" : "off"} label="Slide from the sample deck" />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold">Try the sample deck</h3>
            <p className="mt-0.5 text-[13px] text-ink-2">A {sample.slides.length}-slide pitch for a fictional company. Hover to watch it build.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={onSample} disabled={busy}>{busy ? "Opening" : "Open the sample"}</button>
            <Link href="/templates" className="btn btn-secondary btn-sm">Templates</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function TemplateRow({ onUse, busy }: { onUse: (id: string) => void; busy: string | null }) {
  const [cat, setCat] = useState<TemplateCategory | "all">("all");
  const [hover, setHover] = useState<string | null>(null);
  const list = useMemo(() => TEMPLATES.filter((t) => cat === "all" || t.category === cat).slice(0, 4), [cat]);
  return (
    <section aria-labelledby="tpl-h">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="tpl-h" className="text-[16px] font-semibold tracking-[-0.01em]">Start from a template</h2>
        <div className="flex items-center gap-3">
          <div role="tablist" aria-label="Template type" className="flex gap-0.5 overflow-x-auto rounded-[10px] bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] p-0.5">
            {(["all", ...CATEGORIES] as const).map((c) => (
              <button key={c} type="button" role="tab" aria-selected={cat === c} onClick={() => setCat(c)} className={`h-7 flex-none whitespace-nowrap rounded-[8px] px-2.5 text-[12px] font-medium transition-colors ${cat === c ? "bg-surface text-ink shadow-[0_1px_2px_rgba(16,17,20,.1)]" : "text-ink-2 hover:text-ink"}`}>
                {c === "all" ? "All" : CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
          <Link href="/templates" className="hidden items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-ink sm:inline-flex">All {TEMPLATES.length}<ArrowRight size={14} aria-hidden="true" /></Link>
        </div>
      </div>
      <ul className="grid grid-cols-2 gap-x-5 gap-y-6 lg:grid-cols-4">
        {list.map((t) => {
          const deck = templateDeck(t.id)!;
          const show = deck.slides[t.highlights?.[0] ?? 0] ?? deck.slides[0];
          const on = hover === t.id;
          return (
            <li key={t.id} className="group" onMouseEnter={() => setHover(t.id)} onMouseLeave={() => setHover(null)}>
              <div className="relative overflow-hidden rounded-[12px] border border-line shadow-[0_1px_2px_rgba(16,17,20,.05)] transition-shadow group-hover:shadow-[0_12px_28px_-12px_rgba(16,17,20,.28)]">
                <Link href={`/t/${t.id}`} className="block" aria-label={`Preview ${t.name}`}>
                  <SlideView slide={show} theme={withBrand(getTheme(t.themeId), t.brand)} intensity={t.intensity} mode={on ? "play" : "static"} step={9} playKey={on ? "on" : "off"} />
                </Link>
                <div className="absolute inset-x-2 bottom-2 flex gap-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <Link href={`/new?look=${t.id}`} className="btn btn-sm min-h-8 flex-1 bg-surface px-2 text-[12px] text-ink shadow-[0_2px_8px_rgba(0,0,0,.18)]">Use design</Link>
                  <button type="button" className="btn btn-primary btn-sm min-h-8 flex-1 px-2 text-[12px] shadow-[0_2px_8px_rgba(0,0,0,.18)]" disabled={!!busy} onClick={() => onUse(t.id)}>
                    {busy === t.id ? "Copying" : "Copy deck"}
                  </button>
                </div>
              </div>
              <p className="mt-2.5 truncate px-0.5 text-[14px] font-semibold">{t.name}</p>
              <p className="truncate px-0.5 text-[12px] text-ink-2">{CATEGORY_LABEL[t.category]} · {deck.slides.length} slides</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warning" }) {
  return (
    <div className="min-w-[88px] px-4 first:pl-0">
      <dt className="text-[12px] text-ink-2">{label}</dt>
      <dd className={`tabular text-[20px] font-semibold tracking-[-0.02em] ${tone === "warning" ? "text-warning" : ""}`}>{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------

const noSubscribe = () => () => {};
function clientClock() {
  const now = new Date();
  const h = now.getHours();
  return `${h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"}|${now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}`;
}

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

  async function create(deck: Deck, key: string, fail: string) {
    setBusy(key);
    setError(null);
    try {
      const saved = await backend.createDeck(deck);
      router.push(`/d/${saved.id}`);
    } catch (e) {
      setError({ text: e instanceof ApiError ? e.message : fail, upgrade: e instanceof ApiError && e.status === 402 });
      setBusy(null);
    }
  }
  const copyTemplate = (id: string) => create(forkDeck(templateDeck(id)!), id, "Could not copy the template.");
  const blank = () =>
    create(
      { id: newId("dk"), version: 0, title: "Untitled deck", themeId: "mono", aspect: "16:9", motionIntensity: "standard", language: "en", slides: [NEW_SLIDES[0].make(), NEW_SLIDES[1].make()] },
      "blank",
      "Could not create the deck.",
    );

  // Time-of-day text is client-only so server and client HTML match.
  const clock = useSyncExternalStore(noSubscribe, clientClock, () => "");
  const [greeting, today] = clock ? clock.split("|") : ["Welcome back", " "];
  const firstVisit = decks !== null && decks.length === 0;
  const toCheck = (decks ?? []).filter((d) => (d.suggestedCount ?? 0) > 0).length;
  const slidesTotal = (decks ?? []).reduce((n, d) => n + d.slideCount, 0);
  const atLimit = me?.plan === "free" && me.deckCount >= 3;

  const subline =
    decks === null
      ? " "
      : firstVisit
        ? "Make your first deck in about two minutes. Start with a sentence, your notes, or a file."
        : toCheck
          ? `${toCheck} deck${toCheck === 1 ? " has" : "s have"} suggested items to check. Last edit ${relTime(decks[0].updatedAt)}.`
          : `Everything is ready to present. Last edit ${relTime(decks[0].updatedAt)}.`;

  return (
    <main className="mx-auto flex max-w-[1180px] flex-col gap-12 px-4 pb-16 pt-8 sm:px-10">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-2">{today}</p>
            <h1 className="mt-1 text-[30px] font-semibold leading-[1.15] tracking-[-0.025em]">{greeting}</h1>
            <p className="mt-1.5 min-h-[21px] text-[14px] text-ink-2">{subline}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {decks && decks.length > 0 && (
              <dl className="mr-3 hidden divide-x divide-line md:flex" aria-label="Your workspace">
                <Stat label="Decks" value={String(decks.length)} />
                <Stat label="Slides" value={slidesTotal.toLocaleString()} />
                {toCheck > 0 && <Stat label="To check" value={String(toCheck)} tone="warning" />}
                {assets && assets.length > 0 && <Stat label="Photos" value={String(assets.length)} />}
              </dl>
            )}
            <button type="button" className="btn btn-secondary btn-sm gap-1.5" onClick={blank} disabled={!!busy}>
              <FilePlus2 size={15} aria-hidden="true" />
              {busy === "blank" ? "Creating" : "Blank deck"}
            </button>
          </div>
        </div>

        {me && !me.features.gemini && (
          <p className="flex items-center gap-2 text-[12px] text-ink-2">
            <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden="true" />
            AI is in offline mode: outlines use your own text only.
          </p>
        )}
        {error && (error.upgrade ? <UpgradeNote message={error.text} /> : <ErrorNote onRetry={() => setReload((r) => r + 1)}>{error.text}</ErrorNote>)}
        {atLimit && <UpgradeNote message="You've used 3 of 3 decks on the Free plan. Your decks stay editable; upgrade to create more." />}

        <CreateBox />
      </div>

      {decks === null && !error ? (
        <div className="grid gap-5 md:grid-cols-[1.25fr_1fr]" aria-busy="true">
          <div className="skeleton aspect-video rounded-[18px]" />
          <div className="flex flex-col gap-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-[64px]" />)}</div>
        </div>
      ) : firstVisit ? (
        <FirstVisit onSample={() => copyTemplate("ledgerly-seed")} busy={busy === "ledgerly-seed"} />
      ) : decks && decks.length > 0 ? (
        <>
          <RecentDecks decks={decks} />
          <Activity />
        </>
      ) : null}

      <TemplateRow onUse={copyTemplate} busy={busy} />

      {assets && assets.length > 0 && (
        <section aria-labelledby="photos-h">
          <SectionHead id="photos-h" title="Your photos" count={`${assets.length} · ${formatBytes(assets.reduce((n, a) => n + a.bytes, 0))}`} href="/assets" link="Manage photos" />
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6 lg:grid-cols-8">
            {assets.slice(0, 8).map((a) => (
              <li key={a.id}><AssetThumb id={a.id} alt={a.alt} className="aspect-[4/3] w-full rounded-[10px]" /></li>
            ))}
          </ul>
        </section>
      )}

      {decks && decks.length > 0 && <Shortcuts />}
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
