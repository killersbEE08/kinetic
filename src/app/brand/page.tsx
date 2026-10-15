"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Plus, Star, Trash2 } from "lucide-react";
import { RequireUser } from "@/components/auth/RequireUser";
import { AppShell } from "@/components/app/AppShell";
import { AssetThumb, ImportZone } from "@/components/app/assets-ui";
import { SlideView } from "@/components/deck/SlideView";
import { Icon } from "@/components/deck/Icon";
import { ErrorNote, UpgradeNote } from "@/components/ui/chrome";
import { ApiError, useBackend, type BrandKit } from "@/lib/client/backend";
import { assetUrlNow, preloadAssets } from "@/lib/client/assets";
import { BRAND_PATTERNS, HEADING_FONTS, type Brand } from "@/lib/deck/schema";
import { ICON_NAMES } from "@/lib/deck/icons";
import { ASSET_PREFIX, assetIdOf } from "@/lib/deck/media";
import { contrastRatio, getTheme, THEMES, withBrand } from "@/lib/deck/themes";
import { dominantColors } from "@/lib/deck/palette";
import { newId } from "@/lib/deck/ids";
import { templateDeck } from "@/lib/deck/templates";

const FONT_LABEL: Record<(typeof HEADING_FONTS)[number], string> = { sans: "Inter (clean sans)", serif: "Source Serif (classic serif)", grotesk: "Space Grotesk (technical)", display: "Fraunces (expressive serif)" };
const PATTERN_LABEL: Record<(typeof BRAND_PATTERNS)[number], string> = { blocks: "Rising blocks", waves: "Waves", grid: "Dot grid", rays: "Rays", orbits: "Orbits", leaf: "Soft circles" };

/** Suggests brand colours from the uploaded logo. */
async function logoColors(assetId: string): Promise<string[]> {
  await preloadAssets([assetId]);
  const url = assetUrlNow(assetId);
  if (!url) return [];
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = Math.max(1, Math.round((64 * img.naturalHeight) / img.naturalWidth));
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return dominantColors(ctx.getImageData(0, 0, c.width, c.height).data, 3);
}

const blank = (): BrandKit => ({ id: newId("bk"), isDefault: false, kit: { name: "", primary: "#2563D9", font: "sans", mark: "rocket", pattern: "grid", showName: true } });

function Preview({ kit, themeId }: { kit: Brand; themeId: string }) {
  const sample = useMemo(() => templateDeck("ledgerly-seed")!, []);
  const theme = withBrand(getTheme(themeId), { ...kit, name: kit.name || "Your brand" });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {[0, 4].map((i) => (
        <div key={i} className="overflow-hidden rounded-[8px] border border-line">
          <SlideView slide={sample.slides[i]} theme={theme} intensity="standard" mode="static" page={i + 1} label={`Preview slide ${i + 1}`} />
        </div>
      ))}
    </div>
  );
}

