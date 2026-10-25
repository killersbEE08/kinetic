"use client";

// Public viewer for share links: /v/<link id>. No sign-in. Plays the deck with motion, tracks time
// per slide (for the owner's analytics), and offers a PDF download when the owner allowed it.
import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Flag, Maximize, MessageSquare, X } from "lucide-react";
import { ReportForm } from "@/components/app/ReportForm";
import { useBackend } from "@/lib/client/backend";
import { SlideFrame, SlideStage } from "@/components/deck/SlideView";
import { Wordmark } from "@/components/ui/chrome";
import { setAssetLoader } from "@/lib/client/assets";
import { canMorph, changeSlide } from "@/lib/client/morph";
import { Deck as DeckSchema, type Deck } from "@/lib/deck/schema";
import { deckTheme } from "@/lib/deck/themes";
import { stepCount } from "@/lib/deck/motion";
import { useViewerComments, ViewerCommentsPanel } from "@/components/app/ViewerComments";

type State =
  | { kind: "loading" }
  | { kind: "password"; wrong: boolean }
  | { kind: "closed"; message: string }
  | { kind: "error"; message: string }
  | { kind: "ready"; deck: Deck; token: string | null; allowDownload: boolean; allowComments: boolean; ownerPreview: boolean };

/** Sends time-per-slide beats. Uses sendBeacon so the last beat survives closing the tab. */
function useBeats(linkId: string, token: string | null, slide: number) {
  const acc = useRef(new Map<number, number>());
  const since = useRef<number | null>(null);
  const current = useRef(slide);

  const stamp = useCallback(() => {
    if (since.current !== null) {
      const ms = Date.now() - since.current;
      acc.current.set(current.current, (acc.current.get(current.current) ?? 0) + ms);
    }
    since.current = document.visibilityState === "visible" ? Date.now() : null;
  }, []);

  const flush = useCallback(
    (beacon = false, final = false) => {
      stamp();
      if (!token) return;
      const beats = [...acc.current.entries()].filter(([, ms]) => ms >= 250).map(([s, ms]) => ({ slide: s, ms: Math.round(ms) }));
      acc.current.clear();
      if (!beats.length && !final) return;
      // `final` tells the server the visit ended, so the owner gets one summary alert.
      const body = JSON.stringify({ token, beats: beats.slice(0, 30), ...(final ? { final: true } : {}) });
      if (beacon && navigator.sendBeacon) navigator.sendBeacon(`/api/v/${linkId}/beat`, new Blob([body], { type: "application/json" }));
      else void fetch(`/api/v/${linkId}/beat`, { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => undefined);
    },
    [linkId, token, stamp],
  );

  useEffect(() => {
    stamp();
    current.current = slide;
  }, [slide, stamp]);

  useEffect(() => {
    if (!token) return;
    since.current = document.visibilityState === "visible" ? Date.now() : null;
    const t = setInterval(() => flush(), 10_000);
    const onVis = () => (document.visibilityState === "hidden" ? flush(true) : stamp());
    const onHide = () => flush(true, true);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
      flush(true, true);
    };
  }, [token, flush, stamp]);
}

