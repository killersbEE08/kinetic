"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MoreHorizontal, Play, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { ErrorNote, UpgradeNote } from "@/components/ui/chrome";
import { AppShell } from "@/components/app/AppShell";
import { RequireUser } from "@/components/auth/RequireUser";
import { SlideView } from "@/components/deck/SlideView";
import { DropMenu, MenuSep, menuItem } from "@/components/editor/ui";
import { ApiError, useBackend, type DeckSummary, type Me } from "@/lib/client/backend";
import { deckTheme, getTheme, withBrand } from "@/lib/deck/themes";
import { TEMPLATES, forkDeck, templateDeck } from "@/lib/deck/templates";

function relTime(iso: string) {
  const d = new Date(iso).getTime();
  if (!d) return "";
  const s = Math.round((Date.now() - d) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
const daysLeft = (iso?: string) => (iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)) : 0);

function Thumb({ deck, play }: { deck: DeckSummary; play: boolean }) {
  return deck.firstSlide ? (
    <SlideView slide={deck.firstSlide} theme={withBrand(getTheme(deck.themeId), deck.brand)} intensity={deck.motionIntensity} mode={play ? "play" : "static"} step={9} playKey={play ? "on" : "off"} label={`First slide of ${deck.title}`} />
  ) : (
    <div className="skeleton aspect-video" />
  );
}

function DeckCard({ deck, onDelete }: { deck: DeckSummary; onDelete: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <li className="group relative" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <Link href={`/d/${deck.id}`} className="block rounded-[14px] outline-offset-4" onFocus={() => setHover(true)} onBlur={() => setHover(false)}>
        <div className="overflow-hidden rounded-[12px] border border-line shadow-[0_1px_2px_rgba(16,17,20,.05)] transition-shadow group-hover:shadow-[0_12px_28px_-12px_rgba(16,17,20,.28)]">
          <Thumb deck={deck} play={hover} />
        </div>
        <span className="mt-2.5 block px-0.5">
          <span className="block truncate text-[14px] font-semibold">{deck.title}</span>
          <span className="tabular block text-[12px] text-ink-2">
            {deck.slideCount} slides · edited {relTime(deck.updatedAt)}
            {(deck.suggestedCount ?? 0) > 0 && <span className="text-warning"> · {deck.suggestedCount} to check</span>}
          </span>
        </span>
      </Link>
      <div className="absolute right-2.5 top-2.5 flex gap-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <Link href={`/d/${deck.id}/present`} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[rgba(16,17,20,.78)] px-3 text-[12px] font-medium text-white" aria-label={`Present ${deck.title}`}>
          <Play size={12} fill="currentColor" aria-hidden="true" />
          Present
        </Link>
        <DropMenu
          align="right"
          label={`${deck.title} actions`}
          trigger={({ toggle, open }) => (
            <button type="button" onClick={toggle} aria-expanded={open} aria-label={`More actions for ${deck.title}`} className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(16,17,20,.78)] text-white">
              <MoreHorizontal size={15} aria-hidden="true" />
            </button>
          )}
        >
          {(close) => (
            <>
              <Link role="menuitem" className={menuItem} href={`/d/${deck.id}`} onClick={close}>Open editor</Link>
              <Link role="menuitem" className={menuItem} href={`/d/${deck.id}?export=1`} onClick={close}>Download</Link>
              <Link role="menuitem" className={menuItem} href={`/d/${deck.id}?share=1`} onClick={close}>Share</Link>
              <Link role="menuitem" className={menuItem} href={`/d/${deck.id}?history=1`} onClick={close}>Version history</Link>
              <MenuSep />
              <button type="button" role="menuitem" className={`${menuItem} text-danger`} onClick={() => (close(), onDelete())}>
                <Trash2 size={14} aria-hidden="true" />
                Move to Trash
              </button>
            </>
          )}
        </DropMenu>
      </div>
    </li>
  );
}

