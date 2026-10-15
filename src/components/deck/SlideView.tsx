"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { BulletsElement, ChartElement, Element, ImageElement, Intensity, Slide } from "@/lib/deck/schema";
import { resolveTimeline, type ResolvedMotion } from "@/lib/deck/motion";
import { splitItem } from "@/lib/deck/layouts";
import type { Theme } from "@/lib/deck/themes";
import { useReducedMotion } from "@/lib/client/hooks";
import { useAssetUrl } from "@/lib/client/assets";
import { isAssetSrc, libraryUrl } from "@/lib/deck/media";
import { Icon } from "./Icon";
import { Decor, Footer, Logo } from "./Brand";
import { Mockup } from "./Mockup";

export interface SlideViewProps {
  slide: Slide;
  theme: Theme;
  intensity: Intensity;
  /** "static" = final state, no animation (thumbnails, editing). "play" = run builds up to `step`. */
  mode: "static" | "play";
  step?: number;
  /** Change to replay animations. */
  playKey?: string | number;
  editable?: boolean;
  showSuggested?: boolean;
  selectedId?: string | null;
  onSelect?: (elementId: string | null) => void;
  onEditText?: (elementId: string, value: string) => void;
  onEditItem?: (elementId: string, index: number, value: string) => void;
  className?: string;
  label?: string;
  /** Slide number for the footer (content slides only). */
  page?: number;
  /** Give headline, logo and photo view-transition names so "morph" can animate between slides. */
  morphNames?: boolean;
}

/** Scales a 1920×1080 stage to the width of its container. */
export function SlideFrame({ children, className, label }: { children: (scale: number) => ReactNode; className?: string; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / 1920);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className={"relative w-full overflow-hidden " + (className ?? "")} style={{ aspectRatio: "16 / 9" }} role="img" aria-label={label}>
      {scale > 0 && children(scale)}
    </div>
  );
}

export function SlideView(props: SlideViewProps) {
  return (
    <SlideFrame className={props.className} label={props.label}>
      {(scale) => <SlideStage {...props} scale={scale} />}
    </SlideFrame>
  );
}

export function SlideStage({ slide, theme, intensity, mode, step = 0, playKey, editable, showSuggested, selectedId, onSelect, onEditText, onEditItem, scale, page, morphNames }: SlideViewProps & { scale: number }) {
  const timeline = resolveTimeline(slide, intensity);
  const c = theme.colors;
  const style = {
    transform: `scale(${scale})`,
    "--k-bg": c.bg,
    "--k-surface": c.surface,
    "--k-text": c.text,
    "--k-muted": c.muted,
    "--k-accent": c.accent,
    "--k-accent2": c.accent2,
    "--k-rule": c.rule,
    "--k-on-accent": theme.brand?.onPrimary ?? c.bg,
    "--k-hw": theme.headingWeight,
    "--k-track": theme.headingTracking,
    "--k-case": theme.headingCase,
  } as CSSProperties;

  const ctx: RenderCtx = { slide, theme, timeline, mode, step, scale, editable: !!editable, showSuggested: !!showSuggested, selectedId: selectedId ?? null, onSelect, onEditText, onEditItem, morph: !!morphNames };

  return (
    <div key={playKey} className={"k-stage" + (editable ? " k-editable" : "")} data-heading={theme.headingFont} style={style} onClick={editable ? () => onSelect?.(null) : undefined}>
      <LayoutBody ctx={ctx} page={page} />
    </div>
  );
}

// ---------------------------------------------------------------------------

interface RenderCtx {
  slide: Slide;
  theme: Theme;
  timeline: Map<string, ResolvedMotion>;
  mode: "static" | "play";
  step: number;
  scale: number;
  editable: boolean;
  showSuggested: boolean;
  selectedId: string | null;
  onSelect?: (id: string | null) => void;
  onEditText?: (id: string, v: string) => void;
  onEditItem?: (id: string, i: number, v: string) => void;
  morph: boolean;
}

type Variant = "steps" | "grid" | "timeline" | "team" | "callouts" | "points";

