"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { SlideView } from "@/components/deck/SlideView";
import { getTemplate, templateDeck } from "@/lib/deck/templates";
import { deckTheme, getTheme, withBrand } from "@/lib/deck/themes";
import { useReducedMotion } from "@/lib/client/hooks";
import type { Slide } from "@/lib/deck/schema";

/**
 * A template slide. Plays its builds on hover/focus; with `auto`, it plays while on screen and
 * cycles through `slides` (or the template's highlights). Respects reduced motion.
 */
export function DeckThumb({ templateId, slideIndex = 0, slides, auto = false, themeId, className = "", label }: { templateId: string; slideIndex?: number; slides?: number[]; auto?: boolean; themeId?: string; className?: string; label?: string }) {
  const deck = templateDeck(templateId);
  const tpl = getTemplate(templateId);
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [hot, setHot] = useState(false);
  const [inView, setInView] = useState(false);
  const [k, setK] = useState(0);
  const seq = slides ?? (auto ? (tpl?.highlights ?? [slideIndex]) : [slideIndex]);
  const live = auto && inView && !reduced;

  useEffect(() => {
    if (!auto || !ref.current) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.35 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [auto]);

  useEffect(() => {
    if (!live) return;
    const t = setTimeout(() => setK((n) => n + 1), 4600);
    return () => clearTimeout(t);
  }, [live, k]);

  if (!deck) return null;
  const idx = Math.min(seq[k % seq.length] ?? 0, deck.slides.length - 1);
  const slide: Slide = deck.slides[idx];
  const theme = themeId ? withBrand(getTheme(themeId), deck.brand) : deckTheme(deck);
  const playing = hot || live;
  return (
    <div ref={ref} className={`overflow-hidden ${className}`} onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)} onFocus={() => setHot(true)} onBlur={() => setHot(false)}>
      <SlideView slide={slide} theme={theme} intensity={deck.motionIntensity} mode={playing ? "play" : "static"} step={9} playKey={`${idx}-${k}-${playing ? 1 : 0}`} label={label ?? `${deck.title}, slide ${idx + 1}`} />
    </div>
  );
}

/** Minimal JSON syntax colouring for code panes (keys, strings, numbers). */
export function JsonCode({ value, maxLines = 40 }: { value: unknown; maxLines?: number }) {
  const lines = JSON.stringify(value, null, 2).split("\n");
  const shown = lines.slice(0, maxLines);
  return (
    <pre className="m-mono overflow-hidden whitespace-pre text-[12.5px] leading-[1.65]">
      {shown.map((line, i) => (
        <Fragment key={i}>
          {colour(line)}
          {"\n"}
        </Fragment>
      ))}
      {lines.length > maxLines && <span className="c">{"  …"}</span>}
    </pre>
  );
}

function colour(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  const rx = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?)|(true|false|null)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = rx.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    if (m[1] && m[2]) out.push(<span key={k++} className="k">{m[1]}</span>, m[2]);
    else if (m[1]) out.push(<span key={k++} className="s">{m[1]}</span>);
    else out.push(<span key={k++} className="n">{m[0]}</span>);
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

export function BrowserChrome({ url, dark = false, children }: { url: string; dark?: boolean; children: ReactNode }) {
  return (
    <div className={`overflow-hidden rounded-[12px] ${dark ? "bg-[#0f1117] text-[#d6d9e0]" : "bg-white text-[var(--m-ink)]"} shadow-[0_30px_60px_-30px_rgba(0,0,0,0.55)]`}>
      <div className={`flex h-9 items-center gap-2 border-b px-3 ${dark ? "border-white/10" : "border-[var(--m-line)]"}`}>
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </span>
        <span className={`m-mono ml-2 truncate rounded-[6px] px-2 py-0.5 text-[11px] ${dark ? "bg-white/5 text-white/60" : "bg-[var(--m-soft)] text-[var(--m-gray)]"}`}>{url}</span>
      </div>
      {children}
    </div>
  );
}

export function SectionHead({ eyebrow, title, sub, center = true }: { eyebrow?: string; title: ReactNode; sub?: ReactNode; center?: boolean }) {
  return (
    <div className={center ? "mx-auto max-w-[760px] text-center" : "max-w-[620px]"}>
      {eyebrow && <p className="m-eyebrow mb-4">{eyebrow}</p>}
      <h2 className="m-h2">{title}</h2>
      {sub && <p className="m-lead mt-4">{sub}</p>}
    </div>
  );
}

export function Check({ className = "" }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className={`flex-none ${className}`}>
      <circle cx="8" cy="8" r="7.25" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.35" />
      <path d="M5 8.2 7 10.2 11 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
