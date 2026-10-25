"use client";

// Version history: saved copies of the deck you can preview and restore. Restoring is one
// undoable edit, and the deck as it was is saved first, so nothing is lost either way.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bookmark, Bot, Clock, FilePlus2, History, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { SlideView } from "@/components/deck/SlideView";
import { ErrorNote } from "@/components/ui/chrome";
import { ApiError, useBackend } from "@/lib/client/backend";
import type { Deck } from "@/lib/deck/schema";
import { deckTheme } from "@/lib/deck/themes";
import { VERSION_KIND_LABEL, type VersionKind, type VersionMeta } from "@/lib/deck/versions";
import type { SaveState } from "./useDeckEditor";

const KIND_ICON: Record<VersionKind, typeof Clock> = { created: FilePlus2, auto: Clock, "before-ai": Bot, named: Bookmark, "before-restore": RotateCcw };

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export function HistoryView({ deck, saveState, onRestore, onClose }: { deck: Deck; saveState: SaveState; onRestore: (target: Deck, label: string) => boolean; onClose: () => void }) {
  const backend = useBackend();
  const [versions, setVersions] = useState<VersionMeta[] | null>(null);
  const [selected, setSelected] = useState<string>("current");
  const [preview, setPreview] = useState<Deck | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const fail = (e: unknown, text: string) => setError(e instanceof ApiError ? e.message : text);

  useEffect(() => {
    let cancelled = false;
    backend
      .listVersions(deck.id)
      .then((v) => !cancelled && (setVersions(v), setError(null)))
      .catch((e) => !cancelled && (setVersions([]), setError(e instanceof ApiError ? e.message : "Could not load the version history.")));
    return () => {
      cancelled = true;
    };
  }, [backend, deck.id, reload]);

  const select = useCallback(
    async (id: string) => {
      setSelected(id);
      setPreview(null);
      if (id === "current") return;
      setLoadingPreview(true);
      try {
        setPreview(await backend.getVersion(deck.id, id));
      } catch (e) {
        fail(e, "Could not open that version.");
      } finally {
        setLoadingPreview(false);
      }
    },
    [backend, deck.id],
  );

  const groups = useMemo(() => {
    const g = new Map<string, VersionMeta[]>();
    for (const v of versions ?? []) {
      const k = dayLabel(v.createdAt);
      g.set(k, [...(g.get(k) ?? []), v]);
    }
    return [...g.entries()];
  }, [versions]);

  const saved = saveState === "saved";
  const meta = versions?.find((v) => v.id === selected) ?? null;
  const shown = selected === "current" ? deck : preview;

  async function saveNamed() {
    setBusy(true);
    setError(null);
    try {
      await backend.saveVersion(deck.id, { label: name.trim() || undefined, kind: "named" });
      setName("");
      setReload((r) => r + 1);
    } catch (e) {
      fail(e, "Could not save the version.");
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    if (!preview || !meta) return;
    setBusy(true);
    setError(null);
    try {
      // Save the deck as it is now, so the restore can itself be undone later from history.
      await backend.saveVersion(deck.id, { kind: "before-restore" });
      const label = meta.label ?? `${VERSION_KIND_LABEL[meta.kind]}, ${dayLabel(meta.createdAt).toLowerCase()} ${timeOf(meta.createdAt)}`;
      if (onRestore(preview, label)) onClose();
      else setError("That version couldn't be restored.");
    } catch (e) {
      fail(e, "Could not restore the version.");
    } finally {
      setBusy(false);
    }
  }

  async function rename(v: VersionMeta, label: string) {
    setRenaming(null);
    if (!label.trim() || label.trim() === v.label) return;
    try {
      await backend.renameVersion(deck.id, v.id, label.trim());
      setVersions((list) => list?.map((x) => (x.id === v.id ? { ...x, label: label.trim(), kind: "named" } : x)) ?? null);
    } catch (e) {
      fail(e, "Could not rename the version.");
    }
  }

  async function remove(v: VersionMeta) {
    if (!window.confirm("Delete this saved version? The deck itself isn't changed.")) return;
    try {
      await backend.deleteVersion(deck.id, v.id);
      setVersions((list) => list?.filter((x) => x.id !== v.id) ?? null);
      if (selected === v.id) select("current");
    } catch (e) {
      fail(e, "Could not delete the version.");
    }
  }

  const item = (on: boolean) => `flex w-full items-start gap-2.5 rounded-[10px] px-2.5 py-2 text-left ${on ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]" : "hover:bg-[color-mix(in_srgb,var(--ink)_5%,transparent)]"}`;

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-[320px] shrink-0 flex-col border-r border-line bg-surface" aria-label="Versions">
        <div className="border-b border-line p-4">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold"><History size={16} aria-hidden="true" />Version history</h2>
          <p className="mt-1 text-[12px] leading-[17px] text-ink-2">DeckIQ saves a copy when the deck is created, before each AI edit, and every 25 edits. Name a version to keep it for good.</p>
          <form
            className="mt-3 flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              saveNamed();
            }}
          >
            <input aria-label="Version name" placeholder="Name this version, e.g. Sent to Acme" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className="field h-8 min-w-0 flex-1 py-0 text-[13px]" />
            <button type="submit" className="btn btn-primary btn-sm min-h-8 px-2.5 text-[12px]" disabled={busy || !saved} title={saved ? undefined : "Wait for your last change to save"}>
              Save
            </button>
          </form>
        </div>
        <ol className="min-h-0 flex-1 overflow-y-auto p-2">
          <li>
            <button type="button" className={item(selected === "current")} onClick={() => select("current")}>
              <span className="mt-0.5 h-2 w-2 flex-none translate-y-1 rounded-full bg-success" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold">Current version</span>
                <span className="block text-[12px] text-ink-2">{deck.slides.length} slides · {saved ? "all changes saved" : "saving"}</span>
              </span>
            </button>
          </li>
          {versions === null ? (
            [0, 1, 2].map((i) => <li key={i} className="skeleton mx-2.5 my-2 h-10" />)
          ) : versions.length === 0 ? (
            <li className="px-3 py-6 text-center text-[12px] text-ink-2">No saved versions yet. Name one above, or keep editing and DeckIQ will save some for you.</li>
          ) : (
            groups.map(([day, list]) => (
              <li key={day}>
                <p className="px-2.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-2">{day}</p>
                <ul>
                  {list.map((v) => {
                    const Icon = KIND_ICON[v.kind];
                    const on = selected === v.id;
                    return (
                      <li key={v.id} className="group/v relative">
                        {renaming === v.id ? (
                          <form
                            className="px-2.5 py-1.5"
                            onSubmit={(e) => {
                              e.preventDefault();
                              rename(v, new FormData(e.currentTarget).get("label") as string);
                            }}
                          >
                            <input name="label" autoFocus aria-label="Version name" defaultValue={v.label ?? ""} maxLength={80} className="field h-8 py-0 text-[13px]" onBlur={(e) => rename(v, e.target.value)} onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), setRenaming(null))} />
                          </form>
                        ) : (
                          <button type="button" className={item(on)} onClick={() => select(v.id)} aria-current={on ? "true" : undefined}>
                            <Icon size={14} className={`mt-0.5 flex-none ${v.kind === "named" ? "text-accent" : "text-ink-2"}`} aria-hidden="true" />
                            <span className="min-w-0 flex-1 pr-12">
                              <span className="block truncate text-[13px] font-medium">{v.label ?? VERSION_KIND_LABEL[v.kind]}</span>
                              <span className="tabular block truncate text-[12px] text-ink-2">{timeOf(v.createdAt)} · {v.slideCount} slides{v.title !== deck.title ? ` · "${v.title}"` : ""}</span>
                            </span>
                          </button>
                        )}
                        {renaming !== v.id && (
                          <span className="absolute right-2 top-2 flex opacity-0 transition-opacity focus-within:opacity-100 group-hover/v:opacity-100">
                            <button type="button" className="flex h-6 w-6 items-center justify-center rounded-[6px] text-ink-2 hover:bg-[color-mix(in_srgb,var(--ink)_8%,transparent)] hover:text-ink" aria-label={`Rename ${v.label ?? "version"}`} title="Name this version" onClick={() => setRenaming(v.id)}>
                              <Pencil size={12} aria-hidden="true" />
                            </button>
                            <button type="button" className="flex h-6 w-6 items-center justify-center rounded-[6px] text-ink-2 hover:bg-[color-mix(in_srgb,var(--ink)_8%,transparent)] hover:text-danger" aria-label={`Delete ${v.label ?? "version"}`} title="Delete this version" onClick={() => remove(v)}>
                              <Trash2 size={12} aria-hidden="true" />
                            </button>
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))
          )}
        </ol>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-[color-mix(in_srgb,var(--ink)_4%,var(--canvas))]" aria-label="Version preview">
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-6 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold">{selected === "current" ? "Current version" : (meta?.label ?? (meta ? VERSION_KIND_LABEL[meta.kind] : ""))}</p>
            <p className="text-[12px] text-ink-2">{selected === "current" ? "This is the deck you're editing." : meta ? `${dayLabel(meta.createdAt)} at ${timeOf(meta.createdAt)}. Restoring saves the current deck as a version first, and you can undo it.` : ""}</p>
          </div>
          {selected !== "current" && (
            <button type="button" className="btn btn-primary btn-sm gap-1.5" disabled={!preview || busy || !saved} onClick={restore} title={saved ? undefined : "Wait for your last change to save"}>
              <RotateCcw size={14} aria-hidden="true" />
              {busy ? "Restoring" : "Restore this version"}
            </button>
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Back to editing</button>
        </div>
        {error && (
          <div className="px-6 pt-4">
            <ErrorNote onRetry={() => setReload((r) => r + 1)}>{error}</ErrorNote>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {loadingPreview || !shown ? (
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-3" aria-busy="true">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton aspect-video rounded-[10px]" />)}</div>
          ) : (
            <>
              <p className="mb-3 text-[13px] text-ink-2">
                <b className="font-semibold text-ink">{shown.title}</b> · {shown.slides.length} slides
              </p>
              <ol className="grid grid-cols-2 gap-4 xl:grid-cols-3">
                {shown.slides.map((s, i) => (
                  <li key={s.id + i}>
                    <div className="overflow-hidden rounded-[10px] border border-line bg-surface shadow-[0_1px_2px_rgba(16,17,20,.06)]">
                      <SlideView slide={s} theme={deckTheme(shown)} intensity={shown.motionIntensity} mode="static" label={`Slide ${i + 1}`} />
                    </div>
                    <p className="tabular mt-1.5 text-[12px] text-ink-2">{i + 1}</p>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
