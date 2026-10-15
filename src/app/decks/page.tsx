"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorNote, UpgradeNote } from "@/components/ui/chrome";
import { AppShell } from "@/components/app/AppShell";
import { RequireUser } from "@/components/auth/RequireUser";
import { SlideView } from "@/components/deck/SlideView";
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
  return new Date(iso).toLocaleDateString();
}

function DeckCard({ deck, onDelete }: { deck: DeckSummary; onDelete: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <li className="group relative">
      <Link
        href={`/d/${deck.id}`}
        className="block overflow-hidden rounded-[10px] border border-line bg-surface transition-shadow hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
      >
        {deck.firstSlide ? (
          // Plays the first slide's motion on hover (docs/02 §4.1).
          <SlideView slide={deck.firstSlide} theme={withBrand(getTheme(deck.themeId), deck.brand)} intensity={deck.motionIntensity} mode={hover ? "play" : "static"} step={9} playKey={hover ? "on" : "off"} label={`First slide of ${deck.title}`} />
        ) : (
          <div className="skeleton aspect-video" />
        )}
        <div className="border-t border-line px-4 py-3">
          <p className="truncate text-[15px] font-medium">{deck.title}</p>
          <p className="text-[13px] text-ink-2">
            {deck.slideCount} slides · edited {relTime(deck.updatedAt)}
          </p>
        </div>
      </Link>
      <button type="button" onClick={onDelete} className="btn btn-sm absolute right-2 top-2 bg-surface/90 text-[12px] text-ink-2 opacity-0 transition-opacity hover:text-danger focus:opacity-100 group-hover:opacity-100" aria-label={`Delete ${deck.title}`}>
        Delete
      </button>
    </li>
  );
}

function DecksInner() {
  const backend = useBackend();
  const router = useRouter();
  const [decks, setDecks] = useState<DeckSummary[] | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "title">("recent");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, m] = await Promise.all([backend.listDecks(), backend.me().catch(() => null)]);
      setError(null);
      setDecks(list);
      setMe(m);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load your decks.");
    }
  }, [backend]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([backend.listDecks(), backend.me().catch(() => null)])
      .then(([list, m]) => {
        if (cancelled) return;
        setDecks(list);
        setMe(m);
      })
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : "Could not load your decks."));
    return () => {
      cancelled = true;
    };
  }, [backend]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (decks ?? []).filter((d) => !q || d.title.toLowerCase().includes(q));
    return sort === "title" ? [...list].sort((a, b) => a.title.localeCompare(b.title)) : list;
  }, [decks, query, sort]);

  async function remove(d: DeckSummary) {
    if (!window.confirm(`Delete "${d.title}"? This can't be undone from the app.`)) return;
    try {
      await backend.deleteDeck(d.id);
      setDecks((list) => list?.filter((x) => x.id !== d.id) ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not delete the deck.");
    }
  }

  async function openSample() {
    setBusy(true);
    setError(null);
    try {
      const deck = await backend.createDeck(forkDeck(templateDeck("ledgerly-seed")!));
      router.push(`/d/${deck.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create the sample deck.");
      setBusy(false);
    }
  }

  const sample = useMemo(() => templateDeck("ledgerly-seed")!, []);
  const atLimit = me?.plan === "free" && me.deckCount >= 3;

  return (
    <main className="mx-auto max-w-[1280px] px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em]">Your decks</h1>
          {me && (
            <p className="mt-1 text-[13px] text-ink-2">
              <span className="capitalize">{me.plan}</span> plan{me.plan === "free" && ` · ${me.deckCount} of 3 decks`}
              {me.creditsRemaining !== null && ` · ${me.creditsRemaining.toLocaleString()} AI credits left`}
              {!me.features.gemini && " · AI is running in offline mode"}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="sr-only" htmlFor="deck-search">Search decks</label>
          <input id="deck-search" type="search" placeholder="Search decks" value={query} onChange={(e) => setQuery(e.target.value)} className="field h-10 w-56 py-0" />
          <label className="sr-only" htmlFor="deck-sort">Sort</label>
          <select id="deck-sort" value={sort} onChange={(e) => setSort(e.target.value as "recent" | "title")} className="field h-10 w-auto py-0">
            <option value="recent">Last edited</option>
            <option value="title">Title</option>
          </select>
          <Link href="/new" className="btn btn-primary" aria-disabled={atLimit}>New deck</Link>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {error && <ErrorNote onRetry={load}>{error}</ErrorNote>}
        {atLimit && <UpgradeNote message="You've used all 3 decks on the Free plan. Your decks stay editable; upgrade to create more." />}
      </div>

      {decks === null && !error ? (
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i}>
              <div className="skeleton aspect-video" />
              <div className="skeleton mt-3 h-4 w-2/3" />
            </li>
          ))}
        </ul>
      ) : decks && decks.length === 0 ? (
        // Empty state shows a real example, not an illustration (docs/06 §5).
        <section className="mt-10 grid gap-8 rounded-[14px] border border-line bg-surface p-8 md:grid-cols-[1.2fr_1fr] md:items-center">
          <div className="overflow-hidden rounded-[10px] border border-line">
            <SlideView slide={sample.slides[4]} theme={deckTheme(sample)} intensity="standard" mode="play" step={9} label="Sample deck" />
          </div>
          <div>
            <h2 className="text-[22px] font-semibold tracking-[-0.01em]">Start with your notes, or open a sample</h2>
            <p className="mt-2 text-[15px] leading-[22px] text-ink-2">Paste a memo or describe the talk and Kinetic will outline it first. The sample is a {sample.slides.length}-slide seed pitch for a fictional company you can edit freely.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/new" className="btn btn-primary">New deck</Link>
              <button type="button" className="btn btn-secondary" onClick={openSample} disabled={busy}>
                {busy ? "Opening" : "Copy the sample deck"}
              </button>
              <Link href="/templates" className="btn btn-ghost">Browse all {TEMPLATES.length} templates</Link>
            </div>
          </div>
        </section>
      ) : (
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shown.map((d) => (
            <DeckCard key={d.id} deck={d} onDelete={() => remove(d)} />
          ))}
          {shown.length === 0 && <li className="text-[15px] text-ink-2">No decks match &ldquo;{query}&rdquo;.</li>}
        </ul>
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
