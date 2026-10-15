"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Eye, Lock } from "lucide-react";
import { RequireUser } from "@/components/auth/RequireUser";
import { AppShell } from "@/components/app/AppShell";
import { ErrorNote } from "@/components/ui/chrome";
import { fmtDuration, relTime, shareUrl } from "@/components/app/ShareDialog";
import { ApiError, useBackend, type ShareLink } from "@/lib/client/backend";

const COUNTRY = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(undefined, { type: "region" }) : null;

/** Bar per slide: share of total viewing time. The busiest slide is highlighted. */
function SlideTime({ ms }: { ms: number[] }) {
  const max = Math.max(1, ...ms);
  const total = ms.reduce((a, b) => a + b, 0);
  const top = ms.indexOf(Math.max(...ms));
  if (!total) return <p className="text-[12px] text-ink-2">No viewing time yet.</p>;
  return (
    <div>
      <div className="flex h-[72px] items-end gap-1" role="img" aria-label={`Time per slide. Most time on slide ${top + 1}.`}>
        {ms.map((v, i) => (
          <div key={i} className="group relative flex-1">
            <div className={`w-full rounded-t-[3px] ${i === top ? "bg-accent" : "bg-[color-mix(in_srgb,var(--accent)_35%,var(--surface))]"}`} style={{ height: `${Math.max(3, (v / max) * 72)}px` }} />
            <span className="tabular pointer-events-none absolute bottom-full left-1/2 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-[4px] bg-ink px-1.5 py-0.5 text-[11px] text-canvas group-hover:block">
              Slide {i + 1}: {fmtDuration(v)}
            </span>
          </div>
        ))}
      </div>
      <div className="tabular mt-1 flex justify-between text-[11px] text-ink-2">
        <span>1</span>
        <span>Most time: slide {top + 1} ({Math.round((ms[top] / total) * 100)}%)</span>
        <span>{ms.length}</span>
      </div>
    </div>
  );
}

function LinkCard({ l }: { l: ShareLink }) {
  const avg = l.stats.views ? l.stats.totalMs / l.stats.views : 0;
  return (
    <li className={`rounded-[14px] border bg-surface p-5 ${l.live ? "border-line" : "border-dashed border-line opacity-75"}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Link href={`/d/${l.deckId}?share=1`} className="text-[16px] font-semibold hover:underline">{l.deckTitle}</Link>
        {l.name && <span className="text-[13px] text-ink-2">for {l.name}</span>}
        {l.hasPassword && <span className="inline-flex items-center gap-1 text-[12px] text-ink-2"><Lock size={12} aria-hidden="true" />Password</span>}
        {!l.live && <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] text-ink-2">{l.revoked ? "Off" : "Expired"}</span>}
        <a href={shareUrl(l.id)} target="_blank" rel="noopener noreferrer" className="ml-auto truncate text-[12px] text-accent hover:underline">{shareUrl(l.id).replace(/^https?:\/\//, "")}</a>
      </div>
      <dl className="tabular mt-4 grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-5">
        {[
          ["Views", l.stats.views.toLocaleString()],
          ["Viewers", l.stats.viewers.toLocaleString()],
          ["Avg. time", fmtDuration(avg)],
          ["Read to the end", l.stats.views ? `${Math.round(((l.completed ?? 0) / l.stats.views) * 100)}%` : "–"],
          ["Last viewed", relTime(l.stats.lastViewedAt)],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-[12px] text-ink-2">{k}</dt>
            <dd className="text-[17px] font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4">
        <SlideTime ms={l.perSlideMs ?? []} />
      </div>
      {l.recent && l.recent.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-[13px] font-medium">Recent visits ({l.recent.length})</summary>
          <table className="mt-2 w-full text-left text-[12px]">
            <thead className="text-ink-2">
              <tr>
                <th className="py-1 font-medium">When</th>
                <th className="py-1 font-medium">Where</th>
                <th className="py-1 font-medium">Device</th>
                <th className="py-1 text-right font-medium">Slides</th>
                <th className="py-1 text-right font-medium">Time</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {l.recent.map((r, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="py-1.5">{relTime(r.at)}</td>
                  <td className="py-1.5">{r.email ?? (r.country ? (COUNTRY?.of(r.country) ?? r.country) : "Unknown")}</td>
                  <td className="py-1.5 capitalize">{r.device ?? "–"}</td>
                  <td className="py-1.5 text-right">{r.slidesSeen} / {l.slideCount}</td>
                  <td className="py-1.5 text-right">{fmtDuration(r.totalMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </li>
  );
}

function SharedInner() {
  const backend = useBackend();
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    backend
      .listShares()
      .then(setLinks)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load your shared links."));
  }, [backend]);
  useEffect(() => {
    load(); // eslint-disable-line react-hooks/set-state-in-effect -- initial fetch
  }, [load]);

  return (
    <main className="mx-auto max-w-[1000px] px-4 py-8 sm:px-10">
      <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Shared links</h1>
      <p className="mt-1 text-[14px] text-ink-2">Who opened your decks, for how long, and which slides held their attention. Viewers aren&rsquo;t tracked across days, and no IP addresses are stored.</p>
      <div className="mt-6">{error && <ErrorNote onRetry={load}>{error}</ErrorNote>}</div>
      {backend.mode !== "cloud" ? (
        <p className="mt-6 text-[14px] text-ink-2">Share links need an account. Add the Clerk and Supabase keys to turn them on.</p>
      ) : links === null && !error ? (
        <div className="mt-6 space-y-4" aria-busy="true">{[0, 1].map((i) => <div key={i} className="skeleton h-[220px] rounded-[14px]" />)}</div>
      ) : links && links.length === 0 ? (
        <div className="mt-6 rounded-[14px] border border-dashed border-line p-8 text-center">
          <Eye className="mx-auto text-ink-2" size={22} aria-hidden="true" />
          <p className="mt-2 text-[15px] font-medium">No shared links yet</p>
          <p className="mt-1 text-[13px] text-ink-2">Open a deck and press Share to create one.</p>
          <Link href="/decks" className="btn btn-secondary btn-sm mt-4">Go to decks</Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-4">{links?.map((l) => <LinkCard key={l.id} l={l} />)}</ul>
      )}
    </main>
  );
}

export default function SharedPage() {
  return (
    <RequireUser>
      <AppShell>
        <SharedInner />
      </AppShell>
    </RequireUser>
  );
}