const bySlot = (slide: Slide, slot: string) => slide.elements.find((e) => e.slot === slot);
const FULL_BLEED = new Set(["titleImage", "imageStatement"]);
const NO_FOOTER = new Set(["title", "titleImage", "imageStatement", "closing"]);

function LayoutBody({ ctx, page }: { ctx: RenderCtx; page?: number }) {
  const s = ctx.slide;
  const theme = ctx.theme;
  const branded = !!theme.brand;
  const playing = ctx.mode === "play";
  const E = (slot: string, cls = "", extra?: { big?: boolean; variant?: Variant; frac?: number }) => {
    const el = bySlot(s, slot);
    return el ? <ElementNode key={el.id} el={el} ctx={ctx} className={cls} big={extra?.big} variant={extra?.variant} frac={extra?.frac} /> : null;
  };
  const pad = "absolute inset-0 px-[120px] py-[110px]";
  // Split slides keep the footer on the text half so it never sits on the photo.
  const footer = !NO_FOOTER.has(s.layout) ? <Footer theme={theme} page={page} left={s.layout === "split" ? 1060 : 120} /> : null;
  const morphLogo = ctx.morph ? ({ viewTransitionName: "k-logo" } as CSSProperties) : undefined;

  let body: ReactNode;
  switch (s.layout) {
    case "title":
      body = (
        <>
          {branded && <Decor theme={theme} variant="hero" run={playing} />}
          <div className={pad + " flex flex-col justify-end gap-10 pb-[150px]"}>
            {branded ? (
              <div className="absolute left-[120px] top-[110px]" style={morphLogo}>
                <Logo theme={theme} size={64} />
              </div>
            ) : (
              <div className="k-rule absolute left-[120px] right-[120px] top-[110px]" />
            )}
            {E("title", `k-h k-display ${branded ? "max-w-[1000px]" : "max-w-[1500px]"}`)}
            {E("subtitle", `k-caption k-lead ${branded ? "max-w-[900px]" : "max-w-[1200px]"}`)}
          </div>
        </>
      );
      break;
    case "titleImage":
      body = (
        <>
          {E("media", "absolute inset-0", { frac: 1 })}
          <div className="k-scrim absolute inset-0" />
          <div className={pad + " k-on-photo flex flex-col justify-end gap-8 pb-[150px]"}>
            {branded && (
              <div className="absolute left-[120px] top-[110px]" style={morphLogo}>
                <Logo theme={theme} size={64} />
              </div>
            )}
            {E("title", "k-h k-display max-w-[1300px]")}
            {E("subtitle", "k-caption k-lead max-w-[1000px]")}
          </div>
        </>
      );
      break;
    case "statement":
      body = (
        <>
          {branded && <Decor theme={theme} variant="corner" run={playing} />}
          <div className={pad + " flex items-center"}>{E("statement", "k-h k-statement max-w-[1500px]")}</div>
        </>
      );
      break;
    case "imageStatement":
      body = (
        <>
          {E("media", "absolute inset-0", { frac: 1 })}
          <div className="k-scrim absolute inset-0" />
          <div className={pad + " k-on-photo flex items-center"}>{E("statement", "k-h k-statement max-w-[1400px]")}</div>
        </>
      );
      break;
    case "headlineBody":
      body = (
        <div className={pad + " flex flex-col gap-14"}>
          {E("title", "k-h k-h1 max-w-[1500px]")}
          {E("body", "k-body")}
        </div>
      );
      break;
    case "bullets":
      body = (
        <div className={pad + " grid grid-cols-12 gap-x-8"}>
          <div className="col-span-5">{E("title", "k-h k-h1")}</div>
          <div className="col-span-7 pt-3">{E("points", "", { variant: "points" })}</div>
        </div>
      );
      break;
    case "split":
      body = (
        <div className="absolute inset-0 grid grid-cols-2">
          <div className="relative overflow-hidden">{E("media", "absolute inset-0", { frac: 0.5 })}</div>
          <div className="flex flex-col justify-center gap-14 px-[100px] py-[110px]">
            {E("title", "k-h k-h1 k-h1-sm")}
            {E("points", "", { variant: "points" })}
          </div>
        </div>
      );
      break;
    case "iconGrid":
      body = (
        <div className={pad + " flex flex-col justify-between pb-[150px]"}>
          {E("title", "k-h k-h1 max-w-[1500px]")}
          {E("grid", "", { variant: "grid" })}
        </div>
      );
      break;
    case "product":
      body = (
        <div className={pad + " grid grid-cols-[1fr_auto] items-center gap-[90px]"}>
          <div className="flex flex-col gap-14">
            {E("title", "k-h k-h1")}
            {E("callouts", "", { variant: "callouts" })}
          </div>
          <div className="flex items-center justify-center">{E("mockup")}</div>
        </div>
      );
      break;
    case "twoColumn":
      body = (
        <div className={pad + " flex flex-col justify-center gap-16 pb-[150px]"}>
          {E("title", "k-h k-h1 max-w-[1500px]")}
          <div className="grid grid-cols-2 gap-10">
            <div className="k-card flex min-h-[420px] flex-col gap-10 rounded-[36px] p-14">
              {E("leftLabel", "k-label")}
              {E("left", "k-bullets-lg", { variant: "points" })}
            </div>
            <div className="k-callout flex min-h-[420px] flex-col gap-10 rounded-[36px] p-14">
              {E("rightLabel", "k-label k-label-accent")}
              {E("right", "k-bullets-lg", { variant: "points" })}
            </div>
          </div>
        </div>
      );
      break;
    case "bigNumber":
      body = (
        <>
          {branded && theme.brand?.pattern !== "waves" && <Decor theme={theme} variant="corner" run={playing} delay={300} />}
          <div className={pad + " flex flex-col justify-center gap-8"}>
            {E("number", "", { big: true })}
            {E("label", "k-h k-h2 max-w-[1300px]")}
            {E("context", "k-caption max-w-[1100px]")}
          </div>
        </>
      );
      break;
    case "kpiRow":
      body = (
        <div className={pad + " flex flex-col justify-center gap-[150px] pb-[150px]"}>
          {E("title", "k-h k-h1 max-w-[1500px]")}
          {E("kpis")}
        </div>
      );
      break;
    case "chartFocus":
      body = (
        <div className={pad + " flex flex-col gap-12 pb-[140px]"}>
          {E("title", "k-h k-h1 max-w-[1500px]")}
          <div className="grid min-h-0 flex-1 grid-cols-[1.75fr_1fr] gap-[80px]">
            <div className="min-h-0">{E("chart", "h-full")}</div>
            <div className="k-callout flex flex-col justify-center gap-6 rounded-[36px] px-14">
              {E("number", "", { big: true })}
              {E("caption", "k-caption")}
            </div>
          </div>
        </div>
      );
      break;
    case "barChart":
    case "lineChart":
      body = (
        <div className={pad + " flex flex-col gap-10 pb-[140px]"}>
          {E("title", "k-h k-h1 max-w-[1500px]")}
          <div className="min-h-0 flex-1">{E("chart", "h-full")}</div>
          {E("caption", "k-caption")}
        </div>
      );
      break;
    case "process":
      body = (
        <div className={pad + " flex flex-col justify-center gap-[130px] pb-[150px]"}>
          {E("title", "k-h k-h1 max-w-[1500px]")}
          {E("steps", "", { variant: "steps" })}
        </div>
      );
      break;
    case "timeline":
      body = (
        <div className={pad + " flex flex-col justify-center gap-[150px] pb-[160px]"}>
          {E("title", "k-h k-h1 max-w-[1500px]")}
          {E("milestones", "", { variant: "timeline" })}
        </div>
      );
      break;
    case "team":
      body = (
        <div className={pad + " flex flex-col gap-16"}>
          {E("title", "k-h k-h1 max-w-[1500px]")}
          {E("people", "", { variant: "team" })}
        </div>
      );
      break;
    case "quote":
      body = (
        <div className={pad + " flex flex-col justify-center gap-12"}>
          <span aria-hidden="true" className="k-quote-mark">“</span>
          {E("quote", "k-quote max-w-[1500px]")}
          {E("attribution", "k-caption")}
        </div>
      );
      break;
    case "closing":
      body = (
        <>
          {branded && <Decor theme={theme} variant="hero" run={playing} delay={200} />}
          <div className={pad + " flex flex-col justify-center gap-10"}>
            {branded && (
              <div style={morphLogo}>
                <Logo theme={theme} size={64} />
              </div>
            )}
            {E("title", `k-h k-display ${branded ? "max-w-[1050px]" : "max-w-[1500px]"}`)}
            {E("body", `k-body ${branded ? "max-w-[900px]" : ""}`)}
            {E("contact", "k-caption")}
          </div>
        </>
      );
      break;
    default:
      body = (
        <div className={pad + " flex flex-col gap-10"}>
          {s.elements.map((el) => (
            <ElementNode key={el.id} el={el} ctx={ctx} />
          ))}
        </div>
      );
  }
  return (
    <>
      {body}
      {!FULL_BLEED.has(s.layout) && footer}
    </>
  );
}

