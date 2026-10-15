"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader, ErrorNote, Segmented, UpgradeNote } from "@/components/ui/chrome";
import { RequireUser } from "@/components/auth/RequireUser";
import { SlideView } from "@/components/deck/SlideView";
import { ApiError, useBackend } from "@/lib/client/backend";
import { DECK_TYPES, type DeckType, type GenerationInput, type Intensity, type Outline, type Slide } from "@/lib/deck/schema";
import { THEMES, getTheme } from "@/lib/deck/themes";
import { LAYOUTS } from "@/lib/deck/layouts";
import { outlineSlideToSlotted } from "@/lib/ai/offline";
import { composeSlide } from "@/lib/deck/compose";
import { SAMPLE_NOTES, SAMPLE_PROMPT } from "@/lib/deck/sample";
import { useIsClient } from "@/lib/client/hooks";
import Link from "next/link";
import { TEMPLATES, getTemplate } from "@/lib/deck/templates";
import { readDraft, DRAFT_KEY, type DraftDoc, type DraftPhoto } from "@/lib/client/draft";
import { AssetThumb, ImportZone, kindLabel, LibraryPicker } from "@/components/app/assets-ui";
import type { AssetMeta } from "@/lib/client/assets";
import { ASSET_PREFIX } from "@/lib/deck/media";
import { placePhotos } from "@/lib/deck/place";
import { withBrand } from "@/lib/deck/themes";

const MAX_NOTES = 400_000;
const toPhoto = (a: AssetMeta): DraftPhoto => ({ id: a.id, name: a.name, src: ASSET_PREFIX + a.id, alt: a.alt || a.name });

/** The user's notes plus the text of every imported file, within the 400k character limit. */
function combinedNotes(notes: string, docs: DraftDoc[]): string {
  return [notes.trim(), ...docs.map((d) => d.text.trim())].filter(Boolean).join("\n\n").slice(0, MAX_NOTES);
}

type Step = "input" | "outline" | "style" | "generating";
const STEPS: { id: Step; label: string }[] = [
  { id: "input", label: "Input" },
  { id: "outline", label: "Outline" },
  { id: "style", label: "Style" },
  { id: "generating", label: "Generate" },
];
const TYPE_LABEL: Record<DeckType, string> = { pitch: "Pitch", sales: "Sales", launch: "Product launch", lesson: "Lesson", report: "Report", custom: "Custom" };