function TrashRow({ deck, busy, onRestore, onPurge }: { deck: DeckSummary; busy: boolean; onRestore: () => void; onPurge: () => void }) {
  const left = daysLeft(deck.purgeAt);
  return (
    <li className="flex items-center gap-4 px-4 py-3">
      <div className="w-[120px] flex-none overflow-hidden rounded-[8px] border border-line opacity-80">
        <Thumb deck={deck} play={false} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold">{deck.title}</p>
        <p className="tabular text-[12px] text-ink-2">
          {deck.slideCount} slides · deleted {relTime(deck.deletedAt ?? deck.updatedAt)} · <span className={left <= 3 ? "text-warning" : ""}>deleted for good in {left} day{left === 1 ? "" : "s"}</span>
        </p>
      </div>
      <button type="button" className="btn btn-secondary btn-sm gap-1.5" onClick={onRestore} disabled={busy}>
        <RotateCcw size={14} aria-hidden="true" />
        Restore
      </button>
      <button type="button" className="btn btn-ghost btn-sm text-danger" onClick={onPurge} disabled={busy}>
        Delete forever
      </button>
    </li>
  );
}

type View = "all" | "trash";

function ViewFromUrl({ onView }: { onView: (v: View) => void }) {
  const v = useSearchParams().get("view");
  useEffect(() => onView(v === "trash" ? "trash" : "all"), [v, onView]);
  return null;
}