function animState(ctx: RenderCtx, m: ResolvedMotion | undefined): { cls: string; style: CSSProperties; run: boolean } {
  if (ctx.mode === "static" || !m || m.preset === "none") return { cls: "", style: {}, run: false };
  if (m.step > ctx.step) return { cls: "k-wait", style: {}, run: false };
  return {
    cls: `k-a k-run k-a-${m.preset}`,
    style: { "--d": `${m.delayMs}ms`, "--dur": `${m.durationMs}ms`, "--ease": m.easing } as CSSProperties,
    run: true,
  };
}

function ElementNode({ el, ctx, className = "", big, variant, frac = 1 }: { el: Element; ctx: RenderCtx; className?: string; big?: boolean; variant?: Variant; frac?: number }) {
  const m = ctx.timeline.get(el.id);
  const a = animState(ctx, m);
  const selected = ctx.selectedId === el.id;
  const suggested = ctx.showSuggested && el.aiSuggested;
  const cls = ["k-el", a.cls, className, selected ? "k-selected" : "", suggested && !selected ? "k-suggested" : ""].filter(Boolean).join(" ");
  const onClick = ctx.editable
    ? (e: React.MouseEvent) => {
        e.stopPropagation();
        ctx.onSelect?.(el.id);
      }
    : undefined;
  const tag = suggested ? <span className="k-suggested-tag">Suggested</span> : null;

  if (el.type === "text") {
    let inner: ReactNode;
    if (m?.preset === "typeOn" && a.run) {
      const words = el.content.split(/(\s+)/);
      let wi = 0;
      inner = words.map((w, i) =>
        /\s+/.test(w) ? (
          w
        ) : (
          <span key={i} className="k-word inline-block" style={{ animationDelay: `${m.delayMs + wi++ * 40}ms` }}>
            {w}
          </span>
        ),
      );
    } else if (ctx.editable) {
      inner = <EditableText value={el.content} onCommit={(v) => ctx.onEditText?.(el.id, v)} label={`${el.slot} text`} />;
    } else {
      inner = el.content;
    }
    const Tag = el.role === "h1" ? "h2" : el.role === "quote" ? "blockquote" : "p";
    const morph = ctx.morph && el.role === "h1" ? ({ viewTransitionName: "k-title" } as CSSProperties) : undefined;
    return (
      <Tag className={cls} style={{ ...a.style, ...morph }} onClick={onClick} data-el={el.id}>
        {tag}
        {inner}
      </Tag>
    );
  }

  if (el.type === "image") {
    return (
      <div className={cls.replace(/k-a-\w+/, "") + (a.run ? " k-run" : "")} style={{ ...a.style, position: "absolute", inset: 0, ...(ctx.morph ? { viewTransitionName: "k-media" } : {}) }} onClick={onClick} data-el={el.id}>
        {tag}
        <Photo el={el} run={a.run} scale={ctx.scale} frac={frac} />
      </div>
    );
  }

  if (el.type === "mockup") {
    return (
      <div className={cls.replace(/k-a-\w+/, "")} onClick={onClick} data-el={el.id}>
        {tag}
        <Mockup el={el} theme={ctx.theme} run={a.run} delay={m?.delayMs ?? 0} durationMs={m?.durationMs ?? 900} />
      </div>
    );
  }

  if (el.type === "bullets") return <BulletsNode el={el} ctx={ctx} m={m} a={a} cls={cls} onClick={onClick} tag={tag} variant={variant ?? "points"} />;

  return (
    <div className={cls.replace(/k-a-\w+/, "")} style={a.style} onClick={onClick} data-el={el.id}>
      {tag}
      <Chart el={el} motion={m} run={a.run} big={big} />
    </div>
  );
}