function Stepper({ step }: { step: Step }) {
  const at = STEPS.findIndex((s) => s.id === step);
  return (
    <ol className="flex items-center gap-2 text-[13px]" aria-label="Progress">
      {STEPS.map((s, i) => (
        <li key={s.id} className="flex items-center gap-2" aria-current={i === at ? "step" : undefined}>
          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold tabular ${i <= at ? "bg-ink text-canvas" : "border border-line text-ink-2"}`}>{i + 1}</span>
          <span className={i === at ? "font-medium text-ink" : "text-ink-2"}>{s.label}</span>
          {i < STEPS.length - 1 && <span aria-hidden="true" className="mx-1 h-px w-6 bg-line" />}
        </li>
      ))}
    </ol>
  );
}

function errMsg(e: unknown, fallback: string): { text: string; upgrade: boolean } {
  if (e instanceof ApiError) return { text: e.message, upgrade: e.status === 402 };
  if (e instanceof DOMException && e.name === "AbortError") return { text: "Stopped.", upgrade: false };
  return { text: fallback, upgrade: false };
}

function NewDeckInner() {
  const backend = useBackend();
  const router = useRouter();
  // Restore the draft so a refresh or Back doesn't lose the user's notes (docs/02 §3.2).
  // This component only renders on the client (see NewDeckPage), so sessionStorage is available.
  const [draft] = useState(readDraft);
  const [step, setStep] = useState<Step>(draft.outline ? "outline" : "input");
  const [input, setInput] = useState<GenerationInput>(draft.input ?? { prompt: "", notes: "", deckType: "pitch", slideCount: "auto", audience: "", language: "English" });
  const [outline, setOutline] = useState<Outline | null>((draft.outline as Outline | null | undefined) ?? null);
  const [engine, setEngine] = useState<string>("");
  const [themeId, setThemeId] = useState(draft.themeId ?? "mono");
  const [intensity, setIntensity] = useState<Intensity>(draft.intensity ?? "standard");
  const [docs, setDocs] = useState<DraftDoc[]>(draft.docs ?? []);
  const [photos, setPhotos] = useState<DraftPhoto[]>(draft.photos ?? []);
  // ?look=<template id> (from the dashboard or a template page) reuses that template's design.
  const [look, setLook] = useState<string | null>(() => {
    const q = new URLSearchParams(window.location.search).get("look");
    return q && getTemplate(q) ? q : draft.look && getTemplate(draft.look) ? draft.look : null;
  });
  const [brandName, setBrandName] = useState(draft.brandName ?? "");
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; upgrade: boolean } | null>(null);
  const [streamed, setStreamed] = useState<(Slide | undefined)[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ input, outline, themeId, intensity, docs, photos, look, brandName }));
    } catch {}
  }, [input, outline, themeId, intensity, docs, photos, look, brandName]);

  const lookTemplate = look ? getTemplate(look) : undefined;
  const effectiveTheme = lookTemplate ? withBrand(getTheme(lookTemplate.themeId), { ...lookTemplate.brand, name: (brandName.trim() || outline?.title || lookTemplate.brand.name).slice(0, 40) }) : getTheme(themeId);
  const fullInput = useMemo<GenerationInput>(() => ({ ...input, notes: combinedNotes(input.notes, docs) }), [input, docs]);
  const words = useMemo(() => (fullInput.notes.trim() ? fullInput.notes.trim().split(/\s+/).length : 0), [fullInput.notes]);

  const onImported = (d: DraftDoc[], p: AssetMeta[]) => {
    setDocs((x) => [...x, ...d.filter((n) => !x.some((o) => o.id === n.id))]);
    setPhotos((x) => [...x, ...p.map(toPhoto).filter((n) => !x.some((o) => o.id === n.id))].slice(0, 24));
  };

  async function makeOutline() {
    setError(null);
    if (!fullInput.prompt.trim() && !fullInput.notes.trim()) {
      setError({ text: "Describe what you're presenting, paste your notes, or add a file first.", upgrade: false });
      return;
    }
    setBusy(true);
    try {
      const r = await backend.outline(fullInput);
      setOutline(r.outline);
      setEngine(r.engine);
      setStep("outline");
    } catch (e) {
      setError(errMsg(e, "Could not write the outline. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    if (!outline) return;
    setError(null);
    setStep("generating");
    setStreamed(new Array(outline.slides.length).fill(undefined));
    const ac = new AbortController();
    abortRef.current = ac;
    const t = lookTemplate;
    try {
      const { deck } = await backend.generate({ input: fullInput, outline, themeId: t ? t.themeId : themeId, intensity }, (i, slide) => setStreamed((s) => {
        const next = [...s];
        next[i] = slide;
        return next;
      }), ac.signal);
      let final = t ? { ...deck, brand: { ...t.brand, name: (brandName.trim() || outline.title).slice(0, 40) || "Brand" } } : deck;
      final = placePhotos(final, photos).deck;
      const saved = await backend.createDeck(final);
      sessionStorage.removeItem(DRAFT_KEY);
      router.push(`/d/${saved.id}`);
    } catch (e) {
      setError(errMsg(e, "Generation stopped. Your outline is saved; try again."));
      setStep("style");
    } finally {
      abortRef.current = null;
    }
  }

  // ---- Outline editing helpers ----
  const updateSlide = (i: number, patch: Partial<Outline["slides"][number]>) =>
    setOutline((o) => (o ? { ...o, slides: o.slides.map((s, k) => (k === i ? { ...s, ...patch } : s)) } : o));
  const move = (i: number, d: -1 | 1) =>
    setOutline((o) => {
      if (!o) return o;
      const j = i + d;
      if (j < 0 || j >= o.slides.length) return o;
      const slides = [...o.slides];
      [slides[i], slides[j]] = [slides[j], slides[i]];
      return { ...o, slides };
    });
  const removeSlide = (i: number) => setOutline((o) => (o && o.slides.length > 1 ? { ...o, slides: o.slides.filter((_, k) => k !== i) } : o));
  const mergeDown = (i: number) =>
    setOutline((o) => {
      if (!o || i >= o.slides.length - 1) return o;
      const slides = [...o.slides];
      slides[i] = { ...slides[i], points: [...slides[i].points, ...slides[i + 1].points].slice(0, 8) };
      slides.splice(i + 1, 1);
      return { ...o, slides };
    });
  const addSlide = (i: number) =>
    setOutline((o) => (o ? { ...o, slides: [...o.slides.slice(0, i + 1), { title: "New slide", points: [{ text: "" }] }, ...o.slides.slice(i + 1)] } : o));

  // Style previews use the user's own outline (docs/02 §3.2: "rendered with the user's own content").
  const previewSlide = useMemo(() => {
    if (!outline) return null;
    const pick = outline.slides.find((s, i) => i > 0 && s.points.some((p) => /\d/.test(p.text))) ?? outline.slides[0];
    const idx = outline.slides.indexOf(pick);
    return composeSlide(outlineSlideToSlotted(pick, idx, outline.slides.length));
  }, [outline]);

  return (
    <main className="mx-auto max-w-[1080px] px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em]">New deck</h1>
        <Stepper step={step} />
      </div>

      {error && <div className="mt-6">{error.upgrade ? <UpgradeNote message={error.text} /> : <ErrorNote>{error.text}</ErrorNote>}</div>}

      {step === "input" && (
        <section className="panel-in mt-8 rounded-[14px] border border-line bg-surface p-6 md:p-8" aria-labelledby="input-h">
          <h2 id="input-h" className="text-[22px] font-semibold tracking-[-0.01em]">What are you presenting?</h2>
          <label className="mt-5 block">
            <span className="sr-only">Describe the deck</span>
            <textarea
              className="field min-h-[88px] resize-y"
              placeholder="Seed pitch for our bookkeeping app for small shops. Use the numbers in my notes."
              value={input.prompt}
              maxLength={4000}
              onChange={(e) => setInput({ ...input, prompt: e.target.value })}
            />
          </label>
          <label className="mt-5 block">
            <span className="mb-2 flex items-baseline justify-between text-[14px] font-medium">
              Your notes <span className="tabular text-[13px] font-normal text-ink-2">{words.toLocaleString()} words</span>
            </span>
            <textarea
              className="field min-h-[220px] resize-y font-[450]"
              placeholder="Paste a memo, an outline, meeting notes, or data. Leave a blank line between topics. Kinetic only uses facts from here."
              value={input.notes}
              maxLength={400_000}
              onChange={(e) => setInput({ ...input, notes: e.target.value })}
            />
          </label>
          <div className="mt-5">
            <span className="mb-2 block text-[14px] font-medium">Files and photos</span>
            <ImportZone onImported={onImported} compact />
            {docs.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2" aria-label="Imported files">
                {docs.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 rounded-[8px] border border-line py-1 pl-3 pr-1 text-[13px]" title={d.note}>
                    <span className="font-medium">{d.name}</span>
                    <span className="text-ink-2">{kindLabel(d.kind)} · {d.words.toLocaleString()} words</span>
                    <button type="button" className="btn btn-ghost btn-sm min-h-7 px-2" aria-label={`Remove ${d.name}`} onClick={() => setDocs((x) => x.filter((o) => o.id !== d.id))}>×</button>
                  </li>
                ))}
              </ul>
            )}
            {docs.some((d) => d.note) && <p className="mt-2 text-[12px] text-ink-2">{docs.filter((d) => d.note).map((d) => `${d.name}: ${d.note}`).join(" ")}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {photos.map((p) => (
                <span key={p.id} className="group relative">
                  <AssetThumb id={p.id} alt={p.alt} className="h-14 w-20 rounded-[6px]" />
                  <button type="button" className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-surface text-[13px] opacity-0 focus:opacity-100 group-hover:opacity-100" aria-label={`Don't use ${p.name}`} onClick={() => setPhotos((x) => x.filter((o) => o.id !== p.id))}>×</button>
                </span>
              ))}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicker(true)}>{photos.length ? "Add more photos" : "Add photos from your library"}</button>
            </div>
            {photos.length > 0 && <p className="mt-1 text-[12px] text-ink-2">The first photo goes behind the title. The others go on slides with a photo layout, never two in a row.</p>}
            <LibraryPicker open={picker} onClose={() => setPicker(false)} onPick={(a) => onImported([], a)} title="Photos for this deck" />
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-[14px]">
              <span className="mb-1 block font-medium">Type</span>
              <select className="field" value={input.deckType} onChange={(e) => setInput({ ...input, deckType: e.target.value as DeckType })}>
                {DECK_TYPES.map((t) => (
                  <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                ))}
              </select>
            </label>
            <label className="text-[14px]">
              <span className="mb-1 block font-medium">Slides</span>
              <select className="field" value={String(input.slideCount)} onChange={(e) => setInput({ ...input, slideCount: e.target.value === "auto" ? "auto" : Number(e.target.value) })}>
                <option value="auto">Auto</option>
                {[5, 6, 8, 10, 12, 15, 20].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <label className="text-[14px]">
              <span className="mb-1 block font-medium">Audience</span>
              <input className="field" placeholder="Investors" value={input.audience} maxLength={80} onChange={(e) => setInput({ ...input, audience: e.target.value })} />
            </label>
            <label className="text-[14px]">
              <span className="mb-1 block font-medium">Language</span>
              <input className="field" value={input.language} maxLength={32} onChange={(e) => setInput({ ...input, language: e.target.value })} />
            </label>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
            <span className="flex flex-wrap items-center gap-4">
              <button type="button" className="text-[14px] font-medium text-accent hover:underline" onClick={() => setInput({ ...input, prompt: SAMPLE_PROMPT, notes: SAMPLE_NOTES, deckType: "pitch", audience: "Seed investors" })}>
                Fill in a sample memo
              </button>
              <Link href="/templates" className="text-[14px] font-medium text-accent hover:underline">
                Or start from one of {TEMPLATES.length} templates
              </Link>
            </span>
            <button type="button" className="btn btn-primary" onClick={makeOutline} disabled={busy}>
              {busy ? "Writing the outline" : "Continue"}
            </button>
          </div>
          {busy && <p className="mt-3 text-right text-[13px] text-ink-2" role="status">Reading your material ({words.toLocaleString()} words) and planning the slides.</p>}
        </section>
      )}

      {step === "outline" && outline && (
        <section className="panel-in mt-8" aria-labelledby="outline-h">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="outline-h" className="text-[22px] font-semibold tracking-[-0.01em]">Fix the story first</h2>
              <p className="mt-1 text-[14px] text-ink-2">
                Edit, reorder, merge or delete slides. Points starting with &ldquo;Suggested&rdquo; aren&rsquo;t in your notes; replace them with real facts.
                {engine === "offline" && " Written by the offline engine (no Gemini key)."}
              </p>
            </div>
            <label className="text-[14px]">
              <span className="mr-2 font-medium">Deck title</span>
              <input className="field w-72" value={outline.title} maxLength={200} onChange={(e) => setOutline({ ...outline, title: e.target.value })} />
            </label>
          </div>
          <ol className="mt-6 space-y-3">
            {outline.slides.map((s, i) => (
              <li key={i} className="rounded-[10px] border border-line bg-surface p-4">
                <div className="flex items-start gap-3">
                  <span className="tabular mt-2 w-6 shrink-0 text-[13px] text-ink-2">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <label className="sr-only" htmlFor={`t-${i}`}>Slide {i + 1} title</label>
                    <input id={`t-${i}`} className="field font-medium" value={s.title} maxLength={160} onChange={(e) => updateSlide(i, { title: e.target.value })} />
                    <label className="sr-only" htmlFor={`p-${i}`}>Slide {i + 1} points, one per line</label>
                    <textarea
                      id={`p-${i}`}
                      className="field mt-2 min-h-[72px] resize-y text-[14px]"
                      value={s.points.map((p) => p.text).join("\n")}
                      onChange={(e) => updateSlide(i, { points: e.target.value.split("\n").slice(0, 8).map((text, k) => ({ text: text.slice(0, 300), source: s.points[k]?.source })) })}
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-ink-2">
                      {[...new Set(s.points.map((p) => p.source).filter(Boolean))].map((src) => (
                        <span key={src} className="rounded-[6px] border border-line px-2 py-0.5" title="Paragraph of your notes this came from">notes {src}</span>
                      ))}
                      <label className="ml-auto flex items-center gap-2">
                        Layout
                        <select className="field h-8 w-auto py-0 text-[12px]" value={s.layoutHint ?? ""} onChange={(e) => updateSlide(i, { layoutHint: e.target.value || undefined })}>
                          <option value="">Auto</option>
                          {LAYOUTS.map((l) => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move slide ${i + 1} up`}>Up</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, 1)} disabled={i === outline.slides.length - 1} aria-label={`Move slide ${i + 1} down`}>Down</button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 pl-9">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => addSlide(i)}>Add slide below</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => mergeDown(i)} disabled={i === outline.slides.length - 1}>Merge with next</button>
                  <button type="button" className="btn btn-ghost btn-sm text-danger" onClick={() => removeSlide(i)} disabled={outline.slides.length <= 1}>Delete</button>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-8 flex justify-between">
            <button type="button" className="btn btn-secondary" onClick={() => setStep("input")}>Back</button>
            <button type="button" className="btn btn-primary" onClick={() => setStep("style")}>Choose a style</button>
          </div>
        </section>
      )}

      {step === "style" && outline && (
        <section className="panel-in mt-8" aria-labelledby="style-h">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="style-h" className="text-[22px] font-semibold tracking-[-0.01em]">Pick a style</h2>
              <p className="mt-1 text-[14px] text-ink-2">Previews use a slide from your outline.</p>
            </div>
            <Segmented label="Motion intensity" value={intensity} onChange={setIntensity} options={[{ value: "calm", label: "Calm" }, { value: "standard", label: "Standard" }, { value: "expressive", label: "Expressive" }]} />
          </div>
          <div role="radiogroup" aria-label="Theme" className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {THEMES.map((t) => {
              const on = !look && t.id === themeId;
              return (
                <button key={t.id} type="button" role="radio" aria-checked={on} onClick={() => { setThemeId(t.id); setLook(null); }} className={`overflow-hidden rounded-[10px] border-2 bg-surface text-left transition-colors ${on ? "border-accent" : "border-line hover:border-ink-2"}`}>
                  {previewSlide && <SlideView slide={previewSlide} theme={t} intensity={intensity} mode={on ? "play" : "static"} step={9} playKey={`${t.id}-${intensity}-${on}`} label={`${t.name} preview`} />}
                  <span className="block px-4 py-3">
                    <span className="block text-[15px] font-medium">{t.name}</span>
                    <span className="block text-[13px] text-ink-2">{t.description}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-10">
            <h3 className="text-[17px] font-semibold">Or use the design of a template</h3>
            <p className="mt-1 text-[14px] text-ink-2">Colours, heading font, pattern and motion come from the template. Your logo name replaces theirs; your content stays yours.</p>
            <div role="radiogroup" aria-label="Template design" className="mt-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {TEMPLATES.map((t) => {
                const on = look === t.id;
                const th = withBrand(getTheme(t.themeId), { ...t.brand, name: (brandName.trim() || outline.title).slice(0, 40) || t.brand.name });
                return (
                  <button key={t.id} type="button" role="radio" aria-checked={on} onClick={() => setLook(t.id)} className={`overflow-hidden rounded-[10px] border-2 bg-surface text-left transition-colors ${on ? "border-accent" : "border-line hover:border-ink-2"}`}>
                    {previewSlide && <SlideView slide={previewSlide} theme={th} intensity={intensity} mode={on ? "play" : "static"} step={9} playKey={`${t.id}-${intensity}-${on}`} label={`${t.name} design preview`} />}
                    <span className="block truncate px-3 py-2 text-[13px] font-medium">{t.brand.name} design <span className="font-normal text-ink-2">· {t.name}</span></span>
                  </button>
                );
              })}
            </div>
            {lookTemplate && (
              <label className="mt-5 flex max-w-md flex-col text-[14px]">
                <span className="mb-1 font-medium">Name in the logo and footer</span>
                <input className="field" value={brandName} maxLength={40} placeholder={outline.title.slice(0, 40)} onChange={(e) => setBrandName(e.target.value)} />
                <span className="mt-1 text-[12px] text-ink-2">Your company, team or product. Leave empty to use the deck title.</span>
              </label>
            )}
          </div>
          <div className="mt-8 flex justify-between">
            <button type="button" className="btn btn-secondary" onClick={() => setStep("outline")}>Back</button>
            <button type="button" className="btn btn-primary" onClick={generate}>Generate {outline.slides.length} slides{photos.length ? ` with ${photos.length} photo${photos.length > 1 ? "s" : ""}` : ""}</button>
          </div>
        </section>
      )}

      {step === "generating" && outline && (
        <section className="panel-in mt-8" aria-labelledby="gen-h">
          <div className="flex items-center justify-between gap-4">
            <h2 id="gen-h" className="text-[22px] font-semibold tracking-[-0.01em]">Building your deck</h2>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => abortRef.current?.abort()}>Stop</button>
          </div>
          <p className="mt-1 text-[14px] text-ink-2" role="status" aria-live="polite">
            {streamed.filter(Boolean).length} of {outline.slides.length} slides written
            {streamed.filter(Boolean).length === outline.slides.length ? ". Saving and opening the editor." : "."}
          </p>
          <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {outline.slides.map((s, i) => {
              const slide = streamed[i];
              return (
                <li key={i}>
                  <div className="overflow-hidden rounded-[10px] border border-line bg-surface">
                    {slide ? (
                      <div className="k-tr-fade">
                        <SlideView slide={slide} theme={effectiveTheme} intensity={intensity} mode="static" label={`Slide ${i + 1}`} />
                      </div>
                    ) : (
                      <div className="aspect-video p-4">
                        <div className="skeleton h-4 w-2/3" />
                        <div className="skeleton mt-3 h-3 w-1/2" />
                        <div className="skeleton mt-2 h-3 w-1/3" />
                      </div>
                    )}
                  </div>
                  <p className="mt-2 truncate text-[13px] text-ink-2">
                    <span className="tabular">{i + 1}.</span> {s.title}
                  </p>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </main>
  );
}

export default function NewDeckPage() {
  const isClient = useIsClient();
  return (
    <RequireUser>
      <AppHeader />
      {isClient ? <NewDeckInner /> : <div className="mx-auto max-w-[1080px] px-6 py-10" aria-busy="true"><div className="skeleton h-[420px]" /></div>}
    </RequireUser>
  );
}
