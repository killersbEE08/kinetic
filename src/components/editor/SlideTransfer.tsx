"use client";

// Moving slides between decks: copy slides from this deck into another (or a new) deck, and
// reuse slides from another deck in this one. Copies get new ids and take the target deck's theme.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Check, FilePlus2, Search } from "lucide-react";
import { SlideView } from "@/components/deck/SlideView";
import { UpgradeNote } from "@/components/ui/chrome";
import { ApiError, useBackend, type DeckSummary } from "@/lib/client/backend";
import type { Deck, Slide } from "@/lib/deck/schema";
import { newId } from "@/lib/deck/ids";
import { copySlides } from "@/lib/deck/slides";
import { deckTheme, getTheme, withBrand } from "@/lib/deck/themes";
import { Modal } from "./ui";

const MAX_SLIDES = 100;

function useDecks(open: boolean, exclude: string) {
  const backend = useBackend();
  const [decks, setDecks] = useState<DeckSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    backend
      .listDecks()
      .then((d) => !cancelled && setDecks(d.filter((x) => x.id !== exclude)))
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : "Could not load your decks."));
    return () => {
      cancelled = true;
    };
  }, [backend, open, exclude]);
  return { decks, error };
}

function DeckPicker({ decks, value, onPick }: { decks: DeckSummary[]; value: string | null; onPick: (d: DeckSummary) => void }) {
  const [q, setQ] = useState("");
  const list = decks.filter((d) => d.title.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div>
      <label className="relative mb-3 block">
        <span className="sr-only">Search decks</span>
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-2" aria-hidden="true" />
        <input autoFocus type="search" placeholder="Search your decks" value={q} onChange={(e) => setQ(e.target.value)} className="field h-9 py-0 pl-8 text-[13px]" />
      </label>
      <ul className="grid max-h-[320px] grid-cols-3 gap-3 overflow-y-auto p-0.5" role="radiogroup" aria-label="Decks">
        {list.map((d) => {
          const on = value === d.id;
          return (
            <li key={d.id}>
              <button type="button" role="radio" aria-checked={on} onClick={() => onPick(d)} className="group w-full text-left">
                <span className={`relative block overflow-hidden rounded-[8px] border-2 ${on ? "border-accent" : "border-line group-hover:border-ink-2"}`}>
                  {d.firstSlide ? <SlideView slide={d.firstSlide} theme={withBrand(getTheme(d.themeId), d.brand)} intensity={d.motionIntensity} mode="static" /> : <span className="skeleton block aspect-video" />}
                  {on && <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white"><Check size={12} strokeWidth={3} aria-hidden="true" /></span>}
                </span>
                <span className="mt-1.5 block truncate text-[12.5px] font-medium">{d.title}</span>
                <span className="block text-[11.5px] text-ink-2">{d.slideCount} slides</span>
              </button>
            </li>
          );
        })}
        {!list.length && <li className="col-span-3 py-6 text-center text-[13px] text-ink-2">{q ? "No decks match." : "You don't have other decks yet."}</li>}
      </ul>
    </div>
  );
}

/** Copy one slide (or all) from this deck into another deck, or into a new deck. */
export function CopyToDeckDialog({ open, onClose, deck, slideIndex }: { open: boolean; onClose: () => void; deck: Deck; slideIndex: number }) {
  const backend = useBackend();
  const { decks, error: loadError } = useDecks(open, deck.id);
  const [target, setTarget] = useState<DeckSummary | null>(null);
  const [which, setWhich] = useState<"one" | "all">("one");
  const [notes, setNotes] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; upgrade: boolean } | null>(null);
  const [done, setDone] = useState<{ id: string; title: string; count: number; created?: boolean } | null>(null);

  const source = which === "one" ? [deck.slides[slideIndex]] : deck.slides;
  const fail = (e: unknown, text: string) => setError({ text: e instanceof ApiError ? e.message : text, upgrade: e instanceof ApiError && e.status === 402 });

  const reset = () => {
    setTarget(null);
    setDone(null);
    setError(null);
    setBusy(false);
  };

  async function copyInto() {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const t = await backend.getDeck(target.id);
      if (t.slides.length + source.length > MAX_SLIDES) {
        setError({ text: `${t.title} has ${t.slides.length} slides. A deck can hold up to ${MAX_SLIDES}.`, upgrade: false });
        return;
      }
      const copies = copySlides(source, { notes });
      await backend.patchDeck(t.id, t.version, copies.map((s, k) => ({ op: "add" as const, path: `/slides/${t.slides.length + k}`, value: s })), "user");
      setDone({ id: t.id, title: t.title, count: copies.length });
    } catch (e) {
      fail(e, "Could not copy the slides.");
    } finally {
      setBusy(false);
    }
  }

  async function copyToNew() {
    setBusy(true);
    setError(null);
    try {
      const title = which === "one" ? `${deck.title} (slide ${slideIndex + 1})` : `Copy of ${deck.title}`;
      const created = await backend.createDeck({ ...structuredClone(deck), id: newId("dk"), version: 0, title: title.slice(0, 200), slides: copySlides(source, { notes }) });
      setDone({ id: created.id, title: created.title, count: source.length, created: true });
    } catch (e) {
      fail(e, "Could not create the deck.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Copy to another deck"
      width="w-[min(620px,calc(100vw-32px))]"
    >
      {done ? (
        <div className="py-4 text-center">
          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--success)_14%,transparent)] text-success"><Check size={20} aria-hidden="true" /></span>
          <p className="mt-3 text-[15px] font-semibold">{done.created ? `Made a new deck: ${done.title}` : `Copied ${done.count} slide${done.count === 1 ? "" : "s"} to ${done.title}`}</p>
          <p className="mt-1 text-[13px] text-ink-2">{done.created ? `It has ${done.count} slide${done.count === 1 ? "" : "s"}, with this deck’s theme and brand.` : "They were added at the end and use that deck’s theme."}</p>
          <div className="mt-5 flex justify-center gap-2">
            <button type="button" className="btn btn-secondary btn-sm" onClick={reset}>Copy more</button>
            <Link href={`/d/${done.id}`} className="btn btn-primary btn-sm">Open {done.title.length > 28 ? "the deck" : done.title}</Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div role="radiogroup" aria-label="Slides to copy" className="inline-flex rounded-[10px] bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] p-0.5">
              {(
                [
                  ["one", `Slide ${slideIndex + 1}`],
                  ["all", `All ${deck.slides.length} slides`],
                ] as const
              ).map(([v, label]) => (
                <button key={v} type="button" role="radio" aria-checked={which === v} onClick={() => setWhich(v)} className={`h-7 rounded-[8px] px-3 text-[12px] font-medium ${which === v ? "bg-surface text-ink shadow-[0_1px_2px_rgba(16,17,20,.1)]" : "text-ink-2 hover:text-ink"}`}>
                  {label}
                </button>
              ))}
            </div>
            <label className="ml-auto flex items-center gap-2 text-[13px]">
              <input type="checkbox" className="h-4 w-4" checked={notes} onChange={(e) => setNotes(e.target.checked)} />
              Include speaker notes
            </label>
          </div>

          {loadError ? <p className="text-[13px] text-danger">{loadError}</p> : decks === null ? <div className="skeleton h-[200px] rounded-[10px]" /> : <DeckPicker decks={decks} value={target?.id ?? null} onPick={setTarget} />}

          {error && (error.upgrade ? <UpgradeNote message={error.text} /> : <p className="text-[13px] text-danger" role="alert">{error.text}</p>)}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
            <button type="button" className="btn btn-ghost btn-sm gap-1.5" onClick={copyToNew} disabled={busy}>
              <FilePlus2 size={14} aria-hidden="true" />
              Copy to a new deck
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={!target || busy} onClick={copyInto}>
              {busy ? "Copying" : target ? `Copy to ${target.title.length > 24 ? "this deck" : target.title}` : "Choose a deck"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Pick slides from another deck and insert copies after the current slide. */
export function ImportSlidesDialog({ open, onClose, deck, onInsert }: { open: boolean; onClose: () => void; deck: Deck; onInsert: (slides: Slide[]) => void }) {
  const backend = useBackend();
  const { decks, error: loadError } = useDecks(open, deck.id);
  const [source, setSource] = useState<Deck | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [notes, setNotes] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const theme = useMemo(() => deckTheme(deck), [deck]);
  const room = MAX_SLIDES - deck.slides.length;

  const close = () => {
    setSource(null);
    setPicked(new Set());
    setError(null);
    onClose();
  };

  async function pickDeck(d: DeckSummary) {
    setLoading(true);
    setError(null);
    try {
      setSource(await backend.getDeck(d.id));
      setPicked(new Set());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not open that deck.");
    } finally {
      setLoading(false);
    }
  }

  const toggle = (i: number) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  return (
    <Modal open={open} onClose={close} title={source ? `Slides from ${source.title}` : "Reuse slides from another deck"} width="w-[min(760px,calc(100vw-32px))]">
      {!source ? (
        <div className="space-y-3">
          <p className="text-[13px] text-ink-2">Choose a deck, then the slides to copy. Copies are added after the current slide and take this deck&rsquo;s theme.</p>
          {loadError ? <p className="text-[13px] text-danger">{loadError}</p> : decks === null || loading ? <div className="skeleton h-[200px] rounded-[10px]" /> : <DeckPicker decks={decks} value={null} onPick={pickDeck} />}
          {error && <p className="text-[13px] text-danger" role="alert">{error}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-[13px]">
            <button type="button" className="btn btn-ghost btn-sm min-h-8" onClick={() => setSource(null)}>Other decks</button>
            <button type="button" className="font-medium text-accent hover:underline" onClick={() => setPicked(picked.size === source.slides.length ? new Set() : new Set(source.slides.map((_, i) => i)))}>
              {picked.size === source.slides.length ? "Clear selection" : "Select all"}
            </button>
            <label className="ml-auto flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4" checked={notes} onChange={(e) => setNotes(e.target.checked)} />
              Include speaker notes
            </label>
          </div>
          <ul className="grid max-h-[420px] grid-cols-2 gap-3 overflow-y-auto p-0.5 sm:grid-cols-3" aria-label="Slides">
            {source.slides.map((s, i) => {
              const on = picked.has(i);
              return (
                <li key={s.id}>
                  <button type="button" role="checkbox" aria-checked={on} aria-label={`Slide ${i + 1}`} onClick={() => toggle(i)} className="group w-full text-left">
                    <span className={`relative block overflow-hidden rounded-[8px] border-2 ${on ? "border-accent" : "border-line group-hover:border-ink-2"}`}>
                      <SlideView slide={s} theme={theme} intensity={deck.motionIntensity} mode="static" />
                      <span className={`absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-[5px] border ${on ? "border-accent bg-accent text-white" : "border-white/80 bg-[rgba(16,17,20,.35)]"}`} aria-hidden="true">{on && <Check size={12} strokeWidth={3} />}</span>
                    </span>
                    <span className="tabular mt-1 block text-[12px] text-ink-2">{i + 1}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-[12px] text-ink-2">Previews use this deck&rsquo;s theme, the way the slides will look once added.</p>
          <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
            {picked.size > room && <span className="mr-auto text-[12px] text-danger">This deck has room for {room} more slide{room === 1 ? "" : "s"}.</span>}
            <button type="button" className="btn btn-secondary btn-sm" onClick={close}>Cancel</button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!picked.size || picked.size > room}
              onClick={() => {
                onInsert(copySlides([...picked].sort((a, b) => a - b).map((i) => source.slides[i]), { notes }));
                close();
              }}
            >
              Add {picked.size || ""} slide{picked.size === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