function Photo({ el, run, scale, frac }: { el: ImageElement; run: boolean; scale: number; frac: number }) {
  const upload = useAssetUrl(isAssetSrc(el.src) ? el.src : null);
  const cls = `absolute inset-0 h-full w-full object-cover ${run ? "k-ken" : ""}`;
  const pos = { objectPosition: `${el.focal[0] * 100}% ${el.focal[1] * 100}%` };
  if (isAssetSrc(el.src)) {
    if (!upload || upload === "missing") {
      return (
        <div className="k-card absolute inset-0 flex items-center justify-center text-[30px]" style={{ color: "var(--k-muted)" }} data-photo-missing={upload === "missing" ? "1" : undefined}>
          {upload === "missing" ? "Photo not found. Pick another in the Design panel." : ""}
        </div>
      );
    }
    // eslint-disable-next-line @next/next/no-img-element -- blob: URL of the user's own upload
    return <img src={upload} alt={el.alt} decoding="async" draggable={false} className={cls} style={pos} />;
  }
  // Pick the smaller file for thumbnails; the browser uses the width hint to choose.
  const px = Math.max(320, Math.ceil(1920 * scale * frac));
  return (
    // eslint-disable-next-line @next/next/no-img-element -- slides render at arbitrary scales; plain img with srcset is simpler and works on Workers
    <img
      src={libraryUrl(el.src, 1920)}
      srcSet={`${libraryUrl(el.src, 640)} 640w, ${libraryUrl(el.src, 1920)} 1920w`}
      sizes={`${px}px`}
      alt={el.alt}
      // Thumbnails load lazily; slides you are looking at load right away.
      loading={scale < 0.3 ? "lazy" : "eager"}
      decoding="async"
      draggable={false}
      className={cls}
      style={pos}
    />
  );
}

