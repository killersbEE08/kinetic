"use client";

// Comments tab: threads pinned to slides (and optionally an element), from you and from people
// with a share link that allows comments. Resolve when done; replies go back to the link.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, CornerDownRight, MessageSquare, RotateCcw, Trash2 } from "lucide-react";
import type { Deck, Element } from "@/lib/deck/schema";
import { ApiError, useBackend, type DeckComment, type NewCommentInput } from "@/lib/client/backend";
import { relTime } from "@/components/app/ShareDialog";
import { Segmented } from "@/components/ui/chrome";
import { elementLabel } from "./Panels";

/** Loads a deck's comments and refreshes them every minute while the tab is visible. */
export function useComments(deckId: string) {
  const backend = useBackend();
  const [comments, setComments] = useState<DeckComment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!backend.ready || !backend.signedIn) return;
    backend
      .listComments(deckId)
      .then((c) => {
        setComments(c);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Comments couldn't be loaded."));
  }, [backend, deckId]);

  useEffect(() => {
    reload();
    const t = setInterval(() => document.visibilityState === "visible" && reload(), 60_000);
    return () => clearInterval(t);
  }, [reload]);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, apply: (r: T, list: DeckComment[]) => DeckComment[]) => {
      setError(null);
      try {
        const r = await fn();
        setComments((list) => apply(r, list ?? []));
        return true;
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "That didn't work. Try again.");
        return false;
      }
    },
    [],
  );

  const add = (c: NewCommentInput) => run(() => backend.addComment(deckId, c), (r, l) => [...l, r]);
  const setResolved = (id: string, resolved: boolean) => run(() => backend.updateComment(id, { resolved }), (r, l) => l.map((x) => (x.id === id ? r : x)));
  const keep = (id: string) => run(() => backend.updateComment(id, { keep: true }), (_r, l) => l.map((x) => (x.id === id ? { ...x, reported: false } : x)));
  const remove = (id: string) => run(() => backend.deleteComment(id), (_r, l) => l.filter((x) => x.id !== id && x.parentId !== id));

  /** Open threads per slide id, for the slide rail and the tab badge. */
  const openBySlide = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of comments ?? []) if (!c.parentId && !c.resolved) m[c.slideId] = (m[c.slideId] ?? 0) + 1;
    return m;
  }, [comments]);
  const openCount = Object.values(openBySlide).reduce((a, b) => a + b, 0);

  return { comments, error, reload, add, setResolved, keep, remove, openBySlide, openCount };
}

export type CommentsApi = ReturnType<typeof useComments>;

function Composer({ placeholder, onSubmit, autoFocus, submitLabel = "Comment" }: { placeholder: string; onSubmit: (body: string) => Promise<boolean>; autoFocus?: boolean; submitLabel?: string }) {
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!v.trim() || busy) return;
    setBusy(true);
    if (await onSubmit(v.trim())) setV("");
    setBusy(false);
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <textarea
        className="field min-h-[60px] resize-y py-2 text-[13px]"
        placeholder={placeholder}
        aria-label={placeholder}
        value={v}
        maxLength={2000}
        autoFocus={autoFocus}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void send();
          }
        }}
      />
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-[11px] text-ink-2">Ctrl Enter to send</span>
        <button type="submit" className="btn btn-primary btn-sm min-h-8" disabled={busy || !v.trim()}>{busy ? "Sending" : submitLabel}</button>
      </div>
    </form>
  );
}

function Author({ c }: { c: DeckComment }) {
  return (
    <span className="min-w-0 truncate text-[12px]">
      <b className="font-semibold">{c.byOwner ? "You" : c.authorName}</b>
      {!c.byOwner && c.linkName && <span className="text-ink-2"> via {c.linkName}</span>}
      {!c.byOwner && c.authorEmail && <span className="text-ink-2"> · {c.authorEmail}</span>}
      <span className="text-ink-2"> · {relTime(c.createdAt)}</span>
    </span>
  );
}

