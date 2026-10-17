"use client";

import { Suspense, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, ExternalLink, Minus, MonitorPlay, Pause, Play, Plus, RotateCcw, X } from "lucide-react";
import { RequireUser } from "@/components/auth/RequireUser";
import { SlideFrame, SlideStage } from "@/components/deck/SlideView";
import { ErrorNote } from "@/components/ui/chrome";
import { ApiError, useBackend } from "@/lib/client/backend";
import type { Deck } from "@/lib/deck/schema";
import { deckTheme, getTheme } from "@/lib/deck/themes";
import { stepCount } from "@/lib/deck/motion";
import { presentable, presentIndex } from "@/lib/deck/slides";
import { canMorph, changeSlide } from "@/lib/client/morph";
import { track } from "@/lib/client/track";

function fmt(ms: number) {
  const neg = ms < 0;
  const s = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const out = h ? `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`;
  return neg ? `−${out}` : out;
}

type State = { index: number; step: number; black: boolean };
type Msg = { t: "state"; s: State } | { t: "hello" } | { t: "key"; key: "next" | "prev" };
const TARGETS = [0, 5, 10, 15, 20, 30, 45, 60];

/** Elapsed talk time with pause and reset. */
function useTimer() {
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const elapsed = (pausedAt ?? now) - startedAt;
  return {
    elapsed,
    now,
    paused: pausedAt !== null,
    toggle: () => {
      if (pausedAt === null) setPausedAt(Date.now());
      else {
        setStartedAt((s) => s + (Date.now() - pausedAt));
        setPausedAt(null);
      }
    },
    reset: () => {
      setStartedAt(Date.now());
      setPausedAt((p) => (p === null ? null : Date.now()));
    },
  };
}

function Slide({ deck, index, step, play, label }: { deck: Deck; index: number; step: number; play: boolean; label?: string }) {
  const s = deck.slides[index];
  const theme = useMemo(() => deckTheme(deck), [deck]);
  if (!s) return null;
  return (
    <SlideFrame label={label}>
      {(scale) => <SlideStage slide={s} theme={theme} intensity={deck.motionIntensity} mode={play ? "play" : "static"} step={step} playKey={play ? s.id : undefined} scale={scale} page={index + 1} />}
    </SlideFrame>
  );
}

