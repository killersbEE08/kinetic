"use client";

// Share links for one deck: create, copy, protect, update to the latest version, turn off.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, Lock, RefreshCw, Trash2 } from "lucide-react";
import { ApiError, useBackend, type ShareLink } from "@/lib/client/backend";

export const shareUrl = (id: string) => `${typeof window !== "undefined" ? window.location.origin : ""}/v/${id}`;

export function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function relTime(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm min-h-8 px-2.5"
      onClick={async () => {
        await navigator.clipboard.writeText(text).catch(() => undefined);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      {done ? "Copied" : "Copy link"}
    </button>
  );
}

export function ShareDialog({ deckId, open, onClose }: { deckId: string; open: boolean; onClose: () => void }) {
  const backend = useBackend();
  const ref = useRef<HTMLDialogElement>(null);
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [error, setError] = useState<{ text: string; upgrade: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [allowDownload, setAllowDownload] = useState(false);
  const [allowComments, setAllowComments] = useState(false);
  const [notify, setNotify] = useState(true);
  const [expiry, setExpiry] = useState<"never" | "7" | "30">("never");

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const fail = (e: unknown, fallback: string) => setError({ text: e instanceof ApiError ? e.message : fallback, upgrade: e instanceof ApiError && e.status === 402 });

  const load = useCallback(() => {
    backend
      .listShares(deckId)
      .then(setLinks)
      .catch((e) => fail(e, "Could not load the links."));
  }, [backend, deckId]);

  useEffect(() => {
    if (open && backend.mode === "cloud") load();  
  }, [open, load, backend.mode]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const expiresAt = expiry === "never" ? undefined : new Date(Date.now() + Number(expiry) * 86_400_000).toISOString();
      const link = await backend.createShare(deckId, { name: name.trim(), password: password || undefined, allowDownload, allowComments, notify, expiresAt });
      setLinks((l) => [link, ...(l ?? [])]);
      setName("");
      setPassword("");
      await navigator.clipboard?.writeText(shareUrl(link.id)).catch(() => undefined);
    } catch (e) {
      fail(e, "Could not create the link.");
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, p: Parameters<typeof backend.updateShare>[1]) {
    setError(null);
    try {
      const next = await backend.updateShare(id, p);
      setLinks((l) => l?.map((x) => (x.id === id ? { ...next, stats: x.stats } : x)) ?? null);
    } catch (e) {
      fail(e, "Could not update the link.");
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this link? People who have it won't be able to open the deck, and its view history is removed.")) return;
    try {
      await backend.deleteShare(id);
      setLinks((l) => l?.filter((x) => x.id !== id) ?? null);
    } catch (e) {
      fail(e, "Could not delete the link.");
    }
  }

  return (
    <dialog ref={ref} onClose={onClose} className="m-auto w-[min(640px,calc(100vw-32px))] rounded-[20px] border border-line bg-surface p-0 text-ink backdrop:bg-black/40" aria-labelledby="share-title">
      <div className="flex items-center justify-between border-b border-line px-6 py-4">
        <div>
          <h2 id="share-title" className="text-[17px] font-semibold">Share</h2>
          <p className="text-[13px] text-ink-2">Anyone with the link can view the deck with its animations. You see who opened it and which slides they read.</p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
      </div>

      {backend.mode !== "cloud" ? (
        <p className="px-6 py-6 text-[14px] text-ink-2">Share links need an account. Add the Clerk and Supabase keys to turn them on.</p>
      ) : (
        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-5">
          <section className="rounded-[12px] border border-line p-4" aria-labelledby="new-link-h">
            <h3 id="new-link-h" className="text-[14px] font-semibold">New link</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-[13px] font-medium">
                Who is it for? <span className="font-normal text-ink-2">(optional)</span>
                <input className="field mt-1 text-[14px]" placeholder="e.g. Acme investors" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="text-[13px] font-medium">
                Password <span className="font-normal text-ink-2">(optional)</span>
                <input type="text" className="field mt-1 text-[14px]" placeholder="At least 4 characters" value={password} maxLength={100} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
              </label>
              <label className="text-[13px] font-medium">
                Expires
                <select className="field mt-1 text-[14px]" value={expiry} onChange={(e) => setExpiry(e.target.value as typeof expiry)}>
                  <option value="never">Never</option>
                  <option value="7">In 7 days</option>
                  <option value="30">In 30 days</option>
                </select>
              </label>
              <label className="flex items-center gap-2 self-end pb-2.5 text-[13px]">
                <input type="checkbox" className="h-4 w-4" checked={allowDownload} onChange={(e) => setAllowDownload(e.target.checked)} />
                Let viewers download a PDF
              </label>
              <label className="flex items-start gap-2 text-[13px]">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={allowComments} onChange={(e) => setAllowComments(e.target.checked)} />
                <span>
                  Let viewers comment
                  <span className="block text-[12px] text-ink-2">Good for a colleague&rsquo;s review before you send it. Comments appear in the editor.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-[13px]">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
                <span>
                  Alert me when it&rsquo;s opened
                  <span className="block text-[12px] text-ink-2">With a summary of time per slide. Email and Slack in <Link href="/settings#alerts" className="text-accent hover:underline">Settings</Link>.</span>
                </span>
              </label>
            </div>
            <button type="button" className="btn btn-primary btn-sm mt-4" onClick={create} disabled={busy || (password.length > 0 && password.length < 4)}>
              {busy ? "Creating" : "Create link and copy it"}
            </button>
            <p className="mt-2 text-[12px] text-ink-2">The link shows the deck as it is now (last saved). After you edit, press &ldquo;Update&rdquo; on the link to share the new version.</p>
          </section>

          {error && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-line bg-canvas px-3 py-2 text-[13px]">
              {error.text}
              {error.upgrade && <Link href="/pricing" className="btn btn-primary btn-sm min-h-8">See plans</Link>}
            </div>
          )}

          <section aria-labelledby="links-h">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 id="links-h" className="text-[14px] font-semibold">Links for this deck</h3>
              <Link href="/shared" className="text-[13px] font-medium text-accent hover:underline">All shared links</Link>
            </div>
            {links === null ? (
              <div className="skeleton h-20" aria-busy="true" />
            ) : links.length === 0 ? (
              <p className="text-[13px] text-ink-2">No links yet.</p>
            ) : (
              <ul className="space-y-3">
                {links.map((l) => {
                  return (
                    <li key={l.id} className={`rounded-[12px] border p-3 ${l.live ? "border-line" : "border-dashed border-line opacity-70"}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] font-medium">{l.name || "Link"}</span>
                        {l.hasPassword && <span className="inline-flex items-center gap-1 rounded-full bg-canvas px-2 py-0.5 text-[11px] text-ink-2"><Lock size={11} aria-hidden="true" />Password</span>}
                        {!l.live && <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] text-ink-2">{l.revoked ? "Off" : "Expired"}</span>}
                        {l.expiresAt && l.live && <span className="text-[11px] text-ink-2">Expires {new Date(l.expiresAt).toLocaleDateString()}</span>}
                        <span className="tabular ml-auto text-[12px] text-ink-2">{l.stats.views} view{l.stats.views === 1 ? "" : "s"} · {l.stats.viewers} viewer{l.stats.viewers === 1 ? "" : "s"} · last {relTime(l.stats.lastViewedAt)}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <input readOnly className="field h-8 flex-1 py-0 text-[12px] text-ink-2" value={shareUrl(l.id)} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} />
                        <CopyButton text={shareUrl(l.id)} />
                        <a href={shareUrl(l.id)} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm min-h-8 px-2" aria-label="Open the link"><ExternalLink size={14} aria-hidden="true" /></a>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
                        {l.live && (
                          <button type="button" className="btn btn-secondary btn-sm min-h-7 px-2 text-[12px]" onClick={() => patch(l.id, { refresh: true })} title="Viewers see the version from when the link was made. Update to share your latest changes.">
                            <RefreshCw size={12} aria-hidden="true" />
                            Update to latest
                          </button>
                        )}
                        <label className="flex items-center gap-1.5 px-1">
                          <input type="checkbox" className="h-3.5 w-3.5" checked={l.allowDownload} onChange={(e) => patch(l.id, { allowDownload: e.target.checked })} />
                          PDF download
                        </label>
                        <label className="flex items-center gap-1.5 px-1">
                          <input type="checkbox" className="h-3.5 w-3.5" checked={l.allowComments} onChange={(e) => patch(l.id, { allowComments: e.target.checked })} />
                          Comments
                        </label>
                        <label className="flex items-center gap-1.5 px-1">
                          <input type="checkbox" className="h-3.5 w-3.5" checked={l.notify} onChange={(e) => patch(l.id, { notify: e.target.checked })} />
                          Alerts
                        </label>
                        {l.hasPassword ? (
                          <button type="button" className="btn btn-ghost btn-sm min-h-7 px-2 text-[12px]" onClick={() => patch(l.id, { password: null })}>Remove password</button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm min-h-7 px-2 text-[12px]"
                            onClick={() => {
                              const pw = window.prompt("Password for this link (at least 4 characters)");
                              if (pw && pw.length >= 4) void patch(l.id, { password: pw });
                            }}
                          >
                            Add password
                          </button>
                        )}
                        <button type="button" className="btn btn-ghost btn-sm min-h-7 px-2 text-[12px]" onClick={() => patch(l.id, { revoked: !l.revoked })}>{l.revoked ? "Turn on" : "Turn off"}</button>
                        <button type="button" className="btn btn-ghost btn-sm ml-auto min-h-7 px-2 text-[12px] text-danger" onClick={() => remove(l.id)} aria-label="Delete link"><Trash2 size={13} aria-hidden="true" /></button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </dialog>
  );
}
