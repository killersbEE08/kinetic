"use client";

import "@/components/marketing/marketing.css";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SlideView } from "@/components/deck/SlideView";
import { AnnouncementBar, Nav } from "./Nav";
import { DeckThumb } from "./Common";
import { ApiError, useBackend } from "@/lib/client/backend";
import { CATEGORY_LABEL, TEMPLATES, forkDeck, getTemplate, templateDeck } from "@/lib/deck/templates";
import { deckTheme } from "@/lib/deck/themes";
import { stepCount } from "@/lib/deck/motion";
import { changeSlide } from "@/lib/client/morph";

export function TemplateViewer({ id }: { id: string }) {
  const backend = useBackend();
  const router = useRouter();
  const t = getTemplate(id)!;
  const deck = templateDeck(id)!;
  const theme = deckTheme(deck);
  const [i, setI] = useState(0);
  const [step, setStep] = useState(0);
  const [key, setKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; upgrade: boolean } | null>(null);
  const slide = deck.slides[i];
  const steps = stepCount(slide, deck.motionIntensity);

  const goTo = (n: number) => {
    const target = Math.max(0, Math.min(deck.slides.length - 1, n));
    // Moving forward uses the next slide's transition; moving back uses the current one's.
    const tr = target > i ? deck.slides[target].transition : deck.slides[i].transition;
    changeSlide(Math.abs(target - i) === 1 ? tr : "fade", () => {
      setI(target);
      setStep(0);
      setKey((k) => k + 1);
    });
  };

  const next = () => {
    if (step < steps - 1) setStep((s) => s + 1);
    else if (i < deck.slides.length - 1) goTo(i + 1);
  };

  const prev = () => {
    if (step > 0) setStep((s) => s - 1);
    else if (i > 0) goTo(i - 1);
  };

  // Keep the latest handlers in a ref so the key listener is attached once.
  const handlers = useRef({ next, prev });
  useEffect(() => {
    handlers.current = { next, prev };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { next, prev } = handlers.current;
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(e.key)) {
        e.preventDefault();
        next();
      } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function use() {
    setError(null);
    if (backend.mode === "cloud" && !backend.signedIn) {
      router.push(`/sign-up?redirect_url=${encodeURIComponent(`/t/${id}`)}`);
      return;
    }
    setBusy(true);
    try {
      const saved = await backend.createDeck(forkDeck(deck));
      router.push(`/d/${saved.id}`);
    } catch (e) {
      setError({ text: e instanceof ApiError ? e.message : "Could not copy this deck. Try again.", upgrade: e instanceof ApiError && e.status === 402 });
      setBusy(false);
    }
  }

  const related = TEMPLATES.filter((x) => x.category === t.category && x.id !== t.id).slice(0, 3);

  return (
    <div className="m-root">
      <AnnouncementBar />
      <Nav />
      <main id="main" className="m-frame py-10">
        <nav aria-label="Breadcrumb" className="text-[13px] text-[var(--m-gray)]">
          <Link href="/templates" className="hover:text-[var(--m-ink)]">Templates</Link>
          <span aria-hidden="true"> / </span>
          <Link href={`/templates?type=${t.category}`} className="hover:text-[var(--m-ink)]">{CATEGORY_LABEL[t.category]}</Link>
        </nav>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-[640px]">
            <h1 className="text-[clamp(30px,4vw,44px)] font-normal leading-[1.1] tracking-[-0.03em]">{t.name}</h1>
            <p className="m-lead mt-3">{t.summary}</p>
            <p className="mt-2 text-[13px] text-[var(--m-gray)]">
              {deck.slides.length} slides · {theme.name} theme · {deck.motionIntensity} motion · fictional company and numbers
            </p>
          </div>
          <div className="flex gap-2">
            <Link href={`/new?look=${t.id}`} className="m-pill m-pill-light">Use this design with my content</Link>
            <button type="button" onClick={use} disabled={busy} className="m-pill m-pill-dark disabled:opacity-60">
              {busy ? "Copying" : "Use this deck"}
            </button>
          </div>
        </div>
        {error && (
          <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[var(--m-line)] bg-[var(--m-soft)] px-4 py-3 text-[14px]">
            {error.text}
            {error.upgrade && <Link href="/pricing" className="m-pill m-pill-dark m-pill-sm">See plans</Link>}
          </div>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_220px]">
          <div>
            <div className="overflow-hidden rounded-[14px] border border-[var(--m-line)] shadow-[0_24px_60px_-30px_rgba(16,17,20,0.35)]" onClick={next}>
              <SlideView slide={slide} theme={theme} intensity={deck.motionIntensity} mode="play" step={step} playKey={`${slide.id}-${key}`} page={i + 1} morphNames label={`Slide ${i + 1} of ${deck.slides.length}`} />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button type="button" className="m-pill m-pill-light m-pill-sm" onClick={prev} disabled={i === 0 && step === 0}>Back</button>
                <button type="button" className="m-pill m-pill-dark m-pill-sm" onClick={next} disabled={i === deck.slides.length - 1 && step >= steps - 1}>Next</button>
                <button type="button" className="m-pill m-pill-light m-pill-sm" onClick={() => setKey((k) => k + 1)}>Replay</button>
              </div>
              <p className="tabular text-[13px] text-[var(--m-gray)]" aria-live="polite">
                Slide {i + 1} of {deck.slides.length}
                {steps > 1 && ` · build ${step + 1} of ${steps}`} · use the arrow keys
              </p>
            </div>
            <section className="mt-6 rounded-[12px] border border-[var(--m-line)] bg-[var(--m-soft)] px-5 py-4" aria-label="Speaker notes">
              <h2 className="m-eyebrow">Speaker notes</h2>
              <p className="mt-2 text-[15px] leading-[1.6]">{slide.notes || "No notes on this slide."}</p>
            </section>
          </div>
          <nav aria-label="Slides" className="max-h-[70vh] overflow-y-auto pr-1">
            <ol className="grid grid-cols-3 gap-2 lg:grid-cols-1">
              {deck.slides.map((s, k) => (
                <li key={s.id}>
                  <button type="button" onClick={() => goTo(k)} aria-current={k === i} aria-label={`Slide ${k + 1}`} className={`block w-full overflow-hidden rounded-[8px] border-2 ${k === i ? "border-[var(--m-blue)]" : "border-transparent hover:border-[var(--m-line)]"}`}>
                    <SlideView slide={s} theme={theme} intensity={deck.motionIntensity} mode="static" />
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        </div>

        {related.length > 0 && (
          <section className="mt-20 border-t border-[var(--m-line)] pt-12" aria-labelledby="related-h">
            <h2 id="related-h" className="text-[24px] font-normal tracking-[-0.02em]">More {CATEGORY_LABEL[t.category].toLowerCase()} decks</h2>
            <ul className="mt-6 grid gap-5 md:grid-cols-3">
              {related.map((r) => (
                <li key={r.id}>
                  <Link href={`/t/${r.id}`} className="m-card block overflow-hidden">
                    <DeckThumb templateId={r.id} auto className="border-b border-[var(--m-line)]" />
                    <p className="p-4 text-[15px] font-medium">{r.name}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