// Present mode (docs/02 §4.6). Audience view: the slide full screen. Presenter view: current and next
// slide, notes, timer, and a slide strip. Opening an audience window from the presenter view keeps
// both in step on this computer (BroadcastChannel), so one screen can show notes and the other the slides.
function Presenter({ id }: { id: string }) {
  const backend = useBackend();
  const router = useRouter();
  const params = useSearchParams();
  const view = params.get("view") === "presenter" ? "presenter" : "audience";
  const [raw, setRaw] = useState<Deck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<State>({ index: 0, step: 0, black: false });
  const [notes, setNotes] = useState(false);
  const [help, setHelp] = useState(false);
  const [noteSize, setNoteSize] = useState(20);
  const [target, setTarget] = useState(0);
  const [linked, setLinked] = useState(false);
  const timer = useTimer();
  const rootRef = useRef<HTMLDivElement>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const stripRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (!backend.ready || !backend.signedIn) return;
    backend
      .getDeck(id)
      .then((d) => {
        setRaw(d);
        setState((s) => ({ ...s, index: presentIndex(d, Math.max(0, Number(params.get("slide") ?? 1) - 1)) }));
        // The audience window opened from presenter view is the same talk; count it once.
        if (!(view === "audience" && window.opener)) track("deck_presented", { deckId: d.id, props: { view, slides: d.slides.length } });
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not open this deck."));
    // Only on first load: later ?slide changes come from our own navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, id]);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading saved preferences after hydration
      setNoteSize(Number(localStorage.getItem("kinetic.present.noteSize")) || 20);
      setTarget(Number(localStorage.getItem("kinetic.present.target")) || 0);
    } catch {}
  }, []);

  const deck = useMemo(() => (raw ? presentable(raw) : null), [raw]);
  const total = deck?.slides.length ?? 0;
  const index = Math.min(state.index, Math.max(0, total - 1));
  const slide = deck?.slides[index];
  const steps = slide && deck ? stepCount(slide, deck.motionIntensity) : 1;
  const theme = useMemo(() => (deck ? deckTheme(deck) : getTheme("mono")), [deck]);

  // Apply a state, with the slide transition when the slide changes.
  const apply = useCallback(
    (next: State, broadcast: boolean) => {
      if (!deck) return;
      const go = () => setState(next);
      if (next.index !== state.index && view === "audience") {
        const tr = next.index > state.index ? deck.slides[next.index]?.transition : deck.slides[state.index]?.transition;
        changeSlide(tr ?? "fade", go);
      } else go();
      if (broadcast) channel.current?.postMessage({ t: "state", s: next } satisfies Msg);
    },
    [deck, state.index, view],
  );

  const next = useCallback(() => {
    if (!deck) return;
    if (state.step < steps - 1) apply({ ...state, step: state.step + 1 }, true);
    else if (index < total - 1) apply({ index: index + 1, step: 0, black: state.black }, true);
  }, [deck, state, steps, index, total, apply]);

  const prev = useCallback(() => {
    if (state.step > 0) apply({ ...state, step: state.step - 1 }, true);
    else if (index > 0) apply({ index: index - 1, step: 0, black: state.black }, true);
  }, [state, index, apply]);

  const jump = useCallback((i: number) => apply({ index: Math.max(0, Math.min(total - 1, i)), step: 0, black: state.black }, true), [apply, total, state.black]);
  const setBlack = useCallback((b: boolean) => apply({ ...state, index, black: b }, true), [apply, state, index]);

  // Keep presenter and audience windows in step.
  const latest = useRef({ state, next, prev });
  useEffect(() => {
    latest.current = { state: { ...state, index }, next, prev };
  });
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(`kinetic-present:${id}`);
    channel.current = ch;
    ch.onmessage = (e: MessageEvent<Msg>) => {
      const m = e.data;
      if (m.t === "hello") ch.postMessage({ t: "state", s: latest.current.state } satisfies Msg);
      else if (m.t === "state") {
        setLinked(true);
        apply(m.s, false);
      } else if (m.t === "key") (m.key === "next" ? latest.current.next : latest.current.prev)();
    };
    if (view === "audience") ch.postMessage({ t: "hello" } satisfies Msg);
    return () => {
      ch.close();
      channel.current = null;
    };
  }, [id, view, apply]);

  const exit = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (view === "audience" && window.opener) window.close();
    else router.push(`/d/${id}`);
  }, [router, id, view]);

  const openAudience = () => {
    const w = window.open(`/d/${id}/present?view=audience&slide=1`, `kinetic-audience-${id}`, "popup,width=1280,height=720");
    if (w) setLinked(true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
        case "PageDown":
        case " ":
        case "Enter":
          e.preventDefault();
          if (state.black) setBlack(false);
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
          jump(0);
          break;
        case "End":
          jump(total - 1);
          break;
        case "n":
        case "N":
          if (view === "audience") setNotes((v) => !v);
          break;
        case "b":
        case "B":
        case ".":
          setBlack(!state.black);
          break;
        case "p":
        case "P":
          timer.toggle();
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
  }, [next, prev, exit, jump, setBlack, state.black, help, total, view, timer]);

  useEffect(() => {
    stripRef.current?.querySelector(`[data-i="${index}"]`)?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [index]);

  if (error) {
    return (
      <main className="mx-auto max-w-[560px] px-6 py-24">
        <ErrorNote>{error}</ErrorNote>
      </main>
    );
  }
  if (!deck || !slide) return <div className="h-dvh bg-black" aria-busy="true" />;

  const nextSlide = deck.slides[index + 1];
  const shortcuts = (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-white/80">
      <dt>→ Space</dt><dd>Next build or slide</dd>
      <dt>←</dt><dd>Back</dd>
      {view === "audience" && (<><dt>N</dt><dd>Notes, timer, next slide</dd></>)}
      <dt>B</dt><dd>Black screen</dd>
      <dt>P</dt><dd>Pause or resume the timer</dd>
      <dt>F</dt><dd>Full screen</dd>
      <dt>Home End</dt><dd>First or last slide</dd>
      <dt>Esc</dt><dd>Back to the editor</dd>
    </dl>
  );
  const helpBox = help && (
    <div role="dialog" aria-label="Keyboard shortcuts" className="absolute left-1/2 top-1/2 z-50 w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-[14px] bg-[#1f1f22] p-6 text-[14px] shadow-2xl">
      <h2 className="mb-3 text-[15px] font-semibold">Shortcuts</h2>
      {shortcuts}
    </div>
  );

  // ----- Presenter view ------------------------------------------------------
  if (view === "presenter") {
    const remaining = target ? target * 60_000 - timer.elapsed : 0;
    const tone = !target ? "text-white" : remaining < 0 ? "text-[#ff6b5f]" : remaining < 120_000 ? "text-[#ffb547]" : "text-white";
    // Where you should be by now, if the time were spread evenly over the slides.
    const expected = target ? Math.min(total, Math.floor((timer.elapsed / (target * 60_000)) * total) + 1) : 0;
    const pace = !target ? null : index + 1 >= expected ? "On pace" : `${expected - (index + 1)} slide${expected - (index + 1) === 1 ? "" : "s"} behind`;
    const nextBuild = state.step < steps - 1;
    const sizeNotes = (d: number) =>
      setNoteSize((s) => {
        const v = Math.max(14, Math.min(40, s + d));
        try {
          localStorage.setItem("kinetic.present.noteSize", String(v));
        } catch {}
        return v;
      });
    const btn = "inline-flex h-9 items-center gap-1.5 rounded-[9px] px-3 text-[13px] font-medium text-white/85 hover:bg-white/10 hover:text-white";
    return (
      <div ref={rootRef} className="fixed inset-0 flex flex-col bg-[#0d0d0f] text-white">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 px-4">
          <MonitorPlay size={17} className="text-white/60" aria-hidden="true" />
          <h1 className="min-w-0 truncate text-[14px] font-semibold">{deck.title}</h1>
          <span className="tabular text-[13px] text-white/55">
            Slide {index + 1} of {total}
            {steps > 1 && ` · build ${state.step + 1}/${steps}`}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button type="button" className={btn} onClick={openAudience} title="Open the slides in a new window to drag onto the projector">
              <ExternalLink size={14} aria-hidden="true" />
              {linked ? "Audience window open" : "Open audience window"}
            </button>
            <button type="button" className={`${btn} ${state.black ? "bg-white/15 text-white" : ""}`} onClick={() => setBlack(!state.black)} aria-pressed={state.black}>
              {state.black ? "Show slides" : "Black screen"}
            </button>
            <button type="button" className={btn} onClick={exit} aria-label="End the presentation">
              <X size={15} aria-hidden="true" />
              End
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)] gap-5 p-5">
          {/* Current slide */}
          <section className="flex min-h-0 flex-col gap-3" aria-label="Current slide">
            <div className="relative overflow-hidden rounded-[10px] ring-1 ring-white/10">
              <Slide deck={deck} index={index} step={state.step} play label={`Current: slide ${index + 1}`} />
              {state.black && <div className="absolute inset-0 flex items-center justify-center bg-black/85 text-[14px] text-white/70">The audience sees a black screen</div>}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className={btn} onClick={prev} disabled={index === 0 && state.step === 0} aria-label="Back">
                <ChevronLeft size={16} aria-hidden="true" />
                Back
              </button>
              <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-[9px] bg-white px-4 text-[13px] font-semibold text-black hover:bg-white/90 disabled:opacity-40" onClick={next} disabled={index === total - 1 && !nextBuild}>
                {nextBuild ? "Next build" : "Next slide"}
                <ChevronRight size={16} aria-hidden="true" />
              </button>
              {steps > 1 && (
                <span className="ml-2 flex items-center gap-1" aria-label={`Build ${state.step + 1} of ${steps}`}>
                  {Array.from({ length: steps }).map((_, k) => <span key={k} className={`h-1.5 rounded-full ${k <= state.step ? "w-4 bg-white" : "w-1.5 bg-white/25"}`} />)}
                </span>
              )}
            </div>
          </section>

          {/* Timer, next, notes */}
          <aside className="flex min-h-0 flex-col gap-4" aria-label="Presenter tools">
            <div className="rounded-[12px] bg-white/[0.06] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/50">{target ? (remaining < 0 ? "Over time" : "Time left") : "Elapsed"}</p>
                  <p className={`tabular text-[40px] font-semibold leading-none tracking-[-0.02em] ${tone}`} aria-live="off">{fmt(target ? remaining : timer.elapsed)}</p>
                  <p className="tabular mt-1.5 text-[12px] text-white/55">
                    {target ? `${fmt(timer.elapsed)} of ${target} min` : "No time limit"}
                    {pace ? ` · ${pace}` : ""}
                    {timer.paused ? " · paused" : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/50">Clock</p>
                  <p className="tabular text-[18px] font-medium">{new Date(timer.now).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1.5">
                <button type="button" className={btn} onClick={timer.toggle}>
                  {timer.paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
                  {timer.paused ? "Resume" : "Pause"}
                </button>
                <button type="button" className={btn} onClick={timer.reset}>
                  <RotateCcw size={14} aria-hidden="true" />
                  Reset
                </button>
                <label className="ml-auto flex items-center gap-2 text-[12px] text-white/60">
                  Talk length
                  <select
                    className="h-8 rounded-[8px] border border-white/15 bg-[#1a1a1d] px-2 text-[13px] text-white"
                    value={target}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setTarget(v);
                      try {
                        localStorage.setItem("kinetic.present.target", String(v));
                      } catch {}
                    }}
                  >
                    {TARGETS.map((m) => <option key={m} value={m}>{m ? `${m} min` : "Off"}</option>)}
                  </select>
                </label>
              </div>
            </div>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/50">{nextBuild ? `Next: build ${state.step + 2} of ${steps}` : nextSlide ? `Next: slide ${index + 2}` : "End of the deck"}</p>
              <div className="overflow-hidden rounded-[8px] ring-1 ring-white/10">
                {nextBuild ? <Slide deck={deck} index={index} step={state.step + 1} play={false} /> : nextSlide ? <Slide deck={deck} index={index + 1} step={0} play={false} /> : <div className="flex aspect-video items-center justify-center bg-white/[0.04] text-[13px] text-white/50">No more slides</div>}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col rounded-[12px] bg-white/[0.06]">
              <div className="flex items-center justify-between px-4 pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/50">Notes</p>
                <span className="flex items-center gap-0.5">
                  <button type="button" className="flex h-7 w-7 items-center justify-center rounded-[6px] text-white/70 hover:bg-white/10" onClick={() => sizeNotes(-2)} aria-label="Smaller notes text"><Minus size={14} aria-hidden="true" /></button>
                  <button type="button" className="flex h-7 w-7 items-center justify-center rounded-[6px] text-white/70 hover:bg-white/10" onClick={() => sizeNotes(2)} aria-label="Larger notes text"><Plus size={14} aria-hidden="true" /></button>
                </span>
              </div>
              <p className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap px-4 pb-4 pt-2" style={{ fontSize: noteSize, lineHeight: 1.5 }}>
                {slide.notes || <span className="text-white/40">No notes for this slide.</span>}
              </p>
            </div>
          </aside>
        </div>

        <ol ref={stripRef} className="flex h-[92px] shrink-0 gap-2 overflow-x-auto border-t border-white/10 px-4 py-3" aria-label="All slides">
          {deck.slides.map((s, i) => (
            <li key={s.id} data-i={i} className="w-[124px] flex-none">
              <button type="button" onClick={() => jump(i)} aria-label={`Go to slide ${i + 1}`} aria-current={i === index ? "true" : undefined} className={`relative block w-full overflow-hidden rounded-[6px] ring-2 ${i === index ? "ring-white" : "ring-transparent opacity-60 hover:opacity-100"}`}>
                <SlideFrame>{(scale) => <SlideStage slide={s} theme={theme} intensity={deck.motionIntensity} mode="static" scale={scale} />}</SlideFrame>
                <span className="tabular absolute bottom-0.5 left-1 rounded-[3px] bg-black/60 px-1 text-[10px]">{i + 1}</span>
              </button>
            </li>
          ))}
        </ol>
        {helpBox}
        <p className="pointer-events-none absolute bottom-[100px] right-5 text-[11px] text-white/35">Press ? for shortcuts</p>
      </div>
    );
  }

  // ----- Audience view -------------------------------------------------------
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
              {(scale) => <SlideStage slide={slide} theme={theme} intensity={deck.motionIntensity} mode="play" step={state.step} playKey={slide.id} scale={scale} page={index + 1} morphNames />}
            </SlideFrame>
          </div>
        </div>
        {state.black && <div className="absolute inset-0 bg-black" aria-label="Screen blacked out" />}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-[3px] bg-white/10">
          <div className="h-full bg-white/60 transition-[width]" style={{ width: `${((index + (steps > 1 ? state.step / steps : 1)) / total) * 100}%` }} />
        </div>
      </div>

      {notes && (
        <aside className="flex w-[360px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-white/10 bg-[#111] p-5" aria-label="Presenter notes">
          <div className="flex items-baseline justify-between text-[13px] text-white/70">
            <span className="tabular">
              Slide {index + 1} / {total}
              {steps > 1 && ` · build ${state.step + 1}/${steps}`}
            </span>
            <span className="tabular text-[20px] text-white">{fmt(timer.elapsed)}</span>
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
          <button
            type="button"
            className="mt-auto inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] border border-white/15 text-[13px] text-white/85 hover:bg-white/10"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/d/${id}/present?view=presenter&slide=1`);
            }}
          >
            <MonitorPlay size={14} aria-hidden="true" />
            Switch to presenter view
          </button>
        </aside>
      )}

      {helpBox}
      {!linked && <p className="pointer-events-none absolute left-4 top-3 text-[12px] text-white/40">Press ? for shortcuts</p>}
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
