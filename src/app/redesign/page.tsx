"use client";

// Redesign a PowerPoint deck: the original slides (rendered faithfully in the browser) next to
// the redesigned ones, one row per slide. Keep the new design or the original for each slide.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RequireUser } from "@/components/auth/RequireUser";
import { AppShell } from "@/components/app/AppShell";
import { SlideView } from "@/components/deck/SlideView";
import { ErrorNote, UpgradeNote } from "@/components/ui/chrome";
import { ApiError, useBackend, type BrandKit } from "@/lib/client/backend";
import { CreditCost, useMe } from "@/lib/client/me";
import { ImportError, readPptxSlides, type PptxSlideContent } from "@/lib/client/import";
import { niceName } from "@/lib/client/assets";
import { generateCost } from "@/lib/billing/credits";
import { FREE_SLOT, type Deck, type Element, type Outline, type Slide } from "@/lib/deck/schema";
import { ASSET_PREFIX } from "@/lib/deck/media";
import { addPhotoToSlide } from "@/lib/deck/place";
import { composeSlide } from "@/lib/deck/compose";
import { newId } from "@/lib/deck/ids";
import { THEMES, deckTheme, getTheme, withBrand } from "@/lib/deck/themes";
import { takePendingRedesign } from "@/lib/client/redesign";

const PROMPT = "Redesign this existing deck slide by slide. Keep every fact, number, name and quote exactly. Tighten wording, give each slide one clear point, and pick the layout that fits its content.";

/** Off-screen holder for rendered original slides until their row mounts. */
function parkingLot(): HTMLElement {
  let el = document.getElementById("k-pptx-park");
  if (!el) {
    el = document.createElement("div");
    el.id = "k-pptx-park";
    el.setAttribute("aria-hidden", "true");
    el.style.cssText = "position:fixed;left:-20000px;top:0;width:960px;pointer-events:none";
    document.body.appendChild(el);
  }
  return el;
}

type Phase = "pick" | "reading" | "ready" | "working" | "review" | "saving";

