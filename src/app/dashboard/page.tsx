"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader, ErrorNote, UpgradeNote } from "@/components/ui/chrome";
import { RequireUser } from "@/components/auth/RequireUser";
import { SlideView } from "@/components/deck/SlideView";
import { AssetThumb, formatBytes, ImportZone, kindLabel, LibraryPicker, type ImportedDoc } from "@/components/app/assets-ui";
import { ApiError, useBackend, type DeckSummary, type Me } from "@/lib/client/backend";
import type { AssetMeta } from "@/lib/client/assets";
import { saveDraft, type DraftPhoto } from "@/lib/client/draft";
import { DECK_TYPES, type DeckType } from "@/lib/deck/schema";
import { ASSET_PREFIX } from "@/lib/deck/media";
import { getTheme, withBrand } from "@/lib/deck/themes";
import { CATEGORIES, CATEGORY_LABEL, TEMPLATES, forkDeck, templateDeck, type TemplateCategory } from "@/lib/deck/templates";

const TYPE_LABEL: Record<DeckType, string> = { pitch: "Pitch", sales: "Sales", launch: "Launch", lesson: "Lesson", report: "Report", custom: "Other" };

function relTime(iso: string) {
  const d = new Date(iso).getTime();
  if (!d) return "";
  const s = Math.round((Date.now() - d) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

const toPhoto = (a: AssetMeta): DraftPhoto => ({ id: a.id, name: a.name, src: ASSET_PREFIX + a.id, alt: a.alt || a.name });

function Meter({ label, value, max, text }: { label: string; value: number; max: number; text: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="min-w-[150px] flex-1">
      <div className="flex items-baseline justify-between gap-2 text-[12px]">
        <span className="font-medium text-ink-2">{label}</span>
        <span className="tabular text-ink-2">{text}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--ink)_8%,transparent)]" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
        <div className={`h-full rounded-full ${pct >= 90 ? "bg-warning" : "bg-accent"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Composer() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [type, setType] = useState<DeckType>("pitch");
  const [docs, setDocs] = useState<ImportedDoc[]>([]);
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const [picker, setPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const words = docs.reduce((n, d) => n + d.words, 0);
  const onImported = useCallback((d: ImportedDoc[], p: AssetMeta[]) => {
    setDocs((x) => [...x, ...d.filter((n) => !x.some((o) => o.id === n.id))]);
    setPhotos((x) => [...x, ...p.map(toPhoto).filter((n) => !x.some((o) => o.id === n.id))].slice(0, 24));
  }, []);

  function go() {
    if (!prompt.trim() && !docs.length) {
      setError("Describe your talk or add a file first.");
      return;
    }
    saveDraft({ input: { prompt: prompt.trim(), deckType: type }, docs, photos });
    router.push("/new");
  }

  return (
    <section className="rounded-[14px] border border-line bg-surface p-6 md:p-7" aria-labelledby="compose-h">
      <h2 id="compose-h" className="text-[20px] font-semibold tracking-[-0.01em]">Start a new deck</h2>
      <p className="mt-1 text-[14px] text-ink-2">Describe the talk, add your documents and photos. You&rsquo;ll check the outline before any slides are made.</p>
      <label className="mt-5 block">
        <span className="sr-only">What are you presenting?</span>
        <textarea
          className="field min-h-[96px] resize-y"
          placeholder="Quarterly results for the leadership team. Use the numbers in the attached spreadsheet."
          value={prompt}
          maxLength={4000}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") go();
          }}
        />
      </label>

      <div role="radiogroup" aria-label="Deck type" className="mt-4 flex flex-wrap gap-2">
        {DECK_TYPES.map((t) => (
          <button key={t} type="button" role="radio" aria-checked={type === t} onClick={() => setType(t)} className={`h-8 rounded-full border px-3 text-[13px] font-medium ${type === t ? "border-ink bg-ink text-canvas" : "border-line text-ink-2 hover:border-ink-2 hover:text-ink"}`}>
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      <div className="mt-5">
        <ImportZone onImported={onImported} compact />
      </div>

      {(docs.length > 0 || photos.length > 0) && (
        <div className="mt-4 space-y-3">
          {docs.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Attached files">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center gap-2 rounded-[8px] border border-line py-1 pl-3 pr-1 text-[13px]">
                  <span className="font-medium">{d.name}</span>
                  <span className="text-ink-2">{kindLabel(d.kind)} · {d.words.toLocaleString()} words</span>
                  <button type="button" className="btn btn-ghost btn-sm min-h-7 px-2" aria-label={`Remove ${d.name}`} onClick={() => setDocs((x) => x.filter((o) => o.id !== d.id))}>×</button>
                </li>
              ))}
            </ul>
          )}
          {photos.length > 0 && (
            <div>
              <p className="mb-2 text-[13px] text-ink-2">{photos.length} photo{photos.length > 1 ? "s" : ""} will be placed on slides that suit them. The first goes on the title slide.</p>
              <ul className="flex flex-wrap gap-2" aria-label="Photos for this deck">
                {photos.map((p) => (
                  <li key={p.id} className="group relative">
                    <AssetThumb id={p.id} alt={p.alt} className="h-16 w-24 rounded-[6px]" />
                    <button type="button" className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-surface text-[13px] opacity-0 focus:opacity-100 group-hover:opacity-100" aria-label={`Remove ${p.name}`} onClick={() => setPhotos((x) => x.filter((o) => o.id !== p.id))}>×</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-[13px] text-danger" role="alert">{error}</p>}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <button type="button" className="text-[14px] font-medium text-accent hover:underline" onClick={() => setPicker(true)}>Add photos from your library</button>
        <span className="flex items-center gap-3">
          {words > 0 && <span className="tabular text-[13px] text-ink-2">{words.toLocaleString()} words from files</span>}
          <button type="button" className="btn btn-primary" onClick={go}>Write the outline</button>
        </span>
      </div>
      <LibraryPicker open={picker} onClose={() => setPicker(false)} onPick={(a) => onImported([], a)} title="Photos for this deck" />
    </section>
  );
}

// ---------------------------------------------------------------------------

function TemplateRow({ onUse, busy }: { onUse: (id: string) => void; busy: string | null }) {
  const [cat, setCat] = useState<TemplateCategory | "all">("all");
  const [hover, setHover] = useState<string | null>(null);
  const list = useMemo(() => TEMPLATES.filter((t) => cat === "all" || t.category === cat).slice(0, 8), [cat]);
  return (
    <section aria-labelledby="tpl-h">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="tpl-h" className="text-[20px] font-semibold tracking-[-0.01em]">Start from a template</h2>
          <p className="mt-1 text-[14px] text-ink-2">Copy a sample deck and edit it, or keep only its design and add your own content.</p>
        </div>
        <Link href="/templates" className="text-[14px] font-medium text-accent hover:underline">All {TEMPLATES.length} templates</Link>
      </div>
      <div role="tablist" aria-label="Template type" className="mt-4 flex flex-wrap gap-2">
        {(["all", ...CATEGORIES] as const).map((c) => (
          <button key={c} type="button" role="tab" aria-selected={cat === c} onClick={() => setCat(c)} className={`h-8 rounded-full border px-3 text-[13px] font-medium ${cat === c ? "border-ink bg-ink text-canvas" : "border-line text-ink-2 hover:text-ink"}`}>
            {c === "all" ? "All" : CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>
      <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {list.map((t) => {
          const deck = templateDeck(t.id)!;
          const show = deck.slides[t.highlights?.[0] ?? 0] ?? deck.slides[0];
          const on = hover === t.id;
          return (
            <li key={t.id} className="overflow-hidden rounded-[10px] border border-line bg-surface" onMouseEnter={() => setHover(t.id)} onMouseLeave={() => setHover(null)}>
              <Link href={`/t/${t.id}`} className="block" aria-label={`Preview ${t.name}`}>
                <SlideView slide={show} theme={withBrand(getTheme(t.themeId), t.brand)} intensity={t.intensity} mode={on ? "play" : "static"} step={9} playKey={on ? "on" : "off"} />
              </Link>
              <div className="border-t border-line p-3">
                <p className="truncate text-[14px] font-medium">{t.name}</p>
                <p className="truncate text-[12px] text-ink-2">{CATEGORY_LABEL[t.category]} · {deck.slides.length} slides</p>
                <div className="mt-3 flex gap-2">
                  <Link href={`/new?look=${t.id}`} className="btn btn-secondary btn-sm flex-1 px-2">Use design</Link>
                  <button type="button" className="btn btn-ghost btn-sm flex-1 px-2" disabled={!!busy} onClick={() => onUse(t.id)}>
                    {busy === t.id ? "Copying" : "Copy deck"}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------

function DashboardInner() {
  const backend = useBackend();
  const router = useRouter();
  const [decks, setDecks] = useState<DeckSummary[] | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [assets, setAssets] = useState<AssetMeta[] | null>(null);
  const [where, setWhere] = useState<"cloud" | "browser">("cloud");
  const [error, setError] = useState<{ text: string; upgrade: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    return Promise.all([backend.listDecks(), backend.me().catch(() => null), backend.listAssets().catch(() => ({ assets: [] as AssetMeta[], where: "browser" as const }))])
      .then(([list, m, a]) => {
        setDecks(list);
        setMe(m);
        setAssets(a.assets);
        setWhere(a.where);
      })
      .catch((e) => setError({ text: e instanceof ApiError ? e.message : "Could not load your dashboard.", upgrade: false }));
  }, [backend]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([backend.listDecks(), backend.me().catch(() => null), backend.listAssets().catch(() => ({ assets: [] as AssetMeta[], where: "browser" as const }))])
      .then(([list, m, a]) => {
        if (cancelled) return;
        setDecks(list);
        setMe(m);
        setAssets(a.assets);
        setWhere(a.where);
      })
      .catch((e) => !cancelled && setError({ text: e instanceof ApiError ? e.message : "Could not load your dashboard.", upgrade: false }));
    return () => {
      cancelled = true;
    };
  }, [backend]);

  async function copyTemplate(id: string) {
    setBusy(id);
    setError(null);
    try {
      const deck = await backend.createDeck(forkDeck(templateDeck(id)!));
      router.push(`/d/${deck.id}`);
    } catch (e) {
      setError({ text: e instanceof ApiError ? e.message : "Could not copy the template.", upgrade: e instanceof ApiError && e.status === 402 });
      setBusy(null);
    }
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const recent = (decks ?? []).slice(0, 4);
  const assetBytes = (assets ?? []).reduce((n, a) => n + a.bytes, 0);

  return (
    <main className="mx-auto max-w-[1280px] space-y-12 px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em]">{greeting}</h1>
          <p className="mt-1 text-[14px] text-ink-2">
            {backend.mode === "demo" ? "Demo mode: decks and photos are saved in this browser." : me && !me.features.gemini ? "AI is running in offline mode on this server." : "Pick up where you left off, or start something new."}
          </p>
        </div>
        {me && (
          <div className="flex w-full max-w-[560px] flex-wrap gap-6 rounded-[10px] border border-line bg-surface px-4 py-3">
            {me.plan === "free" ? <Meter label="Decks" value={me.deckCount} max={3} text={`${me.deckCount} of 3`} /> : <Meter label="Decks" value={me.deckCount} max={me.deckCount || 1} text={`${me.deckCount}, unlimited`} />}
            {me.creditsRemaining !== null && <Meter label="AI credits left" value={me.creditsRemaining} max={{ free: 100, pro: 2000, team: 4000 }[me.plan]} text={me.creditsRemaining.toLocaleString()} />}
            {me.storage && <Meter label="Photo storage" value={me.storage.usedBytes} max={me.storage.limitBytes} text={`${formatBytes(me.storage.usedBytes)} of ${formatBytes(me.storage.limitBytes)}`} />}
            <Link href="/pricing" className="self-center text-[13px] font-medium capitalize text-accent hover:underline">{me.plan} plan</Link>
          </div>
        )}
      </div>

      {error && (error.upgrade ? <UpgradeNote message={error.text} /> : <ErrorNote onRetry={load}>{error.text}</ErrorNote>)}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Composer />
        <aside className="flex flex-col gap-4 rounded-[14px] border border-line bg-surface p-6" aria-labelledby="how-h">
          <h2 id="how-h" className="text-[15px] font-semibold">How it works</h2>
          <ol className="space-y-4 text-[14px]">
            {[
              ["Add your material", "A prompt, notes, or files: PDF, Word, PowerPoint, Excel. Photos inside them are kept."],
              ["Fix the outline", "Reorder, merge or delete slides. Nothing is designed until you agree with the story."],
              ["Pick a look", "One of 6 themes, or the design of any template, with your logo name."],
              ["Edit, present, download", "Ask the AI for changes in plain words, present in the browser, or download PowerPoint and PDF."],
            ].map(([t, d], i) => (
              <li key={t} className="grid grid-cols-[28px_1fr] gap-2">
                <span className="tabular flex h-6 w-6 items-center justify-center rounded-full border border-line text-[12px] font-semibold">{i + 1}</span>
                <span>
                  <span className="block font-medium">{t}</span>
                  <span className="block text-[13px] leading-[19px] text-ink-2">{d}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-auto flex flex-wrap gap-2 border-t border-line pt-4">
            <Link href="/new" className="btn btn-secondary btn-sm">Paste notes instead</Link>
            <Link href="/assets" className="btn btn-ghost btn-sm">Photo library</Link>
          </div>
        </aside>
      </div>

      <section aria-labelledby="recent-h">
        <div className="flex items-end justify-between gap-3">
          <h2 id="recent-h" className="text-[20px] font-semibold tracking-[-0.01em]">Recent decks</h2>
          {decks && decks.length > 0 && <Link href="/decks" className="text-[14px] font-medium text-accent hover:underline">All decks ({decks.length})</Link>}
        </div>
        {decks === null && !error ? (
          <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i}><div className="skeleton aspect-video" /><div className="skeleton mt-3 h-4 w-2/3" /></li>
            ))}
          </ul>
        ) : recent.length === 0 ? (
          <p className="mt-4 rounded-[10px] border border-dashed border-line px-5 py-8 text-center text-[14px] text-ink-2">No decks yet. Start one above, or copy a template below.</p>
        ) : (
          <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {recent.map((d) => (
              <li key={d.id}>
                <Link href={`/d/${d.id}`} className="block overflow-hidden rounded-[10px] border border-line bg-surface transition-shadow hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]" onMouseEnter={() => setHover(d.id)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(d.id)} onBlur={() => setHover(null)}>
                  {d.firstSlide ? <SlideView slide={d.firstSlide} theme={withBrand(getTheme(d.themeId), d.brand)} intensity={d.motionIntensity} mode={hover === d.id ? "play" : "static"} step={9} playKey={hover === d.id ? "on" : "off"} label={`First slide of ${d.title}`} /> : <div className="skeleton aspect-video" />}
                  <div className="border-t border-line px-4 py-3">
                    <p className="truncate text-[15px] font-medium">{d.title}</p>
                    <p className="text-[13px] text-ink-2">{d.slideCount} slides · edited {relTime(d.updatedAt)}</p>
                  </div>
                </Link>
                <div className="mt-2 flex gap-3 text-[13px]">
                  <Link href={`/d/${d.id}`} className="font-medium text-accent hover:underline">Edit</Link>
                  <Link href={`/d/${d.id}/present`} className="text-ink-2 hover:text-ink">Present</Link>
                  <Link href={`/d/${d.id}?export=1`} className="text-ink-2 hover:text-ink">Download</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <TemplateRow onUse={copyTemplate} busy={busy} />

      <section aria-labelledby="photos-h">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 id="photos-h" className="text-[20px] font-semibold tracking-[-0.01em]">Your photos</h2>
            <p className="mt-1 text-[14px] text-ink-2">
              {assets ? `${assets.length} photo${assets.length === 1 ? "" : "s"}, ${formatBytes(assetBytes)}` : "Loading"}
              {where === "browser" && " · saved in this browser only"}
            </p>
          </div>
          <Link href="/assets" className="text-[14px] font-medium text-accent hover:underline">Manage photos</Link>
        </div>
        {assets && assets.length > 0 ? (
          <ul className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-6 lg:grid-cols-8">
            {assets.slice(0, 8).map((a) => (
              <li key={a.id}>
                <AssetThumb id={a.id} alt={a.alt} className="aspect-[4/3] w-full rounded-[8px]" />
              </li>
            ))}
          </ul>
        ) : (
          assets && <p className="mt-4 text-[14px] text-ink-2">Photos you upload, or that we find in your files, appear here and can be placed on any slide.</p>
        )}
      </section>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <RequireUser>
      <AppHeader />
      <DashboardInner />
    </RequireUser>
  );
}
