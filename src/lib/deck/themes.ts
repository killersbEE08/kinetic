// Slide themes (docs/02 §6.3). No gradients by rule (docs/06 §6).
// Colors are chosen so text/background contrast passes WCAG AA; see qa.test.ts.
import type { Brand } from "./schema";

export interface Theme {
  id: string;
  name: string;
  description: string;
  colors: {
    bg: string;
    surface: string;
    text: string;
    muted: string;
    accent: string;
    accent2: string;
    rule: string;
  };
  headingFont: "sans" | "serif" | "grotesk" | "display";
  headingWeight: number;
  headingTracking: string; // CSS letter-spacing
  headingCase: "none" | "uppercase";
  /** Present when the deck has a brand kit: logo, pattern and footer are drawn. */
  brand?: { name: string; mark: string; pattern: string; onPrimary: string; logo?: string; showName: boolean };
}

export const THEMES: Theme[] = [
  {
    id: "mono",
    name: "Mono",
    description: "Editorial black on white",
    colors: { bg: "#FFFFFF", surface: "#F5F5F7", text: "#111111", muted: "#5B5B60", accent: "#111111", accent2: "#8A8A8F", rule: "#E2E2E6" },
    headingFont: "sans",
    headingWeight: 600,
    headingTracking: "-0.03em",
    headingCase: "none",
  },
  {
    id: "studio",
    name: "Studio",
    description: "Warm neutral with serif headings",
    colors: { bg: "#F4EFE8", surface: "#EAE3D9", text: "#2A2420", muted: "#6B5F55", accent: "#A2461F", accent2: "#C9A27E", rule: "#DCD2C4" },
    headingFont: "serif",
    headingWeight: 500,
    headingTracking: "-0.015em",
    headingCase: "none",
  },
  {
    id: "night",
    name: "Night",
    description: "Dark solid surfaces, one accent",
    colors: { bg: "#0E0F12", surface: "#1A1C21", text: "#F2F3F5", muted: "#A3A7B0", accent: "#4C8DFF", accent2: "#6B7280", rule: "#2A2D34" },
    headingFont: "sans",
    headingWeight: 600,
    headingTracking: "-0.025em",
    headingCase: "none",
  },
  {
    id: "grid",
    name: "Grid",
    description: "Swiss layout, bold type",
    colors: { bg: "#FFFFFF", surface: "#F0F0F0", text: "#000000", muted: "#4A4A4A", accent: "#E0281B", accent2: "#000000", rule: "#000000" },
    headingFont: "sans",
    headingWeight: 700,
    headingTracking: "-0.04em",
    headingCase: "none",
  },
  {
    id: "paper",
    name: "Paper",
    description: "Light and friendly",
    colors: { bg: "#FBFAF7", surface: "#F1EEE6", text: "#1F2A37", muted: "#5A6472", accent: "#1F7A5C", accent2: "#E3A33B", rule: "#E4E0D6" },
    headingFont: "serif",
    headingWeight: 600,
    headingTracking: "-0.01em",
    headingCase: "none",
  },
  {
    id: "signal",
    name: "Signal",
    description: "High contrast, technical",
    colors: { bg: "#000000", surface: "#111111", text: "#FFFFFF", muted: "#B5B5B5", accent: "#D4FF3A", accent2: "#5E5E5E", rule: "#262626" },
    headingFont: "sans",
    headingWeight: 600,
    headingTracking: "-0.02em",
    headingCase: "uppercase",
  },
];

export const THEME_IDS = THEMES.map((t) => t.id);

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

// ---- WCAG contrast helpers (used by QA gates and tests) ----
function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((x) => x + x).join("") : h, 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Text colour to put on top of a filled colour (logo chips, buttons). */
export function onColor(fill: string): string {
  // White reads best on mid and dark brand colours; only very light fills get dark text.
  return contrastRatio("#FFFFFF", fill) >= 3 ? "#FFFFFF" : "#0B0B0C";
}

/** Theme with a brand kit applied. Brand colours replace the accents; the background stays. */
export function withBrand(theme: Theme, brand?: Brand | null): Theme {
  if (!brand) return theme;
  return {
    ...theme,
    colors: { ...theme.colors, accent: brand.primary, accent2: brand.secondary ?? mix(brand.primary, theme.colors.bg, 0.55) },
    headingFont: brand.font ?? theme.headingFont,
    headingCase: brand.font && brand.font !== theme.headingFont ? "none" : theme.headingCase,
    brand: { name: brand.name, mark: brand.mark, pattern: brand.pattern, onPrimary: onColor(brand.primary), logo: brand.logo, showName: brand.showName ?? true },
  };
}

/** The theme a deck renders with. */
export function deckTheme(deck: { themeId: string; brand?: Brand | null }): Theme {
  return withBrand(getTheme(deck.themeId), deck.brand);
}

/** Blend two hex colours (t = share of b). */
export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return "#" + [16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("").toUpperCase();
}