/** Renders one original PowerPoint slide with pptx-renderer, scaled to the cell width. */
function Original({ host, label }: { host: HTMLElement | null; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el || !host) return;
    el.replaceChildren();
    const inner = document.createElement("div");
    inner.style.transformOrigin = "0 0";
    inner.appendChild(host);
    el.appendChild(inner);
    const fit = () => {
      const w = host.offsetWidth || 960;
      const s = el.clientWidth / w;
      inner.style.transform = `scale(${s})`;
      el.style.height = `${(host.offsetHeight || 540) * s}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => {
      ro.disconnect();
      parkingLot().appendChild(host); // keep it attached while React re-mounts the row
    };
  }, [host]);
  return <div ref={box} role="img" aria-label={label} className="relative w-full overflow-hidden bg-white" />;
}

function RedesignInner() {
  const backend = useBackend();
  const router = useRouter();
  const { me } = useMe();
  const [phase, setPhase] = useState<Phase>("pick");
  const [file, setFile] = useState<File | null>(null);
  const [content, setContent] = useState<PptxSlideContent[]>([]);
  const [originals, setOriginals] = useState<(HTMLElement | null)[]>([]);
  const [themeId, setThemeId] = useState("mono");
  const [kits, setKits] = useState<BrandKit[]>([]);
  const [kitId, setKitId] = useState<string | null>(null);
  const [keepPhotos, setKeepPhotos] = useState(true);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [streamed, setStreamed] = useState<(Slide | undefined)[]>([]);
  const [useNew, setUseNew] = useState<boolean[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<{ text: string; upgrade: boolean } | null>(null);
  const handles = useRef<{ dispose(): void }[]>([]);

  useEffect(() => {
    backend
      .listBrandKits()
      .then((k) => {
        setKits(k);
        setKitId(k.find((x) => x.isDefault)?.id ?? null);
      })
      .catch(() => undefined);
  }, [backend]);
  useEffect(() => {
    const list = handles.current;
    return () => list.forEach((h) => h.dispose());
  }, []);

  const load = useCallback(async (f: File) => {
    setError(null);
    if (!/\.pptx$/i.test(f.name)) return setError({ text: "Choose a PowerPoint file (.pptx). Older .ppt files: open them in PowerPoint and save as .pptx first.", upgrade: false });
    setFile(f);
    setPhase("reading");
    setStatus("Reading your slides");
    try {
      const slides = await readPptxSlides(f);
      setContent(slides);
      setStatus("Drawing the original slides");
      // Faithful preview of the original deck (Apache-2.0 renderer, runs in the browser).
      try {
        const lib = await import("@aiden0z/pptx-renderer");
        const files = await lib.parseZip(await f.arrayBuffer(), lib.RECOMMENDED_ZIP_LIMITS);
        const pres = lib.buildPresentation(files);
        // Rendered slides must sit in the document straight away; the renderer empties detached ones.
        const park = parkingLot();
        const made = pres.slides.slice(0, slides.length).map((s) => {
          try {
            const h = lib.renderSlide(pres, s, { onNodeError: (node, err) => console.warn("[redesign] node", node, err) });
            park.appendChild(h.element);
            handles.current.push(h);
            return h;
          } catch {
            return null;
          }
        });
        await Promise.all(made.map((h) => h?.ready.catch(() => undefined)));
        setOriginals(made.map((h) => h?.element ?? null));
      } catch (e) {
        console.warn("[redesign] preview failed", e);
        setOriginals([]);
      }
      setPhase("ready");
    } catch (e) {
      setError({ text: e instanceof ImportError ? e.message : "That file couldn't be read. If it has a password, remove it and try again.", upgrade: false });
      setPhase("pick");
    } finally {
      setStatus(null);
    }
  }, []);

  // Arriving from the dashboard's "Redesign a deck" box with a file already chosen.
  useEffect(() => {
    const f = takePendingRedesign();
    if (f) void load(f); // eslint-disable-line react-hooks/set-state-in-effect -- one-time hand-off
  }, [load]);

  async function redesign() {
    setError(null);
    setPhase("working");
    const n = content.length;
    setStreamed(new Array(n).fill(undefined));
    try {
      const outline: Outline = {
        title: (content[0]?.title || niceName(file?.name ?? "Deck")).slice(0, 200),
        slides: content.map((s, i) => ({
          title: (s.title || `Slide ${i + 1}`).slice(0, 160),
          points: s.lines.slice(0, 8).map((text) => ({ text: text.slice(0, 300) })),
          layoutHint: i === 0 ? "title" : undefined,
        })),
      };
      const notes = content.map((s) => [s.title, ...s.lines].join("\n")).join("\n\n");
      setStatus("Writing the new slides");
      const kit = kits.find((k) => k.id === kitId);
      const { deck: made } = await backend.generate(
        { input: { prompt: PROMPT, notes: notes.slice(0, 400_000), deckType: "custom", slideCount: Math.min(20, Math.max(3, n)), audience: "", language: "English" }, outline, themeId, intensity: "standard" },
        (i, slide) => setStreamed((s) => {
          const next = [...s];
          next[i] = slide;
          return next;
        }),
      );
      let slides = made.slides.slice(0, n);
      // Speaker notes from the original, and the original's photos.
      slides = slides.map((s, i) => ({ ...s, notes: [content[i]?.notes, s.notes].filter(Boolean).join("\n\n").slice(0, 5000) }));
      if (keepPhotos) {
        for (let i = 0; i < slides.length; i++) {
          const img = content[i]?.images[0];
          if (!img) continue;
          setStatus(`Saving photos (slide ${i + 1} of ${slides.length})`);
          const asset = await backend.uploadAsset(img.blob, { name: `${niceName(file?.name ?? "Slide")} ${i + 1}` }).catch(() => null);
          if (!asset) continue;
          const next = addPhotoToSlide(slides[i], { src: ASSET_PREFIX + asset.id, alt: asset.alt });
          if (next) slides[i] = next;
        }
      }
      setDeck({ ...made, slides, ...(kit ? { brand: kit.kit } : {}) });
      setUseNew(slides.map(() => true));
      setPhase("review");
    } catch (e) {
      setError({ text: e instanceof ApiError ? e.message : "The redesign stopped. Try again.", upgrade: e instanceof ApiError && e.status === 402 });
      setPhase("ready");
    } finally {
      setStatus(null);
    }
  }

  async function create() {
    if (!deck) return;
    setPhase("saving");
    setError(null);
    try {
      const slides: Slide[] = [];
      for (let i = 0; i < deck.slides.length; i++) {
        if (useNew[i] || !originals[i]) {
          slides.push(deck.slides[i]);
          continue;
        }
        // Keep the original: a picture of it on a blank slide, with its notes.
        setStatus(`Keeping original slide ${i + 1}`);
        const { toPng } = await import("html-to-image");
        const host = originals[i]!;
        const url = await toPng(host, { pixelRatio: 1920 / (host.offsetWidth || 960), cacheBust: false });
        const blob = await (await fetch(url)).blob();
        const asset = await backend.uploadAsset(blob, { name: `Original slide ${i + 1}`, alt: `Original slide ${i + 1}: ${content[i]?.title ?? ""}`.slice(0, 250) });
        const img: Element = { id: newId("el"), slot: FREE_SLOT, type: "image", src: ASSET_PREFIX + asset.id, alt: asset.alt, focal: [0.5, 0.5], source: [], aiSuggested: false, frame: { x: 0, y: 0, w: 1920, h: 1080 }, style: { fit: "contain" } };
        const blank = composeSlide({ layout: "blank", slots: [] });
        slides.push({ ...blank, elements: [img], notes: deck.slides[i].notes });
      }
      const saved = await backend.createDeck({ ...deck, slides });
      router.push(`/d/${saved.id}`);
    } catch (e) {
      setError({ text: e instanceof ApiError ? e.message : "Could not save the deck.", upgrade: e instanceof ApiError && e.status === 402 });
      setPhase("review");
    } finally {
      setStatus(null);
    }
  }

  const theme = deck ? deckTheme(deck) : withBrand(getTheme(themeId), kits.find((k) => k.id === kitId)?.kit);
  const n = content.length;

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-8 sm:px-10">
      <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Redesign a deck</h1>
      <p className="mt-1 max-w-[720px] text-[14px] text-ink-2">Upload a PowerPoint file. Kinetic keeps every fact, number and photo, rewrites each slide around one clear point, and puts it in your look. Compare each slide with the original and keep whichever you prefer.</p>
      <div className="mt-5 space-y-3">{error && (error.upgrade ? <UpgradeNote message={error.text} /> : <ErrorNote>{error.text}</ErrorNote>)}</div>

      {phase === "pick" && (
        <label
          className="mt-6 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-[14px] border-2 border-dashed border-line bg-surface px-6 py-14 text-center hover:border-ink-2"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) void load(f);
          }}
        >
          <span className="text-[16px] font-medium">Drop your .pptx here, or <span className="text-accent underline">browse</span></span>
          <span className="text-[13px] text-ink-2">Up to 60 slides and 50 MB. The file is read in your browser.</span>
          <input type="file" accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" className="sr-only" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
        </label>
      )}

      {status && <p className="mt-6 text-[14px] text-ink-2" role="status" aria-live="polite">{status}</p>}

      {(phase === "ready" || phase === "working") && n > 0 && (
        <section className="mt-6 rounded-[14px] border border-line bg-surface p-5" aria-label="Redesign options">
          <p className="text-[15px] font-medium">{file?.name} · {n} slide{n === 1 ? "" : "s"} · {content.reduce((a, s) => a + s.images.length, 0)} photos</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <label className="text-[13px] font-medium">
              Theme
              <select className="field mt-1" value={themeId} onChange={(e) => setThemeId(e.target.value)} disabled={phase === "working"}>
                {THEMES.map((t) => <option key={t.id} value={t.id}>{t.name}: {t.description}</option>)}
              </select>
            </label>
            <label className="text-[13px] font-medium">
              Brand kit
              <select className="field mt-1" value={kitId ?? ""} onChange={(e) => setKitId(e.target.value || null)} disabled={phase === "working"}>
                <option value="">None (theme colours)</option>
                {kits.map((k) => <option key={k.id} value={k.id}>{k.kit.name}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 self-end pb-2.5 text-[13px]">
              <input type="checkbox" className="h-4 w-4" checked={keepPhotos} onChange={(e) => setKeepPhotos(e.target.checked)} disabled={phase === "working"} />
              Keep the original photos
            </label>
          </div>
          {n > 20 && <p className="mt-3 text-[12px] text-warning">Only the first 20 slides are redesigned in one go.</p>}
          <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
            {me && <CreditCost credits={generateCost(Math.min(20, n))} />}
            <button type="button" className="btn btn-secondary" onClick={() => { setPhase("pick"); setContent([]); setOriginals([]); }} disabled={phase === "working"}>Choose another file</button>
            <button type="button" className="btn btn-primary" onClick={redesign} disabled={phase === "working"}>{phase === "working" ? "Redesigning" : `Redesign ${Math.min(20, n)} slides`}</button>
          </div>
        </section>
      )}

      {phase !== "pick" && n > 0 && (
        <section className="mt-8" aria-label="Slides">
          <div className="mb-3 grid grid-cols-[1fr_1fr] gap-4 text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-2 sm:grid-cols-[1fr_1fr_160px]">
            <span>Original</span>
            <span>New design</span>
            <span className="hidden sm:block">Keep</span>
          </div>
          <ol className="space-y-4">
            {content.slice(0, deck ? deck.slides.length : Math.min(20, n)).map((s, i) => {
              const fresh = deck?.slides[i] ?? streamed[i];
              return (
                <li key={i} className="grid grid-cols-[1fr_1fr] items-start gap-4 sm:grid-cols-[1fr_1fr_160px]">
                  <div className={`overflow-hidden rounded-[8px] border ${deck && !useNew[i] ? "border-accent ring-2 ring-accent/30" : "border-line"}`}>
                    {originals[i] ? (
                      <Original host={originals[i]} label={`Original slide ${i + 1}`} />
                    ) : (
                      <div className="flex aspect-video flex-col gap-1 bg-surface p-4 text-[12px]">
                        <b className="text-[14px]">{s.title || `Slide ${i + 1}`}</b>
                        {s.lines.slice(0, 5).map((l, k) => <span key={k} className="truncate text-ink-2">{l}</span>)}
                      </div>
                    )}
                  </div>
                  <div className={`overflow-hidden rounded-[8px] border ${deck && useNew[i] ? "border-accent ring-2 ring-accent/30" : "border-line"}`}>
                    {fresh ? (
                      <div className="k-tr-fade">
                        <SlideView slide={fresh} theme={theme} intensity="standard" mode="static" page={i + 1} label={`New slide ${i + 1}`} />
                      </div>
                    ) : (
                      <div className="flex aspect-video items-center justify-center bg-surface text-[12px] text-ink-2">{phase === "working" ? "Writing" : "Not redesigned yet"}</div>
                    )}
                  </div>
                  <div className="col-span-2 flex gap-2 sm:col-span-1 sm:flex-col" role="radiogroup" aria-label={`Slide ${i + 1}`}>
                    <span className="tabular hidden text-[13px] font-medium sm:block">Slide {i + 1}</span>
                    {deck && (
                      <>
                        <label className="flex items-center gap-2 text-[13px]">
                          <input type="radio" name={`keep-${i}`} checked={useNew[i]} onChange={() => setUseNew((u) => u.map((v, k) => (k === i ? true : v)))} />
                          New design
                        </label>
                        <label className={`flex items-center gap-2 text-[13px] ${originals[i] ? "" : "opacity-50"}`}>
                          <input type="radio" name={`keep-${i}`} checked={!useNew[i]} disabled={!originals[i]} onChange={() => setUseNew((u) => u.map((v, k) => (k === i ? false : v)))} />
                          Original
                        </label>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {(phase === "review" || phase === "saving") && deck && (
        <div className="sticky bottom-4 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-line bg-surface p-4 shadow-[0_8px_24px_-12px_rgba(0,0,0,.2)]">
          <p className="text-[14px]">
            <b>{useNew.filter(Boolean).length}</b> new, <b>{useNew.filter((v) => !v).length}</b> original. Everything stays editable afterwards.
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setUseNew(useNew.map(() => true))}>All new</button>
            <button type="button" className="btn btn-primary" onClick={create} disabled={phase === "saving"}>{phase === "saving" ? "Saving" : "Create deck"}</button>
          </div>
        </div>
      )}

      {phase === "pick" && (
        <p className="mt-6 text-[13px] text-ink-2">
          Prefer to start from notes instead? <Link href="/new" className="text-accent hover:underline">Write a new deck</Link>.
        </p>
      )}
    </main>
  );
}

export default function RedesignPage() {
  return (
    <RequireUser>
      <AppShell>
        <RedesignInner />
      </AppShell>
    </RequireUser>
  );
}
