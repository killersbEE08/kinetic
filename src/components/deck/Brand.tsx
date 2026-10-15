"use client";

// Brand pieces drawn on slides: the logo, a decorative pattern for opening/closing slides,
// and a quiet footer for content slides. All vector, all theme-aware.
import type { CSSProperties } from "react";
import type { Theme } from "@/lib/deck/themes";
import { Icon } from "./Icon";
import { useAssetUrl } from "@/lib/client/assets";

function LogoImage({ src, size }: { src: string; size: number }) {
  const url = useAssetUrl(src);
  if (!url || url === "missing") return <span className="inline-block flex-none" style={{ width: size, height: size }} aria-hidden="true" />;
  // eslint-disable-next-line @next/next/no-img-element -- blob: URL of the uploaded logo
  return <img src={url} alt="" draggable={false} className="block flex-none object-contain" style={{ height: size, width: "auto", maxWidth: size * 5 }} />;
}

export function Logo({ theme, size = 56, showName = true, className = "" }: { theme: Theme; size?: number; showName?: boolean; className?: string }) {
  const b = theme.brand;
  if (!b) return null;
  const withName = showName && b.showName;
  return (
    <span className={`inline-flex items-center ${className}`} style={{ gap: size * 0.32 }}>
      {b.logo ? (
        <LogoImage src={b.logo} size={size} />
      ) : (
        <span className="inline-flex flex-none items-center justify-center" style={{ width: size, height: size, borderRadius: size * 0.28, background: theme.colors.accent }}>
          <Icon name={b.mark} size={size * 0.58} stroke={2} color={b.onPrimary} />
        </span>
      )}
      {withName && (
        <span className="k-h" style={{ fontSize: size * 0.62, letterSpacing: "-0.02em", lineHeight: 1, textTransform: "none" }}>
          {b.name}
        </span>
      )}
    </span>
  );
}

export function Footer({ theme, page, left = 120 }: { theme: Theme; page?: number; left?: number }) {
  if (!theme.brand && page === undefined) return null;
  return (
    <div className="absolute bottom-[44px] right-[120px] flex items-center justify-between" style={{ color: "var(--k-muted)", left }}>
      {theme.brand ? <Logo theme={theme} size={34} /> : <span />}
      {page !== undefined && <span className="tabular text-[22px] font-medium">{String(page).padStart(2, "0")}</span>}
    </div>
  );
}

// Deterministic pseudo-random so patterns are identical on server and client.
function rand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Decorative brand pattern. "hero" fills the right of a title slide; "corner" sits
 * bottom-right on statement and closing slides. `run` plays the draw-in animation.
 */
export function Decor({ theme, variant, run, delay = 0 }: { theme: Theme; variant: "hero" | "corner"; run: boolean; delay?: number }) {
  const pattern = theme.brand?.pattern;
  if (!pattern) return null;
  const a = theme.colors.accent;
  const m = theme.colors.muted;
  const anim = (i: number, cls = "k-line"): { className?: string; style?: CSSProperties } =>
    run ? { className: cls, style: { "--d": `${delay + i * 90}ms`, "--dur": "1400ms", animationDelay: `${delay + i * 90}ms` } as CSSProperties } : {};
  const group = variant === "corner" && pattern !== "waves" ? "translate(1800 940) scale(0.5) translate(-1920 -1080)" : undefined;
  let shapes: React.ReactNode = null;

  switch (pattern) {
    case "blocks": {
      shapes = Array.from({ length: 6 }).map((_, i) => {
        const h = 170 + i * 110;
        return (
          <rect key={i} x={1130 + i * 115} y={1000 - h} width={84} height={h} rx={18} fill={a} opacity={0.18 + i * 0.16} className={run ? "k-bar" : undefined} style={run ? { animationDelay: `${delay + i * 80}ms`, animationDuration: "900ms" } : undefined} />
        );
      });
      break;
    }
    case "waves": {
      shapes = Array.from({ length: 7 }).map((_, i) => {
        // Hero: a band across the top (titles sit at the bottom). Corner: the bottom edge.
        const y = (variant === "hero" ? 70 : 760) + i * 46;
        const amp = 38 - i * 3;
        let d = `M0 ${y}`;
        for (let x = 0; x <= 1920; x += 40) d += ` L${x} ${(y + Math.sin((x / 1920) * Math.PI * 3 + i * 0.6) * amp).toFixed(1)}`;
        const p = anim(i);
        return <path key={i} d={d} fill="none" stroke={i % 3 === 0 ? a : m} strokeOpacity={i % 3 === 0 ? 0.9 : 0.28} strokeWidth={i % 3 === 0 ? 4 : 2} pathLength={1} strokeDasharray="1" {...p} />;
      });
      break;
    }
    case "grid": {
      const r = rand(7);
      const cells: React.ReactNode[] = [];
      for (let cx = 0; cx < 12; cx++)
        for (let cy = 0; cy < 13; cy++) {
          const x = 1140 + cx * 58;
          const y = 120 + cy * 66;
          const v = r();
          if (v > 0.9) cells.push(<rect key={`${cx}-${cy}`} x={x - 18} y={y - 18} width={36} height={36} rx={6} fill={a} {...anim(cx + cy, "k-fadein")} />);
          else cells.push(<circle key={`${cx}-${cy}`} cx={x} cy={y} r={4} fill={m} opacity={0.35} />);
        }
      shapes = cells;
      break;
    }
    case "rays": {
      shapes = (
        <>
          {Array.from({ length: 13 }).map((_, i) => {
            const ang = Math.PI + (i / 12) * (Math.PI / 2);
            return <line key={i} x1={1920} y1={1080} x2={1920 + Math.cos(ang) * 980} y2={1080 + Math.sin(ang) * 980} stroke={i % 4 === 0 ? a : m} strokeOpacity={i % 4 === 0 ? 0.9 : 0.25} strokeWidth={i % 4 === 0 ? 4 : 2} pathLength={1} strokeDasharray="1" {...anim(i)} />;
          })}
          <circle cx={1920} cy={1080} r={260} fill={a} opacity={0.9} {...anim(14, "k-fadein")} />
        </>
      );
      break;
    }
    case "orbits": {
      shapes = Array.from({ length: 5 }).map((_, i) => {
        const rr = 130 + i * 95;
        const p = anim(i);
        const t = 0.6 + i * 0.9;
        return (
          <g key={i}>
            <circle cx={1480} cy={540} r={rr} fill="none" stroke={i === 2 ? a : m} strokeOpacity={i === 2 ? 0.9 : 0.3} strokeWidth={i === 2 ? 4 : 2} pathLength={1} strokeDasharray="1" {...p} />
            <circle cx={1480 + Math.cos(t) * rr} cy={540 + Math.sin(t) * rr} r={i === 2 ? 16 : 9} fill={i === 2 ? a : m} {...anim(i + 6, "k-fadein")} />
          </g>
        );
      });
      break;
    }
    case "leaf": {
      shapes = [
        [1500, 430, 330, 0.16],
        [1700, 700, 260, 0.26],
        [1330, 780, 200, 0.4],
        [1760, 300, 150, 0.9],
      ].map(([x, y, rr, o], i) => <circle key={i} cx={x} cy={y} r={rr} fill={a} opacity={o} {...anim(i, "k-pop")} />);
      break;
    }
  }

  return (
    <svg className={`pointer-events-none absolute inset-0 h-full w-full ${run ? "k-run" : ""}`} viewBox="0 0 1920 1080" aria-hidden="true">
      <g transform={group}>{shapes}</g>
    </svg>
  );
}