function Chip({ name, size = 72 }: { name?: string; size?: number }) {
  return (
    <span className="k-chip inline-flex flex-none items-center justify-center" style={{ width: size, height: size, borderRadius: size * 0.3 }}>
      <Icon name={name} size={size * 0.5} stroke={2} />
    </span>
  );
}

function BulletsNode({ el, ctx, m, a, cls, onClick, tag, variant }: { el: BulletsElement; ctx: RenderCtx; m?: ResolvedMotion; a: ReturnType<typeof animState>; cls: string; onClick?: (e: React.MouseEvent) => void; tag: ReactNode; variant: Variant }) {
  const stagger = m?.stagger ?? 60;
  const preset = m?.preset;
  const itemAnim = preset === "scaleIn" ? "k-a-scaleIn" : "k-a-fadeUp";
  const itemCls = a.run ? `k-item ${itemAnim}` : "";
  const itemDelay = (i: number) => (m?.delayMs ?? 0) + i * stagger * (variant === "points" ? 1 : 2);
  const itemStyle = (i: number): CSSProperties => (a.run ? { animationDelay: `${itemDelay(i)}ms` } : {});
  const wrapCls = cls.replace(/k-a-\w+/, "") + (a.run && variant === "timeline" ? " k-run" : "");
  const text = (item: string, i: number, label: string) => (ctx.editable ? <EditableText value={item} onCommit={(v) => ctx.onEditItem?.(el.id, i, v)} label={label} /> : item);
  const icons = el.icons ?? [];
  const n = el.items.length;

  if (variant === "steps") {
    return (
      <div className={wrapCls + " grid gap-10"} style={{ ...a.style, gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} onClick={onClick} data-el={el.id}>
        {tag}
        {el.items.map((item, i) => (
          <div key={i} className={itemCls + " k-rule flex flex-col gap-6 pt-8"} style={itemStyle(i)} data-delay={itemDelay(i)}>
            <span className="flex items-center gap-5">
              <span className="k-num text-[72px]" style={{ color: "var(--k-accent)" }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              {icons[i] && <Chip name={icons[i]} size={60} />}
            </span>
            <span className="text-[38px] leading-[1.3]">{text(item, i, `Step ${i + 1}`)}</span>
          </div>
        ))}
      </div>
    );
  }

  if (variant === "grid") {
    const cols = n === 4 ? 2 : n <= 3 ? n : 3;
    return (
      <div className={wrapCls + " grid gap-8"} style={{ ...a.style, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} onClick={onClick} data-el={el.id}>
        {tag}
        {el.items.map((item, i) => {
          const { head, rest } = splitItem(item);
          return (
            <div key={i} className={itemCls + ` k-card flex flex-col justify-between gap-10 rounded-[36px] p-14 ${n <= 3 ? "min-h-[440px]" : "min-h-[300px]"}`} style={itemStyle(i)} data-delay={itemDelay(i)}>
              <Chip name={icons[i]} size={96} />
              <div className="flex flex-col gap-4">
                <span className="text-[46px] font-semibold leading-[1.15] tracking-[-0.015em]">{ctx.editable ? text(item, i, `Card ${i + 1}`) : head}</span>
                {!ctx.editable && rest && <span className="text-[32px] leading-[1.4]" style={{ color: "var(--k-muted)" }}>{rest}</span>}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (variant === "timeline") {
    return (
      <div className={wrapCls + " relative"} style={a.style} onClick={onClick} data-el={el.id}>
        {tag}
        <svg className="absolute left-0 right-0 top-[86px] h-[6px] w-full overflow-visible" viewBox="0 0 1680 6" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 3 L1680 3" stroke="var(--k-rule)" strokeWidth="4" />
          <path d="M0 3 L1680 3" stroke="var(--k-accent)" strokeWidth="6" pathLength={1} strokeDasharray="1" className={a.run ? "k-line" : undefined} style={a.run ? ({ "--d": `${m?.delayMs ?? 0}ms`, "--dur": "1400ms" } as CSSProperties) : undefined} />
        </svg>
        <div className="grid gap-10" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {el.items.map((item, i) => {
            const { head, rest } = splitItem(item);
            return (
              <div key={i} className={itemCls + " flex flex-col gap-6"} style={a.run ? { animationDelay: `${(m?.delayMs ?? 0) + 200 + i * 220}ms` } : undefined} data-delay={(m?.delayMs ?? 0) + 200 + i * 220}>
                <span className="text-[30px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--k-accent)" }}>
                  {head}
                </span>
                <span className="block h-[34px] w-[34px] rounded-full border-[6px]" style={{ borderColor: "var(--k-accent)", background: "var(--k-bg)" }} />
                <span className="text-[34px] leading-[1.3]">{ctx.editable ? text(item, i, `Milestone ${i + 1}`) : rest || head}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (variant === "team") {
    return (
      <div className={wrapCls + " grid gap-10"} style={{ ...a.style, gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} onClick={onClick} data-el={el.id}>
        {tag}
        {el.items.map((item, i) => {
          const { head: name, rest } = splitItem(item);
          const dot = rest.indexOf(". ");
          const role = dot > 0 ? rest.slice(0, dot) : rest;
          const detail = dot > 0 ? rest.slice(dot + 2) : "";
          const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
          return (
            <div key={i} className={itemCls + " k-card flex flex-col gap-6 rounded-[32px] p-12"} style={itemStyle(i)} data-delay={itemDelay(i)}>
              <span className="flex h-[132px] w-[132px] items-center justify-center rounded-full text-[50px] font-semibold" style={{ background: "var(--k-accent)", color: "var(--k-on-accent)" }} aria-hidden="true">
                {initials}
              </span>
              <span className="text-[40px] font-semibold leading-[1.15]">{ctx.editable ? text(item, i, `Person ${i + 1}`) : name}</span>
              {!ctx.editable && <span className="text-[28px] font-medium" style={{ color: "var(--k-accent)" }}>{role}</span>}
              {!ctx.editable && detail && <span className="text-[26px] leading-[1.4]" style={{ color: "var(--k-muted)" }}>{detail}</span>}
            </div>
          );
        })}
      </div>
    );
  }

  // points / callouts
  const callout = variant === "callouts";
  return (
    <ul className={wrapCls + ` k-bullets ${icons.length ? "k-bullets-icons" : ""} ${callout ? "k-callouts" : ""}`} style={a.style} onClick={onClick} data-el={el.id}>
      {tag}
      {el.items.map((item, i) => (
        <li key={i} className={itemCls} style={itemStyle(i)} data-delay={itemDelay(i)}>
          {icons[i] && <Chip name={icons[i]} size={callout ? 68 : 60} />}
          <span>{text(item, i, `Point ${i + 1}`)}</span>
        </li>
      ))}
    </ul>
  );
}

function EditableText({ value, onCommit, label }: { value: string; onCommit: (v: string) => void; label: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  // Keep DOM in sync when the value changes from outside (undo, AI accept) without fighting the caret.
  useEffect(() => {
    if (ref.current && ref.current.innerText !== value && document.activeElement !== ref.current) ref.current.innerText = value;
  }, [value]);
  return (
    <span
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={label}
      tabIndex={0}
      onBlur={(e) => {
        const v = e.currentTarget.innerText.replace(/\s+/g, " ").trim();
        if (v !== value) onCommit(v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          (e.currentTarget as HTMLElement).blur();
        }
        if (e.key === "Escape") {
          e.currentTarget.innerText = value;
          (e.currentTarget as HTMLElement).blur();
        }
      }}
    >
      {value}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Charts: native SVG so they stay editable and animatable (PRD GEN-4).

function formatNumber(v: number, decimals: number) {
  return v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
const decimalsOf = (v: number) => (Number.isInteger(v) ? 0 : Math.min(2, String(v).split(".")[1]?.length ?? 0));

function withUnit(text: string, unit?: string) {
  if (!unit) return text;
  if (/^[$€£₹]/.test(unit)) return unit[0] + text + unit.slice(1);
  return text + unit;
}

function CountUp({ value, unit, run, delayMs, durationMs }: { value: number; unit?: string; run: boolean; delayMs: number; durationMs: number }) {
  const decimals = decimalsOf(value);
  const reduced = useReducedMotion();
  // Animated value while a count is in progress; null when idle (show the final value).
  const [anim, setAnim] = useState<number | null>(run && !reduced ? 0 : null);
  useEffect(() => {
    if (!run || reduced) return;
    let raf = 0;
    const start = performance.now() + delayMs;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / durationMs));
      setAnim(t >= 1 ? null : value * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, reduced, value, delayMs, durationMs]);
  const shown = run && !reduced && anim !== null ? anim : value;
  return <>{withUnit(formatNumber(shown, decimals), unit)}</>;
}

function Chart({ el, motion, run, big }: { el: ChartElement; motion?: ResolvedMotion; run: boolean; big?: boolean }) {
  const delay = motion?.delayMs ?? 0;
  const dur = Math.max(motion?.durationMs ?? 600, 500);
  const stagger = motion?.stagger ?? 60;
  const series = el.data.series[0];

  if (el.kind === "kpi") {
    const values = series.values;
    if (big || values.length === 1) {
      return (
        <div className="k-num k-big-num" style={{ color: "var(--k-accent)" }}>
          <CountUp value={values[0] ?? 0} unit={el.units?.[0] || el.unit} run={run} delayMs={delay} durationMs={Math.max(dur, 900)} />
        </div>
      );
    }
    return (
      <div className="grid gap-12" style={{ gridTemplateColumns: `repeat(${values.length}, minmax(0, 1fr))` }}>
        {values.map((v, i) => (
          <div key={i} className="k-kpi flex flex-col gap-5 pt-8" data-delay={delay + i * stagger * 2}>
            <div className="k-num text-[120px]" style={{ color: i === 0 ? "var(--k-accent)" : "var(--k-text)" }}>
              <CountUp value={v} unit={el.units?.[i] || el.unit} run={run} delayMs={delay + i * stagger * 2} durationMs={Math.max(dur, 900)} />
            </div>
            <div className="k-caption">{el.data.labels[i] ?? ""}</div>
          </div>
        ))}
      </div>
    );
  }

  const W = 1680;
  const H = 560;
  const padB = 60;
  const all = el.data.series.flatMap((s) => s.values);
  const max = Math.max(1, ...all);
  const n = Math.max(series.values.length, 1);
  const peak = series.values.indexOf(Math.max(...series.values));

  if (el.kind === "bar") {
    const slot = W / n;
    const bw = Math.min(170, slot * 0.62);
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full overflow-visible" role="img" aria-label={`Bar chart: ${el.data.labels.map((l, i) => `${l} ${series.values[i]}`).join(", ")}`}>
        <line x1="0" x2={W} y1={H - padB} y2={H - padB} stroke="var(--k-rule)" strokeWidth="2" />
        {series.values.map((v, i) => {
          const h = ((H - padB - 60) * v) / max;
          const x = i * slot + (slot - bw) / 2;
          const hot = i === n - 1 || i === peak;
          return (
            <g key={i}>
              <rect className="k-bar" x={x} y={H - padB - h} width={bw} height={h} rx={14} fill={hot ? "var(--k-accent)" : "var(--k-accent2)"} style={run ? { animationDelay: `${delay + i * stagger}ms`, animationDuration: `${dur}ms` } : undefined} />
              <text className={run ? "k-dot" : ""} x={x + bw / 2} y={H - padB - h - 18} textAnchor="middle" fontSize="32" fontWeight="600" fill="var(--k-text)" style={run ? { animationDelay: `${delay + i * stagger + dur}ms` } : undefined}>
                {withUnit(formatNumber(v, decimalsOf(v)), el.unit)}
              </text>
              <text x={x + bw / 2} y={H - 14} textAnchor="middle" fontSize="28" fill="var(--k-muted)">
                {el.data.labels[i] ?? ""}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }

  // line
  const step = n > 1 ? W / (n - 1) : W;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full overflow-visible" role="img" aria-label={`Line chart: ${el.data.labels.map((l, i) => `${l} ${series.values[i]}`).join(", ")}`}>
      <line x1="0" x2={W} y1={H - padB} y2={H - padB} stroke="var(--k-rule)" strokeWidth="2" />
      {el.data.series.map((s, si) => {
        const pts = s.values.map((v, i) => [i * step, H - padB - ((H - padB - 60) * v) / max] as const);
        const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");
        return (
          <g key={si}>
            {si === 0 && <path d={`${d} L${W},${H - padB} L0,${H - padB} Z`} fill="var(--k-accent)" opacity={0.1} className={run ? "k-dot" : undefined} style={run ? { animationDelay: `${delay + dur}ms` } : undefined} />}
            <path
              className="k-line"
              d={d}
              pathLength={1}
              strokeDasharray="1"
              fill="none"
              stroke={si === 0 ? "var(--k-accent)" : "var(--k-accent2)"}
              strokeWidth="7"
              strokeLinejoin="round"
              strokeLinecap="round"
              style={run ? ({ "--d": `${delay}ms`, "--dur": `${dur * 1.6}ms` } as CSSProperties) : undefined}
            />
            {si === 0 &&
              pts.map(([x, y], i) => (
                <circle key={i} className={run ? "k-dot" : ""} cx={x} cy={y} r={i === n - 1 ? 14 : 9} fill="var(--k-accent)" stroke="var(--k-bg)" strokeWidth={i === n - 1 ? 5 : 0} style={run ? { animationDelay: `${delay + ((dur * 1.6) / n) * i}ms` } : undefined} />
              ))}
          </g>
        );
      })}
      {el.data.labels.map((l, i) => (
        <text key={i} x={i * step} y={H - 14} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize="28" fill="var(--k-muted)">
          {l}
        </text>
      ))}
    </svg>
  );
}
