"use client";

// Comment panel on a shared link (/v/<id>) when the owner allowed comments. No account needed:
// the viewer gives a name (remembered in this browser) and comments on the slide they're on.
import { useCallback, useEffect, useState } from "react";
import { CornerDownRight, Flag, X } from "lucide-react";
import { Captcha, captchaOn } from "./Captcha";
import { ReportForm } from "./ReportForm";

export interface ViewerComment {
  id: string;
  slideId: string;
  parentId: string | null;
  authorName: string;
  byOwner: boolean;
  body: string;
  resolved: boolean;
  createdAt: string;
}

const NAME_KEY = "kinetic.viewer.name";

export function useViewerComments(linkId: string, token: string | null, enabled: boolean) {
  const [comments, setComments] = useState<ViewerComment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!enabled || !token) return;
    try {
      const r = await fetch(`/api/v/${encodeURIComponent(linkId)}/comments?t=${encodeURIComponent(token)}`);
      const data = (await r.json().catch(() => ({}))) as { comments?: ViewerComment[]; error?: string };
      if (!r.ok) throw new Error(data.error ?? "Comments couldn't be loaded.");
      setComments(data.comments ?? []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [linkId, token, enabled]);
  useEffect(() => {
    void load(); // eslint-disable-line react-hooks/set-state-in-effect -- loads once when the link opens
  }, [load]);

  const add = async (c: { slideId: string; body: string; name: string; email?: string; parentId?: string; captcha?: string | null }) => {
    if (!token) return false;
    setError(null);
    const r = await fetch(`/api/v/${encodeURIComponent(linkId)}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...c, token, email: c.email || undefined, captcha: c.captcha ?? undefined }) }).catch(() => null);
    const data = (await r?.json().catch(() => ({}))) as { comment?: ViewerComment; error?: string } | undefined;
    if (!r?.ok || !data?.comment) {
      setError(data?.error ?? "The comment couldn't be sent. Check your connection.");
      return false;
    }
    setComments((l) => [...l, data.comment!]);
    return true;
  };
  /** Hides a comment here right after it is reported (the server hides it for everyone). */
  const hide = (id: string) => setComments((l) => l.filter((c) => c.id !== id && c.parentId !== id));
  return { comments, error, add, hide, reload: load };
}

export function ViewerCommentsPanel({ linkId, slideId, slideNumber, api, onClose, ownerPreview = false }: { linkId: string; slideId: string; slideNumber: number; api: ReturnType<typeof useViewerComments>; onClose: () => void; ownerPreview?: boolean }) {
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem(NAME_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [email, setEmail] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [reset, setReset] = useState(0);
  const [reporting, setReporting] = useState<string | null>(null);
  const needCaptcha = captchaOn && !ownerPreview;
  const roots = api.comments.filter((c) => !c.parentId && c.slideId === slideId);

  const send = async () => {
    if (!name.trim() || !body.trim() || busy || (needCaptcha && !captcha)) return;
    setBusy(true);
    try {
      localStorage.setItem(NAME_KEY, name.trim());
    } catch {}
    if (await api.add({ slideId, body: body.trim(), name: name.trim(), email: email.trim(), parentId: replyTo ?? undefined, captcha })) {
      setBody("");
      setReplyTo(null);
    }
    setReset((n) => n + 1);
    setBusy(false);
  };

  if (reporting) {
    return (
      <aside className="flex w-full flex-col border-t border-white/10 bg-[#141416] text-white sm:w-[340px] sm:border-l sm:border-t-0" aria-label="Report a comment">
        <div className="flex h-12 items-center justify-between px-4">
          <h2 className="text-[14px] font-semibold">Report a comment</h2>
          <button type="button" className="rounded-[8px] p-1.5 text-white/70 hover:bg-white/10 hover:text-white" onClick={() => setReporting(null)} aria-label="Back to comments"><X size={16} aria-hidden="true" /></button>
        </div>
        <div className="overflow-y-auto px-4 pb-4">
          <ReportForm
            dark
            link={linkId}
            commentId={reporting}
            onDone={() => {
              api.hide(reporting);
              setReporting(null);
            }}
          />
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex w-full flex-col border-t border-white/10 bg-[#141416] text-white sm:w-[340px] sm:border-l sm:border-t-0" aria-label="Comments">
      <div className="flex h-12 items-center justify-between px-4">
        <h2 className="text-[14px] font-semibold">Comments on slide {slideNumber}</h2>
        <button type="button" className="rounded-[8px] p-1.5 text-white/70 hover:bg-white/10 hover:text-white" onClick={onClose} aria-label="Close comments"><X size={16} aria-hidden="true" /></button>
      </div>
      <div className="max-h-[40dvh] min-h-0 flex-1 space-y-3 overflow-y-auto px-4 sm:max-h-none" aria-live="polite">
        {roots.length === 0 && <p className="text-[13px] text-white/60">No comments on this slide yet. The owner sees what you write here.</p>}
        {roots.map((c) => (
          <article key={c.id} className={`rounded-[10px] bg-white/5 p-2.5 text-[13px] ${c.resolved ? "opacity-60" : ""}`}>
            <p className="text-[12px] text-white/60"><b className="font-semibold text-white">{c.byOwner ? `${c.authorName} (owner)` : c.authorName}</b>{c.resolved ? " · resolved" : ""}</p>
            <p className="mt-1 whitespace-pre-wrap break-words">{c.body}</p>
            {api.comments.filter((r) => r.parentId === c.id).map((r) => (
              <div key={r.id} className="mt-2 flex gap-1.5 border-l-2 border-white/15 pl-2">
                <CornerDownRight size={12} className="mt-0.5 flex-none text-white/50" aria-hidden="true" />
                <div>
                  <p className="text-[12px] text-white/60"><b className="font-semibold text-white">{r.byOwner ? `${r.authorName} (owner)` : r.authorName}</b></p>
                  <p className="whitespace-pre-wrap break-words">{r.body}</p>
                </div>
              </div>
            ))}
            <div className="mt-1.5 flex items-center gap-3">
              {!c.resolved && <button type="button" className="text-[12px] font-medium text-white/80 underline-offset-2 hover:underline" onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}>{replyTo === c.id ? "Cancel reply" : "Reply"}</button>}
              {!c.byOwner && !ownerPreview && (
                <button type="button" className="ml-auto inline-flex items-center gap-1 text-[12px] text-white/60 hover:text-white" onClick={() => setReporting(c.id)} aria-label={`Report comment by ${c.authorName}`}>
                  <Flag size={12} aria-hidden="true" />
                  Report
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      <form
        className="space-y-2 border-t border-white/10 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          <input className="h-9 rounded-[8px] border border-white/15 bg-transparent px-2.5 text-[13px] placeholder:text-white/40" placeholder="Your name" aria-label="Your name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          <input className="h-9 rounded-[8px] border border-white/15 bg-transparent px-2.5 text-[13px] placeholder:text-white/40" placeholder="Email (optional)" aria-label="Email (optional)" type="email" value={email} maxLength={200} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
        <textarea
          className="min-h-[72px] w-full resize-y rounded-[8px] border border-white/15 bg-transparent px-2.5 py-2 text-[13px] placeholder:text-white/40"
          placeholder={replyTo ? "Write a reply" : `Comment on slide ${slideNumber}`}
          aria-label={replyTo ? "Reply" : `Comment on slide ${slideNumber}`}
          value={body}
          maxLength={2000}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void send();
            }
          }}
        />
        {needCaptcha && <Captcha action="comment" onToken={setCaptcha} resetKey={reset} theme="dark" />}
        {api.error && <p role="alert" className="text-[12px] text-[#ff8a80]">{api.error}</p>}
        <button type="submit" className="h-9 w-full rounded-[8px] bg-white text-[13px] font-semibold text-[#0b0b0c] disabled:opacity-40" disabled={busy || !name.trim() || !body.trim() || (needCaptcha && !captcha)}>
          {busy ? "Sending" : replyTo ? "Send reply" : "Send comment"}
        </button>
        <p className="text-[11px] text-white/50">Your name and comment are shown to the deck owner and to others with this link. Your email is only shown to the owner.</p>
      </form>
    </aside>
  );
}