function KitEditor({ initial, onSaved, onCancel }: { initial: BrandKit; onSaved: (k: BrandKit) => void; onCancel: () => void }) {
  const backend = useBackend();
  const [k, setK] = useState<BrandKit>(initial);
  const [themeId, setThemeId] = useState("mono");
  const [suggested, setSuggested] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; upgrade: boolean } | null>(null);
  const set = (patch: Partial<Brand>) => setK((x) => ({ ...x, kit: { ...x.kit, ...patch } }));
  const kit = k.kit;
  const lowContrast = contrastRatio(kit.primary, "#FFFFFF") < 3 && contrastRatio(kit.primary, "#111111") < 3;

  async function save() {
    if (!kit.name.trim()) return setError({ text: "Give the brand a name.", upgrade: false });
    setBusy(true);
    setError(null);
    try {
      const clean: BrandKit = { ...k, kit: { ...kit, name: kit.name.trim().slice(0, 40), secondary: kit.secondary || undefined } };
      await backend.saveBrandKit(clean);
      onSaved(clean);
    } catch (e) {
      setError({ text: e instanceof ApiError ? e.message : "Could not save the brand kit.", upgrade: e instanceof ApiError && e.status === 402 });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[14px] border border-line bg-surface p-5" aria-label="Edit brand kit">
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <label className="block text-[13px] font-medium">
            Brand name
            <input className="field mt-1" value={kit.name} maxLength={40} placeholder="Acme" onChange={(e) => set({ name: e.target.value })} />
          </label>

          <div>
            <p className="mb-1.5 text-[13px] font-medium">Logo</p>
            {kit.logo ? (
              <div className="flex items-center gap-3">
                <AssetThumb id={assetIdOf(kit.logo)!} alt="Logo" className="h-14 w-28 rounded-[6px] border border-line bg-[repeating-conic-gradient(#f2f2f4_0_25%,#fff_0_50%)] object-contain [background-size:12px_12px]" /* slop-lint-ignore: transparency checkerboard */ />
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-[13px]">
                    <input type="checkbox" className="h-4 w-4" checked={kit.showName !== false} onChange={(e) => set({ showName: e.target.checked })} />
                    Show the name next to it
                  </label>
                  <button type="button" className="btn btn-ghost btn-sm min-h-7 px-2 text-[12px]" onClick={() => set({ logo: undefined })}>Remove logo</button>
                </div>
              </div>
            ) : (
              <ImportZone
                allowDocs={false}
                compact
                onImported={async (_, photos) => {
                  const p = photos[0];
                  if (!p) return;
                  set({ logo: ASSET_PREFIX + p.id, name: kit.name || p.name.slice(0, 40) });
                  const colors = await logoColors(p.id).catch(() => []);
                  setSuggested(colors);
                  if (colors[0]) set({ primary: colors[0], secondary: colors[1] });
                }}
              >
                <span className="text-[13px] font-medium">Drop your logo, or <span className="text-accent underline">browse</span></span>
                <span className="text-[12px] text-ink-2">PNG with a transparent background works best. We pick colours from it.</span>
              </ImportZone>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {(["primary", "secondary"] as const).map((key) => (
              <label key={key} className="text-[13px] font-medium">
                {key === "primary" ? "Main colour" : "Second colour"}
                <span className="mt-1 flex items-center gap-2">
                  <input type="color" className="h-9 w-10 cursor-pointer rounded-[6px] border border-line bg-surface p-0.5" value={kit[key] ?? "#9A9EA6"} onChange={(e) => set({ [key]: e.target.value.toUpperCase() })} aria-label={key === "primary" ? "Main colour" : "Second colour"} />
                  <input className="field tabular h-9 py-0 text-[13px] uppercase" value={kit[key] ?? ""} placeholder={key === "secondary" ? "Auto" : ""} maxLength={7} onChange={(e) => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && (e.target.value.length === 7 || key === "secondary") && set({ [key]: e.target.value.length === 7 ? e.target.value.toUpperCase() : undefined })} />
                </span>
              </label>
            ))}
          </div>
          {suggested.length > 0 && (
            <div className="flex items-center gap-1.5 text-[12px] text-ink-2">
              From your logo:
              {suggested.map((c) => (
                <button key={c} type="button" title={c} aria-label={`Use ${c}`} className="h-6 w-6 rounded-full border border-line" style={{ background: c }} onClick={() => set({ primary: c })} />
              ))}
            </div>
          )}
          {lowContrast && <p className="text-[12px] text-warning">This colour is hard to read text on. Pick a darker or brighter shade.</p>}

          <label className="block text-[13px] font-medium">
            Heading font
            <select className="field mt-1" value={kit.font ?? "sans"} onChange={(e) => set({ font: e.target.value as Brand["font"] })}>
              {HEADING_FONTS.map((f) => <option key={f} value={f}>{FONT_LABEL[f]}</option>)}
            </select>
          </label>
          <label className="block text-[13px] font-medium">
            Pattern on title and closing slides
            <select className="field mt-1" value={kit.pattern} onChange={(e) => set({ pattern: e.target.value as Brand["pattern"] })}>
              {BRAND_PATTERNS.map((p) => <option key={p} value={p}>{PATTERN_LABEL[p]}</option>)}
            </select>
          </label>
          {!kit.logo && (
            <div>
              <p className="mb-1.5 text-[13px] font-medium">Icon (used when there&rsquo;s no logo)</p>
              <div className="grid max-h-[120px] grid-cols-10 gap-1 overflow-y-auto">
                {ICON_NAMES.map((n) => (
                  <button key={n} type="button" aria-label={n.replace(/-/g, " ")} title={n.replace(/-/g, " ")} aria-pressed={kit.mark === n} onClick={() => set({ mark: n })} className={`flex h-7 items-center justify-center rounded-[6px] ${kit.mark === n ? "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]" : "hover:bg-[color-mix(in_srgb,var(--ink)_7%,transparent)]"}`}>
                    <Icon name={n} size={15} />
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" className="h-4 w-4" checked={k.isDefault} onChange={(e) => setK((x) => ({ ...x, isDefault: e.target.checked }))} />
            Use for new decks by default
          </label>
          {error && (error.upgrade ? <UpgradeNote message={error.text} /> : <ErrorNote>{error.text}</ErrorNote>)}
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy}>{busy ? "Saving" : "Save brand kit"}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
          </div>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[13px] font-medium">Preview</p>
            <select className="field h-8 w-auto py-0 text-[12px]" aria-label="Preview on theme" value={themeId} onChange={(e) => setThemeId(e.target.value)}>
              {THEMES.map((t) => <option key={t.id} value={t.id}>{t.name} theme</option>)}
            </select>
          </div>
          <Preview kit={kit} themeId={themeId} />
          <p className="mt-2 text-[12px] text-ink-2">Your colours replace the theme&rsquo;s accent colours; the theme still sets the background. Logos and fonts carry into PowerPoint and PDF downloads.</p>
        </div>
      </div>
    </section>
  );
}

function BrandInner() {
  const backend = useBackend();
  const [kits, setKits] = useState<BrandKit[] | null>(null);
  const [editing, setEditing] = useState<BrandKit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    backend
      .listBrandKits()
      .then(setKits)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load brand kits."));
  }, [backend]);
  useEffect(() => {
    load();  
  }, [load]);

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-8 sm:px-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Brand kits</h1>
          <p className="mt-1 text-[14px] text-ink-2">Your logo, colours, heading font and pattern, applied to any deck in one click.</p>
        </div>
        {!editing && <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing(blank())}><Plus size={15} aria-hidden="true" />New brand kit</button>}
      </div>
      <div className="mt-6 space-y-4">
        {error && <ErrorNote onRetry={load}>{error}</ErrorNote>}
        {editing && (
          <KitEditor
            key={editing.id}
            initial={editing}
            onCancel={() => setEditing(null)}
            onSaved={(k) => {
              setKits((all) => {
                const rest = (all ?? []).filter((x) => x.id !== k.id).map((x) => (k.isDefault ? { ...x, isDefault: false } : x));
                return [...rest, k];
              });
              setEditing(null);
            }}
          />
        )}
        {kits === null && !error ? (
          <div className="skeleton h-[160px] rounded-[14px]" aria-busy="true" />
        ) : kits && kits.length === 0 && !editing ? (
          <div className="rounded-[14px] border border-dashed border-line p-8 text-center">
            <p className="text-[15px] font-medium">No brand kits yet</p>
            <p className="mt-1 text-[13px] text-ink-2">Add your logo and colours once; new decks and downloads use them automatically.</p>
            <button type="button" className="btn btn-primary btn-sm mt-4" onClick={() => setEditing(blank())}>Create a brand kit</button>
          </div>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {kits?.map((k) => (
              <li key={k.id} className="rounded-[14px] border border-line bg-surface p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="h-5 w-5 rounded-full" style={{ background: k.kit.primary }} aria-hidden="true" />
                  {k.kit.secondary && <span className="-ml-3 h-5 w-5 rounded-full border-2 border-surface" style={{ background: k.kit.secondary }} aria-hidden="true" />}
                  <span className="text-[15px] font-semibold">{k.kit.name}</span>
                  {k.isDefault && <span className="inline-flex items-center gap-1 rounded-full bg-canvas px-2 py-0.5 text-[11px] text-ink-2"><Star size={11} aria-hidden="true" />Default</span>}
                  <span className="ml-auto flex gap-1">
                    {!k.isDefault && (
                      <button type="button" className="btn btn-ghost btn-sm min-h-7 px-2 text-[12px]" onClick={async () => { const next = { ...k, isDefault: true }; await backend.saveBrandKit(next).catch(() => undefined); setKits((all) => all?.map((x) => (x.id === k.id ? next : { ...x, isDefault: false })) ?? null); }}>
                        <Check size={12} aria-hidden="true" />Make default
                      </button>
                    )}
                    <button type="button" className="btn btn-secondary btn-sm min-h-7 px-2 text-[12px]" onClick={() => setEditing(k)}>Edit</button>
                    <button type="button" className="btn btn-ghost btn-sm min-h-7 px-2 text-danger" aria-label={`Delete ${k.kit.name}`} onClick={async () => { if (!window.confirm(`Delete "${k.kit.name}"? Decks that already use it keep their look.`)) return; await backend.deleteBrandKit(k.id).catch(() => undefined); setKits((all) => all?.filter((x) => x.id !== k.id) ?? null); }}>
                      <Trash2 size={13} aria-hidden="true" />
                    </button>
                  </span>
                </div>
                <Preview kit={k.kit} themeId="mono" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

export default function BrandPage() {
  return (
    <RequireUser>
      <AppShell>
        <BrandInner />
      </AppShell>
    </RequireUser>
  );
}
