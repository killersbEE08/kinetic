"use client";

// Drawn product screens inside a phone or browser frame. Light UI on every theme so the
// product reads as "the product", with the brand colour for header, chart and button.
import type { CSSProperties } from "react";
import type { MockupElement, Screen } from "@/lib/deck/schema";
import type { Theme } from "@/lib/deck/themes";
import { Icon } from "./Icon";

const TONE: Record<string, { bg: string; fg: string }> = {
  ok: { bg: "#E7F7EE", fg: "#11713F" },
  warn: { bg: "#FFF1DC", fg: "#9A5300" },
  info: { bg: "#E8F0FE", fg: "#1D4FB8" },
  muted: { bg: "#F0F1F3", fg: "#5A5F69" },
};

function Spark({ values, color, run, delay, w, h }: { values: number[]; color: string; run: boolean; delay: number; w: number; h: number }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / Math.max(1, values.length - 1)) * w, h - ((v - min) / span) * (h - 12) - 6] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="block overflow-visible" aria-hidden="true">
      <path d={`${d} L${w},${h} L0,${h} Z`} fill={color} opacity={0.1} className={run ? "k-fadein" : undefined} style={run ? ({ "--d": `${delay + 400}ms`, "--dur": "600ms" } as CSSProperties) : undefined} />
      <path d={d} fill="none" stroke={color} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" pathLength={1} strokeDasharray="1" className={run ? "k-line" : undefined} style={run ? ({ "--d": `${delay}ms`, "--dur": "1200ms" } as CSSProperties) : undefined} />
      {pts.length > 0 && <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={7} fill={color} className={run ? "k-dot" : undefined} style={run ? { animationDelay: `${delay + 1100}ms` } : undefined} />}
    </svg>
  );
}

