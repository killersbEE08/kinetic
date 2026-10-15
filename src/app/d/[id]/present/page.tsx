"use client";

import { Suspense, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RequireUser } from "@/components/auth/RequireUser";
import { SlideFrame, SlideStage } from "@/components/deck/SlideView";
import { ErrorNote } from "@/components/ui/chrome";
import { ApiError, useBackend } from "@/lib/client/backend";
import type { Deck } from "@/lib/deck/schema";
import { deckTheme, getTheme } from "@/lib/deck/themes";
import { stepCount } from "@/lib/deck/motion";
import { canMorph, changeSlide } from "@/lib/client/morph";

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Present mode (docs/02 §4.6): ← → / space / PageUp/PageDown / clicker, N notes, B blackout, ? help, Esc exit.
function Presenter({ id }: { id: string }) {
  const backend = useBackend();
  const router = useRouter();
  const params = useSearchParams();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(() => Math.max(0, Number(params.get("slide") ?? 1) - 1));
  const [step, setStep] = useState(0);
  const [notes, setNotes] = useState(false);
  const [black, setBlack] = useState(false);
  const [help, setHelp] = useState(false);
  const [started] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!backend.ready || !backend.signedIn) return;
    backend.getDeck(id).then(setDeck).catch((e) => setError(e instanceof ApiError ? e.message : "Could not open this deck."));
  }, [backend, id]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const total = deck?.slides.length ?? 0;
  const slide = deck?.slides[Math.min(index, total - 1)];
  const steps = slide && deck ? stepCount(slide, deck.motionIntensity) : 1;

  const next = useCallback(() => {
    if (!deck) return;
    if (step < steps - 1) setStep((s) => s + 1);
    else if (index < total - 1) {
      changeSlide(deck.slides[index + 1].transition, () => {
        setIndex(index + 1);
        setStep(0);
      });
    }
  }, [deck, step, steps, index, total]);

  const prev = useCallback(() => {
    if (step > 0) setStep((s) => s - 1);
    else if (index > 0 && deck) {
      changeSlide(deck.slides[index].transition, () => {
        setIndex(index - 1);
        setStep(0);
      });
    }
  }, [step, index, deck]);

  const exit = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    router.push(`/d/${id}`);
  }, [router, id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
        case "PageDown":
        case " ":
        case "Enter":
          e.preventDefault();
          if (black) setBlack(false);
          else next();
          break;
        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp":
        case "Backspace":
          e.preventDefault();
          prev();
          break;
        case "Home":
          setIndex(0);
          setStep(0);
          break;
        case "End":
          setIndex(total - 1);
          setStep(0);
          break;
        case "n":
        case "N":
          setNotes((v) => !v);
          break;
        case "b":
        case "B":
        case ".":
          setBlack((v) => !v);
          break;
        case "f":
        case "F":
          if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
          else rootRef.current?.requestFullscreen().catch(() => {});
          break;
        case "?":
          setHelp((v) => !v);
          break;
        case "Escape":
          if (help) setHelp(false);
          else if (!document.fullscreenElement) exit();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, exit, black, help, total]);

  const theme = useMemo(() => (deck ? deckTheme(deck) : getTheme("mono")), [deck]);

  if (error) {
    return (
      <main className="mx-auto max-w-[560px] px-6 py-24">
        <ErrorNote>{error}</ErrorNote>
      </main>
    );
  }
  if (!deck || !slide) return <div className="h-dvh bg-black" aria-busy="true" />;

  const nextSlide = deck.slides[index + 1];

  return (
    <div ref={rootRef} className="fixed inset-0 flex select-none bg-black text-white">
      <div
        className="relative flex flex-1 items-center justify-center"
        onClick={(e) => {
          // Tap zones: left third goes back, the rest goes forward.
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          if (e.clientX - r.left < r.width / 3) prev();
          else next();
        }}
      >
        <div className="w-full" style={{ maxWidth: "calc(100dvh * 16 / 9)" }}>
          <div key={slide.id} className={slide.transition === "morph" && canMorph() ? "" : `k-tr-${slide.transition === "cut" ? "none" : slide.transition}`}>
            <SlideFrame label={`Slide ${index + 1} of ${total}`}>
              {(scale) => <SlideStage slide={slide} theme={theme} intensity={deck.motionIntensity} mode="play" step={step} playKey={slide.id} scale={scale} page={index + 1} morphNames />}
            </SlideFrame>
          </div>
        </div>
        {black && <div className="absolute inset-0 bg-black" aria-label="Screen blacked out" />}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-[3px] bg-white/10">
          <div className="h-full bg-white/60 transition-[width]" style={{ width: `${((index + (steps > 1 ? step / steps : 1)) / total) * 100}%` }} />
        </div>
      </div>

      {notes && (
        <aside className="flex w-[360px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-white/10 bg-[#111] p-5" aria-label="Presenter notes">
          <div className="flex items-baseline justify-between text-[13px] text-white/70">
            <span className="tabular">
              Slide {index + 1} / {total}
              {steps > 1 && ` · build ${step + 1}/${steps}`}
            </span>
            <span className="tabular text-[20px] text-white">{fmt(now - started)}</span>
          </div>
          <div>
            <h2 className="mb-2 text-[12px] font-medium uppercase tracking-[0.06em] text-white/60">Notes</h2>
            <p className="whitespace-pre-wrap text-[17px] leading-[26px]">{slide.notes || "No notes for this slide."}</p>
          </div>
          {nextSlide && (
            <div>
              <h2 className="mb-2 text-[12px] font-medium uppercase tracking-[0.06em] text-white/60">Next</h2>
              <div className="overflow-hidden rounded-[6px]">
                <SlideFrame>{(scale) => <SlideStage slide={nextSlide} theme={theme} intensity={deck.motionIntensity} mode="static" scale={scale} />}</SlideFrame>
              </div>
            </div>
          )}
        </aside>
      )}

      {help && (
        <div role="dialog" aria-label="Keyboard shortcuts" className="absolute left-1/2 top-1/2 w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-[14px] bg-[#1f1f22] p-6 text-[14px] shadow-2xl">
          <h2 className="mb-3 text-[15px] font-semibold">Shortcuts</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-white/80">
            <dt>→ Space</dt><dd>Next build or slide</dd>
            <dt>←</dt><dd>Back</dd>
            <dt>N</dt><dd>Notes, timer, next slide</dd>
            <dt>B</dt><dd>Black screen</dd>
            <dt>F</dt><dd>Full screen</dd>
            <dt>Esc</dt><dd>Back to the editor</dd>
          </dl>
        </div>
      )}

      <p className="pointer-events-none absolute left-4 top-3 text-[12px] text-white/40">Press ? for shortcuts</p>
    </div>
  );
}

export default function PresentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequireUser>
      <Suspense fallback={<div className="h-dvh bg-black" />}>
        <Presenter id={id} />
      </Suspense>
    </RequireUser>
  );
}