export function CommentsPanel({ deck, slideIndex, selected, api, onGo }: { deck: Deck; slideIndex: number; selected: Element | null; api: CommentsApi; onGo: (slideIndex: number, elementId?: string) => void }) {
  const backend = useBackend();
  const [view, setView] = useState<"slide" | "all">("slide");
  const [showResolved, setShowResolved] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [pin, setPin] = useState(true);
  const slide = deck.slides[slideIndex];
  const indexOf = useMemo(() => new Map(deck.slides.map((s, i) => [s.id, i])), [deck.slides]);
  const all = api.comments ?? [];
  const roots = all.filter((c) => !c.parentId && (view === "all" || c.slideId === slide.id) && (showResolved || !c.resolved));
  // Newest activity first in "All"; in "This slide", oldest first like a conversation.
  if (view === "all") roots.sort((a, b) => (indexOf.get(a.slideId) ?? 999) - (indexOf.get(b.slideId) ?? 999) || a.createdAt.localeCompare(b.createdAt));
  const resolvedHere = all.filter((c) => !c.parentId && c.resolved && (view === "all" || c.slideId === slide.id)).length;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented size="sm" label="Which comments" value={view} onChange={setView} options={[{ value: "slide", label: `Slide ${slideIndex + 1}` }, { value: "all", label: `All (${api.openCount})` }]} />
        {resolvedHere > 0 && (
          <label className="flex items-center gap-1.5 text-[12px] text-ink-2">
            <input type="checkbox" className="h-3.5 w-3.5" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
            Resolved ({resolvedHere})
          </label>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto" aria-live="polite">
        {api.comments === null && !api.error && <div className="skeleton h-16" aria-busy="true" />}
        {api.comments !== null && roots.length === 0 && (
          <p className="flex items-start gap-2 text-[13px] leading-[19px] text-ink-2">
            <MessageSquare size={15} className="mt-0.5 flex-none" aria-hidden="true" />
            {view === "slide" ? "No open comments on this slide." : "No open comments."}{" "}
            {backend.mode === "cloud" ? "To get feedback before you send the deck, share a link with comments turned on." : "In demo mode comments stay in this browser."}
          </p>
        )}
        {roots.map((c) => {
          const replies = all.filter((r) => r.parentId === c.id);
          const si = indexOf.get(c.slideId);
          const el = si !== undefined && c.elementId ? deck.slides[si].elements.find((e) => e.id === c.elementId) : undefined;
          return (
            <article key={c.id} className={`rounded-[10px] border p-2.5 ${c.resolved ? "border-line opacity-70" : "border-line"}`} aria-label={`Comment by ${c.byOwner ? "you" : c.authorName}`}>
              <div className="flex items-center gap-2">
                <Author c={c} />
                <span className="ml-auto flex flex-none items-center">
                  <button type="button" className="rounded-[6px] p-1 text-ink-2 hover:bg-[color-mix(in_srgb,var(--ink)_7%,transparent)] hover:text-ink" title={c.resolved ? "Reopen" : "Resolve"} aria-label={c.resolved ? "Reopen thread" : "Resolve thread"} onClick={() => api.setResolved(c.id, !c.resolved)}>
                    {c.resolved ? <RotateCcw size={13} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    className="rounded-[6px] p-1 text-ink-2 hover:bg-[color-mix(in_srgb,var(--ink)_7%,transparent)] hover:text-danger"
                    title="Delete"
                    aria-label="Delete thread"
                    onClick={() => window.confirm(replies.length ? "Delete this comment and its replies?" : "Delete this comment?") && api.remove(c.id)}
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                </span>
              </div>
              {(view === "all" || el) && (
                <button type="button" className="mt-1 block max-w-full truncate rounded-[5px] bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] px-1.5 py-0.5 text-left text-[11px] text-ink-2 hover:text-ink disabled:hover:text-ink-2" disabled={si === undefined} onClick={() => si !== undefined && onGo(si, el?.id)}>
                  {si === undefined ? "Slide deleted" : `Slide ${si + 1}`}
                  {el ? ` · ${elementLabel(el)}` : ""}
                </button>
              )}
              <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-[19px]">{c.body}</p>
              {c.reported && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-[8px] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-2 py-1.5 text-[12px]" role="note">
                  <span className="text-warning">A viewer reported this. It&rsquo;s hidden from other viewers.</span>
                  <button type="button" className="font-medium text-accent hover:underline" onClick={() => api.keep(c.id)}>Keep it</button>
                </div>
              )}
              {replies.map((r) => (
                <div key={r.id} className="mt-2 flex gap-1.5 border-l-2 border-line pl-2">
                  <CornerDownRight size={12} className="mt-0.5 flex-none text-ink-2" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <Author c={r} />
                      {r.byOwner && (
                        <button type="button" className="ml-auto rounded-[6px] p-0.5 text-ink-2 hover:text-danger" aria-label="Delete reply" onClick={() => window.confirm("Delete this reply?") && api.remove(r.id)}>
                          <Trash2 size={12} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap break-words text-[13px] leading-[19px]">{r.body}</p>
                  </div>
                </div>
              ))}
              {!c.resolved &&
                (replyTo === c.id ? (
                  <div className="mt-2">
                    <Composer autoFocus placeholder={c.linkName ? `Reply (shown on the ${c.linkName} link)` : "Reply"} submitLabel="Reply" onSubmit={async (body) => (await api.add({ slideId: c.slideId, parentId: c.id, body })) && (setReplyTo(null), true)} />
                    <button type="button" className="mt-1 text-[12px] text-ink-2 hover:text-ink" onClick={() => setReplyTo(null)}>Cancel</button>
                  </div>
                ) : (
                  <button type="button" className="mt-1.5 text-[12px] font-medium text-accent hover:underline" onClick={() => setReplyTo(c.id)}>Reply</button>
                ))}
            </article>
          );
        })}
        {api.error && <p role="alert" className="text-[12px] text-danger">{api.error}</p>}
      </div>

      <div className="mt-3 border-t border-line pt-3">
        {selected && (
          <label className="mb-1.5 flex items-center gap-1.5 text-[12px] text-ink-2">
            <input type="checkbox" className="h-3.5 w-3.5" checked={pin} onChange={(e) => setPin(e.target.checked)} />
            Pin to {elementLabel(selected).slice(0, 30)}
          </label>
        )}
        <Composer placeholder={`Comment on slide ${slideIndex + 1}`} onSubmit={(body) => api.add({ slideId: slide.id, elementId: selected && pin ? selected.id : undefined, body })} />
      </div>
    </div>
  );
}