function Player({ linkId, deck, token, allowDownload, allowComments, ownerPreview }: { linkId: string; deck: Deck; token: string | null; allowDownload: boolean; allowComments: boolean; ownerPreview: boolean }) {
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState(0);
  const [downloading, setDownloading] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const theme = useMemo(() => deckTheme(deck), [deck]);
  const total = deck.slides.length;
  const slide = deck.slides[index];
  const steps = stepCount(slide, deck.motionIntensity);
  useBeats(linkId, token, index);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const comments = useViewerComments(linkId, token, allowComments);
  const slideComments = comments.comments.filter((c) => !c.parentId && c.slideId === slide.id).length;

  const go = useCallback(
    (to: number) => {
      if (to < 0 || to >= total || to === index) return;
      changeSlide(deck.slides[Math.max(to, index)].transition, () => {
        setIndex(to);
        setStep(0);
      });
    },
    [deck, index, total],
  );
  const next = useCallback(() => (step < steps - 1 ? setStep((s) => s + 1) : go(index + 1)), [step, steps, go, index]);
  const prev = useCallback(() => (step > 0 ? setStep((s) => s - 1) : go(index - 1)), [step, go, index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Typing a comment must not change slides.
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) {
        e.preventDefault();
        next();
      } else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) {
        e.preventDefault();
        prev();
      } else if (e.key === "f" || e.key === "F") {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else rootRef.current?.requestFullscreen().catch(() => {});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  async function downloadPdf() {
    setDownloading("Preparing");
    try {
      const [{ exportPdf }, { download, fileBase }] = await Promise.all([import("@/lib/export/pdf"), import("@/lib/export/render")]);
      const blob = await exportPdf(deck, { layout: "slides", quality: "standard" }, (n, t) => setDownloading(`Slide ${n} of ${t}`));
      download(blob, `${fileBase(deck.title)}.pdf`);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div ref={rootRef} className="flex min-h-dvh flex-col bg-[#0b0b0c] text-white">
      <header className="flex h-12 shrink-0 items-center gap-3 px-4 text-[13px]">
        <span className="min-w-0 truncate font-medium">{deck.title}</span>
        <span className="tabular text-white/60">{index + 1} / {total}</span>
        {ownerPreview && <span className="hidden rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/80 sm:inline" title="You are signed in as the owner: this visit isn't counted and sends no alert.">Your link · views not counted</span>}
        <span className="ml-auto flex items-center gap-1">
          {allowComments && (
            <button type="button" className={`inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 hover:bg-white/10 hover:text-white ${commentsOpen ? "bg-white/10 text-white" : "text-white/80"}`} onClick={() => setCommentsOpen((o) => !o)} aria-expanded={commentsOpen}>
              <MessageSquare size={15} aria-hidden="true" />
              Comment{slideComments ? ` (${slideComments})` : ""}
            </button>
          )}
          {allowDownload && (
            <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-white/80 hover:bg-white/10 hover:text-white" onClick={downloadPdf} disabled={!!downloading}>
              <Download size={15} aria-hidden="true" />
              {downloading ?? "PDF"}
            </button>
          )}
          <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-white/80 hover:bg-white/10 hover:text-white" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : rootRef.current?.requestFullscreen())?.catch(() => {})} aria-label="Full screen (F)">
            <Maximize size={15} aria-hidden="true" />
          </button>
        </span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
      <main
        className="relative flex flex-1 items-center justify-center px-2 sm:px-6"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button,a")) return;
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          if (e.clientX - r.left < r.width / 3) prev();
          else next();
        }}
      >
        <div className="w-full" style={{ maxWidth: "calc((100dvh - 120px) * 16 / 9)" }}>
          <div key={slide.id} className={`overflow-hidden rounded-[6px] ${slide.transition === "morph" && canMorph() ? "" : `k-tr-${slide.transition === "cut" ? "none" : slide.transition}`}`}>
            <SlideFrame label={`Slide ${index + 1} of ${total}`}>
              {(scale) => <SlideStage slide={slide} theme={theme} intensity={deck.motionIntensity} mode="play" step={step} playKey={slide.id} scale={scale} page={index + 1} morphNames />}
            </SlideFrame>
          </div>
        </div>
      </main>
      {allowComments && commentsOpen && !reportOpen && <ViewerCommentsPanel linkId={linkId} slideId={slide.id} slideNumber={index + 1} api={comments} ownerPreview={ownerPreview} onClose={() => setCommentsOpen(false)} />}
      {reportOpen && (
        <aside className="w-full overflow-y-auto border-t border-white/10 bg-[#141416] px-4 pb-4 text-white sm:w-[340px] sm:border-l sm:border-t-0" aria-label="Report this deck">
          <div className="flex h-12 items-center justify-between">
            <h2 className="text-[14px] font-semibold">Report this deck</h2>
            <button type="button" className="rounded-[8px] p-1.5 text-white/70 hover:bg-white/10 hover:text-white" onClick={() => setReportOpen(false)} aria-label="Close report"><X size={16} aria-hidden="true" /></button>
          </div>
          <ReportForm dark link={linkId} onDone={() => setReportOpen(false)} />
        </aside>
      )}
      </div>
      <footer className="flex h-14 shrink-0 items-center gap-3 px-4">
        <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white/80 hover:bg-white/10 disabled:opacity-30" onClick={prev} disabled={index === 0 && step === 0} aria-label="Previous">
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={index + 1} aria-label="Progress">
          <div className="h-full rounded-full bg-white/70 transition-[width]" style={{ width: `${((index + (steps > 1 ? (step + 1) / steps : 1)) / total) * 100}%` }} />
        </div>
        <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white/80 hover:bg-white/10 disabled:opacity-30" onClick={next} disabled={index === total - 1 && step === steps - 1} aria-label="Next">
          <ChevronRight size={20} aria-hidden="true" />
        </button>
        {!ownerPreview && (
          <button type="button" className="ml-2 inline-flex items-center gap-1 text-[12px] text-white/60 hover:text-white" onClick={() => (setReportOpen(true), setCommentsOpen(false))}>
            <Flag size={12} aria-hidden="true" />
            Report
          </button>
        )}
        <Link href="/" className="ml-2 hidden text-[12px] text-white/60 hover:text-white/80 sm:inline">Made with DeckIQ</Link>
      </footer>
    </div>
  );
}