function ScreenBody({ screen, theme, run, delay, wide }: { screen: Screen; theme: Theme; run: boolean; delay: number; wide: boolean }) {
  const accent = theme.colors.accent;
  const on = theme.brand?.onPrimary ?? "#fff";
  const enter = (ms: number, base: string, style: CSSProperties) =>
    run ? { className: `k-item k-a-fadeUp ${base}`, style: { ...style, animationDelay: `${ms}ms` } } : { className: base, style };
  const rows = (
    <div className="flex flex-col" style={{ gap: wide ? 12 : 14 }}>
      {screen.rows.map((r, i) => {
        const tone = TONE[r.tone ?? "muted"];
        return (
          <div key={i} {...enter(delay + 350 + i * 130, "flex items-center justify-between rounded-[18px] border border-[#ECEEF1] bg-white", { padding: wide ? "16px 22px" : "18px 20px", gap: 16 })}>
            <div className="min-w-0">
              <div className="truncate font-semibold text-[#14161A]" style={{ fontSize: wide ? 22 : 23 }}>
                {r.label}
              </div>
              {r.sub && (
                <div className="truncate text-[#6B7079]" style={{ fontSize: wide ? 18 : 18, marginTop: 4 }}>
                  {r.sub}
                </div>
              )}
            </div>
            <div className="flex flex-none items-center" style={{ gap: 12 }}>
              {r.value && <span className="tabular font-semibold text-[#14161A]" style={{ fontSize: 22 }}>{r.value}</span>}
              {r.tag && (
                <span className="rounded-full font-semibold" style={{ background: tone.bg, color: tone.fg, fontSize: 16, padding: "6px 12px" }}>
                  {r.tag}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
  const kpi = screen.kpi && (
    <div {...enter(delay + 250, "rounded-[20px] bg-white", { padding: "18px 22px", border: "1px solid #ECEEF1" })}>
      <div className="text-[#6B7079]" style={{ fontSize: 18 }}>{screen.kpi.label}</div>
      <div className="tabular font-semibold" style={{ fontSize: 46, color: accent, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
        {screen.kpi.value}
      </div>
    </div>
  );
  const chart = screen.chart && screen.chart.length > 1 && (
    <div className="rounded-[20px] bg-white" style={{ padding: "16px 22px", border: "1px solid #ECEEF1" }}>
      {screen.chartLabel && <div className="text-[#6B7079]" style={{ fontSize: 17, marginBottom: 8 }}>{screen.chartLabel}</div>}
      <Spark values={screen.chart} color={accent} run={run} delay={delay + 300} w={wide ? 400 : 330} h={wide ? 120 : 100} />
    </div>
  );
  const cta = screen.cta && (
    <div {...enter(delay + 350 + screen.rows.length * 130 + 80, "flex items-center justify-center rounded-[16px] font-bold", { background: accent, color: on, fontSize: 22, height: 64 })}>
      {/* Bold 22px counts as large text (WCAG 3:1), so white stays readable on mid-tone brand colours. */}
      {screen.cta}
    </div>
  );

  if (wide) {
    return (
      <div className="flex h-full flex-col" style={{ gap: 18, padding: 28 }}>
        {screen.heading && <div className="font-semibold text-[#14161A]" style={{ fontSize: 30, letterSpacing: "-0.02em" }}>{screen.heading}</div>}
        {(kpi || chart) && (
          <div className="grid" style={{ gridTemplateColumns: kpi && chart ? "0.8fr 1.2fr" : "1fr", gap: 16 }}>
            {kpi}
            {chart}
          </div>
        )}
        {rows}
        {cta && <div className="mt-auto flex justify-end"><div style={{ width: 300 }}>{cta}</div></div>}
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col" style={{ gap: 16, padding: "18px 22px 26px" }}>
      {screen.heading && <div className="font-semibold text-[#14161A]" style={{ fontSize: 28, letterSpacing: "-0.02em", lineHeight: 1.2 }}>{screen.heading}</div>}
      {kpi}
      {chart}
      {rows}
      {cta && <div className="mt-auto">{cta}</div>}
    </div>
  );
}

export function Mockup({ el, theme, run, delay = 0, durationMs = 900 }: { el: MockupElement; theme: Theme; run: boolean; delay?: number; durationMs?: number }) {
  const accent = theme.colors.accent;
  const on = theme.brand?.onPrimary ?? "#fff";
  const frameAnim: CSSProperties = run ? ({ "--d": `${delay}ms`, "--dur": `${durationMs}ms` } as CSSProperties) : {};
  const mark = theme.brand?.mark;
  const appBar = (wide: boolean) => (
    <div className="flex items-center border-b border-[#ECEEF1] bg-white" style={{ gap: 12, padding: wide ? "16px 28px" : "14px 22px" }}>
      <span className="flex items-center justify-center rounded-[10px]" style={{ width: 38, height: 38, background: accent }}>
        <Icon name={mark ?? "layers"} size={22} stroke={2.2} color={on} />
      </span>
      <span className="font-semibold text-[#14161A]" style={{ fontSize: 22 }}>{el.screen.app}</span>
      <span className="ml-auto flex items-center" style={{ gap: 10 }} aria-hidden="true">
        <span className="rounded-full bg-[#F0F1F3]" style={{ width: 34, height: 34 }} />
      </span>
    </div>
  );

  if (el.device === "phone") {
    return (
      <div className={run ? "k-run k-rise" : ""} style={{ ...frameAnim, width: 470, height: 900 }}>
        <div className="relative h-full w-full rounded-[64px] bg-[#0E1013] p-[14px] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.55)]">
          <div className="relative flex h-full flex-col overflow-hidden rounded-[52px] bg-[#F6F7F9]">
            <div className="flex items-center justify-between bg-white px-9 pt-5 pb-2 text-[18px] font-semibold text-[#14161A]">
              <span className="tabular">9:41</span>
              <span className="absolute left-1/2 top-3 h-[34px] w-[130px] -translate-x-1/2 rounded-full bg-[#0E1013]" aria-hidden="true" />
              <span className="flex gap-1.5" aria-hidden="true">
                <span className="h-[12px] w-[18px] rounded-[3px] bg-[#14161A]" />
                <span className="h-[12px] w-[26px] rounded-[3px] border-2 border-[#14161A]" />
              </span>
            </div>
            {appBar(false)}
            <div className="min-h-0 flex-1">
              <ScreenBody screen={el.screen} theme={theme} run={run} delay={delay} wide={false} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={run ? "k-run k-rise" : ""} style={{ ...frameAnim, width: 1000, height: 700 }}>
      <div className="flex h-full w-full flex-col overflow-hidden rounded-[22px] border border-black/10 bg-[#F6F7F9] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.5)]">
        <div className="flex items-center bg-[#ECEEF1]" style={{ gap: 18, padding: "14px 20px" }}>
          <span className="flex" style={{ gap: 9 }} aria-hidden="true">
            <span className="h-[16px] w-[16px] rounded-full bg-[#FF5F57]" />
            <span className="h-[16px] w-[16px] rounded-full bg-[#FEBC2E]" />
            <span className="h-[16px] w-[16px] rounded-full bg-[#28C840]" />
          </span>
          <span className="flex-1 truncate rounded-[10px] bg-white text-[#5A5F69]" style={{ fontSize: 18, padding: "7px 16px" }}>
            {el.url ?? `${el.screen.app.toLowerCase().replace(/[^a-z0-9]+/g, "")}.example`}
          </span>
        </div>
        {appBar(true)}
        <div className="min-h-0 flex-1">
          <ScreenBody screen={el.screen} theme={theme} run={run} delay={delay} wide />
        </div>
      </div>
    </div>
  );
}