function DecksInner() {
  const backend = useBackend();
  const router = useRouter();
  const [view, setView] = useState<View>("all");
  const [decks, setDecks] = useState<DeckSummary[] | null>(null);
  const [trash, setTrash] = useState<DeckSummary[] | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<{ text: string; upgrade: boolean } | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "title" | "slides">("recent");
  const [busy, setBusy] = useState<string | null>(null);
  const [undo, setUndo] = useState<DeckSummary | null>(null);
  const [reload, setReload] = useState(0);

  const fail = (e: unknown, text: string) => setError({ text: e instanceof ApiError ? e.message : text, upgrade: e instanceof ApiError && e.status === 402 });

  useEffect(() => {
    let cancelled = false;
    Promise.all([backend.listDecks(), backend.listTrash().catch(() => [] as DeckSummary[]), backend.me().catch(() => null)])
      .then(([list, t, m]) => {
        if (cancelled) return;
        setError(null);
        setDecks(list);
        setTrash(t);
        setMe(m);
      })
      .catch((e) => !cancelled && setError({ text: e instanceof ApiError ? e.message : "Could not load your decks.", upgrade: false }));
    return () => {
      cancelled = true;
    };
  }, [backend, reload]);

  // The "Moved to Trash" notice disappears after a while.
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 8000);
    return () => clearTimeout(t);
  }, [undo]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (view === "trash" ? (trash ?? []) : (decks ?? [])).filter((d) => !q || d.title.toLowerCase().includes(q));
    if (sort === "title") return [...list].sort((a, b) => a.title.localeCompare(b.title));
    if (sort === "slides") return [...list].sort((a, b) => b.slideCount - a.slideCount);
    return list;
  }, [decks, trash, query, sort, view]);

  async function remove(d: DeckSummary) {
    setError(null);
    try {
      await backend.deleteDeck(d.id);
      setDecks((l) => l?.filter((x) => x.id !== d.id) ?? null);
      setTrash((t) => [{ ...d, deletedAt: new Date().toISOString(), purgeAt: new Date(Date.now() + 30 * 86_400_000).toISOString() }, ...(t ?? [])]);
      setUndo(d);
    } catch (e) {
      fail(e, "Could not move the deck to Trash.");
    }
  }

  async function restore(d: DeckSummary) {
    setBusy(d.id);
    setError(null);
    try {
      await backend.restoreDeck(d.id);
      setTrash((t) => t?.filter((x) => x.id !== d.id) ?? null);
      setDecks((l) => [{ ...d, deletedAt: undefined, purgeAt: undefined }, ...(l ?? [])]);
      setUndo((u) => (u?.id === d.id ? null : u));
    } catch (e) {
      fail(e, "Could not restore the deck.");
    } finally {
      setBusy(null);
    }
  }

  async function purge(list: DeckSummary[]) {
    if (!list.length) return;
    const what = list.length === 1 ? `"${list[0].title}"` : `all ${list.length} decks in Trash`;
    if (!window.confirm(`Delete ${what} for good? Its versions and share links are deleted too. This can't be undone.`)) return;
    setBusy("purge");
    setError(null);
    try {
      for (const d of list) {
        await backend.purgeDeck(d.id);
        setTrash((t) => t?.filter((x) => x.id !== d.id) ?? null);
      }
    } catch (e) {
      fail(e, "Could not delete the deck.");
    } finally {
      setBusy(null);
    }
  }

  async function openSample() {
    setBusy("sample");
    setError(null);
    try {
      const deck = await backend.createDeck(forkDeck(templateDeck("ledgerly-seed")!));
      router.push(`/d/${deck.id}`);
    } catch (e) {
      fail(e, "Could not create the sample deck.");
      setBusy(null);
    }
  }

  const sample = useMemo(() => templateDeck("ledgerly-seed")!, []);
  const atLimit = me?.plan === "free" && me.deckCount >= 3;
  const tabs: { id: View; label: string; count: number | null }[] = [
    { id: "all", label: "All decks", count: decks?.length ?? null },
    { id: "trash", label: "Trash", count: trash?.length ?? null },
  ];

  return (
    <main className="mx-auto max-w-[1180px] px-4 pb-16 pt-8 sm:px-10">
      <Suspense fallback={null}>
        <ViewFromUrl onView={setView} />
      </Suspense>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-semibold leading-[1.15] tracking-[-0.025em]">Decks</h1>
          {me && (
            <p className="mt-1.5 text-[13px] text-ink-2">
              <span className="capitalize">{me.plan}</span> plan{me.plan === "free" && ` · ${me.deckCount} of 3 decks`}
              {me.creditsRemaining !== null && ` · ${me.creditsRemaining.toLocaleString()} AI credits left`}
              {!me.features.gemini && " · AI is running in offline mode"}
            </p>
          )}
        </div>
        <Link href="/new" className="btn btn-primary btn-sm gap-1.5" aria-disabled={atLimit}>
          <Plus size={15} aria-hidden="true" />
          New deck
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-line">
        <div role="tablist" aria-label="Decks" className="-mb-px flex gap-5">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={view === t.id}
              onClick={() => {
                setView(t.id);
                router.replace(t.id === "trash" ? "/decks?view=trash" : "/decks", { scroll: false });
              }}
              className={`flex items-center gap-1.5 border-b-2 pb-2.5 text-[14px] font-medium ${view === t.id ? "border-ink text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}
            >
              {t.id === "trash" && <Trash2 size={14} aria-hidden="true" />}
              {t.label}
              {t.count !== null && <span className="tabular rounded-full bg-[color-mix(in_srgb,var(--ink)_7%,transparent)] px-1.5 text-[11px]">{t.count}</span>}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 pb-2">
          <label className="relative">
            <span className="sr-only">Search decks</span>
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-2" aria-hidden="true" />
            <input type="search" placeholder="Search by title" value={query} onChange={(e) => setQuery(e.target.value)} className="field h-8 w-52 py-0 pl-8 text-[13px]" />
          </label>
          {view === "all" ? (
            <label>
              <span className="sr-only">Sort</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="field h-8 w-auto py-0 text-[13px]">
                <option value="recent">Last edited</option>
                <option value="title">Title</option>
                <option value="slides">Most slides</option>
              </select>
            </label>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm min-h-8 text-danger" disabled={!trash?.length || !!busy} onClick={() => purge(trash ?? [])}>
              Empty Trash
            </button>
          )}
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {error && (error.upgrade ? <UpgradeNote message={error.text} /> : <ErrorNote onRetry={() => setReload((r) => r + 1)}>{error.text}</ErrorNote>)}
        {atLimit && view === "all" && <UpgradeNote message="You've used all 3 decks on the Free plan. Your decks stay editable; upgrade to create more." />}
      </div>

      {view === "trash" ? (
        trash === null ? (
          <div className="skeleton mt-6 h-[180px] rounded-[14px]" aria-busy="true" />
        ) : shown.length === 0 ? (
          <div className="mt-8 rounded-[14px] border border-dashed border-line px-6 py-12 text-center">
            <p className="text-[15px] font-semibold">{query ? `No deleted decks match "${query}"` : "Trash is empty"}</p>
            <p className="mt-1 text-[13px] text-ink-2">Deleted decks stay here for 30 days, so you can restore them. Their share links stop working until you do.</p>
          </div>
        ) : (
          <>
            <p className="mt-6 text-[13px] text-ink-2">Decks in Trash are deleted for good 30 days after you delete them. Their share links don&rsquo;t work while they&rsquo;re here.</p>
            <ul className="mt-3 divide-y divide-line rounded-[14px] border border-line bg-surface">
              {shown.map((d) => <TrashRow key={d.id} deck={d} busy={busy === d.id || busy === "purge"} onRestore={() => restore(d)} onPurge={() => purge([d])} />)}
            </ul>
          </>
        )
      ) : decks === null && !error ? (
        <ul className="mt-8 grid grid-cols-2 gap-x-5 gap-y-6 lg:grid-cols-4" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i}>
              <div className="skeleton aspect-video rounded-[12px]" />
              <div className="skeleton mt-3 h-4 w-2/3" />
            </li>
          ))}
        </ul>
      ) : decks && decks.length === 0 ? (
        // Empty state shows a real example, not an illustration (docs/06 §5).
        <section className="mt-8 grid gap-8 rounded-[18px] border border-line bg-surface p-8 md:grid-cols-[1.2fr_1fr] md:items-center">
          <div className="overflow-hidden rounded-[10px] border border-line">
            <SlideView slide={sample.slides[4]} theme={deckTheme(sample)} intensity="standard" mode="play" step={9} label="Sample deck" />
          </div>
          <div>
            <h2 className="text-[22px] font-semibold tracking-[-0.01em]">Start with your notes, or open a sample</h2>
            <p className="mt-2 text-[15px] leading-[22px] text-ink-2">Paste a memo or describe the talk and Kinetic will outline it first. The sample is a {sample.slides.length}-slide seed pitch for a fictional company you can edit freely.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/new" className="btn btn-primary">New deck</Link>
              <button type="button" className="btn btn-secondary" onClick={openSample} disabled={!!busy}>
                {busy === "sample" ? "Opening" : "Copy the sample deck"}
              </button>
              <Link href="/templates" className="btn btn-ghost">Browse all {TEMPLATES.length} templates</Link>
            </div>
          </div>
        </section>
      ) : (
        <ul className="mt-6 grid grid-cols-2 gap-x-5 gap-y-7 lg:grid-cols-4">
          {shown.map((d) => <DeckCard key={d.id} deck={d} onDelete={() => remove(d)} />)}
          {shown.length === 0 && <li className="col-span-full text-[14px] text-ink-2">No decks match &ldquo;{query}&rdquo;.</li>}
        </ul>
      )}

      {undo && (
        <div role="status" className="fixed bottom-24 left-1/2 z-40 flex -translate-x-1/2 items-center gap-4 rounded-[12px] bg-ink px-4 py-2.5 text-[13px] text-canvas shadow-[0_12px_32px_-8px_rgba(0,0,0,.4)] md:bottom-6">
          <span>
            Moved <b className="font-semibold">{undo.title}</b> to Trash
          </span>
          <button type="button" className="font-semibold text-[color-mix(in_srgb,var(--accent)_60%,white)] hover:underline" onClick={() => restore(undo)}>
            Undo
          </button>
        </div>
      )}
    </main>
  );
}

export default function DecksPage() {
  return (
    <RequireUser>
      <AppShell>
        <DecksInner />
      </AppShell>
    </RequireUser>
  );
}