export default function SharedDeckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const backend = useBackend();

  const open = useCallback(
    async (pw?: string) => {
      setBusy(true);
      try {
        // Signed in? Send the session so the owner's own visits aren't counted or alerted.
        const auth = await backend.authToken().catch(() => null);
        const res = await fetch(`/api/v/${encodeURIComponent(id)}`, { method: "POST", headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, body: JSON.stringify(pw ? { password: pw } : {}) });
        const data = (await res.json().catch(() => ({}))) as { deck?: unknown; token?: string | null; allowDownload?: boolean; allowComments?: boolean; ownerPreview?: boolean; error?: string; code?: string };
        if (res.status === 401) return setState({ kind: "password", wrong: false });
        if (res.status === 403 && data.code === "password_wrong") return setState({ kind: "password", wrong: true });
        if (res.status === 404 || res.status === 410) return setState({ kind: "closed", message: data.error ?? "This link isn't available." });
        if (!res.ok) return setState({ kind: "error", message: data.error ?? "This deck couldn't be loaded." });
        const parsed = DeckSchema.safeParse(data.deck);
        if (!parsed.success) return setState({ kind: "error", message: "This deck couldn't be read." });
        const token = data.token ?? null;
        // Photos in shared decks come from the link, not from anyone's account.
        setAssetLoader(async (assetId) => {
          const r = await fetch(`/api/v/${encodeURIComponent(id)}/asset/${encodeURIComponent(assetId)}?t=${encodeURIComponent(token ?? "")}`);
          if (!r.ok) throw new Error("missing");
          return r.blob();
        }, { lock: true });
        setState({ kind: "ready", deck: parsed.data, token, allowDownload: !!data.allowDownload, allowComments: !!data.allowComments && !!token, ownerPreview: !!data.ownerPreview });
      } catch {
        setState({ kind: "error", message: "Check your connection and try again." });
      } finally {
        setBusy(false);
      }
    },
    [id, backend],
  );

  // Once sign-in has loaded (so the owner can be recognised), open the link exactly once.
  const opened = useRef(false);
  useEffect(() => {
    if (!backend.ready || opened.current) return;
    opened.current = true;
    void open();
  }, [open, backend.ready]);

  if (state.kind === "ready") return <Player linkId={id} deck={state.deck} token={state.token} allowDownload={state.allowDownload} allowComments={state.allowComments} ownerPreview={state.ownerPreview} />;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6">
      <Wordmark />
      {state.kind === "loading" && <p className="text-[14px] text-ink-2" role="status">Opening the deck</p>}
      {state.kind === "password" && (
        <form
          className="w-full max-w-[360px] rounded-[14px] border border-line bg-surface p-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (password) void open(password);
          }}
        >
          <h1 className="text-[18px] font-semibold">This deck needs a password</h1>
          <p className="mt-1 text-[14px] text-ink-2">Ask the person who sent you the link.</p>
          <label className="mt-4 block text-[13px] font-medium">
            Password
            <input type="password" autoFocus className="field mt-1" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
          </label>
          {state.wrong && <p className="mt-2 text-[13px] text-danger" role="alert">That password isn&rsquo;t right.</p>}
          <button type="submit" className="btn btn-primary mt-4 w-full" disabled={busy || !password}>{busy ? "Checking" : "Open deck"}</button>
        </form>
      )}
      {(state.kind === "closed" || state.kind === "error") && (
        <div className="max-w-[420px] text-center">
          <h1 className="text-[18px] font-semibold">{state.kind === "closed" ? "This link isn\u2019t available" : "Something went wrong"}</h1>
          <p className="mt-1 text-[14px] text-ink-2">{state.message}</p>
          {state.kind === "error" && <button type="button" className="btn btn-secondary mt-4" onClick={() => open()}>Try again</button>}
        </div>
      )}
      <p className="text-[12px] text-ink-2">Viewing a shared deck tells its owner which slides were viewed and for how long. No account needed.</p>
    </main>
  );
}
