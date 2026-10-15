"use client";

// Unsplash stock photo search. Follows the Unsplash API guidelines: images are hotlinked from
// their CDN, choosing one pings the download endpoint, and every photo shows the photographer
// with links back to Unsplash (with referral parameters).
import { useState } from "react";
import { Search } from "lucide-react";
import { ApiError, useBackend, type StockPhoto } from "@/lib/client/backend";
import { useMe } from "@/lib/client/me";
import { UNSPLASH_UTM } from "@/lib/deck/media";
import type { PhotoRef } from "@/lib/deck/place";

export function StockSearch({ onChoose, initialQuery = "" }: { onChoose: (p: PhotoRef) => void; initialQuery?: string }) {
  const backend = useBackend();
  const { me } = useMe();
  const [q, setQ] = useState(initialQuery);
  const [photos, setPhotos] = useState<StockPhoto[] | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (backend.mode === "demo" || (me && !me.features.unsplash)) {
    return <p className="text-[12px] leading-[17px] text-ink-2">Stock photo search isn&rsquo;t set up on this server. The owner can add an Unsplash access key to turn it on.</p>;
  }

  async function run(nextPage = 1) {
    const query = q.trim();
    if (query.length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const r = await backend.searchStock(query, nextPage);
      setPhotos((prev) => (nextPage === 1 ? r.photos : [...(prev ?? []), ...r.photos]));
      setPages(r.pages);
      setPage(nextPage);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Search didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void run(1);
        }}
      >
        <label className="sr-only" htmlFor="stock-q">Search free photos</label>
        <input id="stock-q" className="field h-9 py-0 text-[13px]" placeholder="Search free photos, e.g. harbour at dawn" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="submit" className="btn btn-secondary btn-sm min-h-9 px-2.5" disabled={busy || q.trim().length < 2} aria-label="Search">
          <Search size={15} aria-hidden="true" />
        </button>
      </form>
      {error && <p className="mt-2 text-[12px] text-danger" role="alert">{error}</p>}
      {busy && !photos && <div className="mt-2 grid grid-cols-3 gap-2" aria-busy="true">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton aspect-[4/3]" />)}</div>}
      {photos && photos.length === 0 && <p className="mt-2 text-[12px] text-ink-2">No photos found. Try a simpler word.</p>}
      {photos && photos.length > 0 && (
        <>
          <ul className="mt-2 grid grid-cols-3 gap-2" role="list">
            {photos.map((p) => (
              <li key={p.id} className="group relative">
                <button
                  type="button"
                  className="block w-full overflow-hidden rounded-[6px] border-2 border-transparent hover:border-line"
                  style={{ background: p.color ?? undefined }}
                  aria-label={`${p.alt}. Photo by ${p.author}`}
                  onClick={() => {
                    void backend.trackStock(p.downloadLocation);
                    onChoose({ src: p.src, alt: p.alt, credit: { name: p.author, url: p.authorUrl } });
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- Unsplash thumbnails must be hotlinked */}
                  <img src={p.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" className="aspect-[4/3] w-full object-cover" />
                </button>
                <a href={p.authorUrl} target="_blank" rel="noopener noreferrer" className="mt-0.5 block truncate text-[10px] text-ink-2 hover:text-ink hover:underline">{p.author}</a>
              </li>
            ))}
          </ul>
          {page < pages && (
            <button type="button" className="btn btn-ghost btn-sm mt-1 w-full" onClick={() => run(page + 1)} disabled={busy}>
              {busy ? "Loading" : "More photos"}
            </button>
          )}
        </>
      )}
      <p className="mt-2 text-[11px] text-ink-2">
        Free photos from{" "}
        <a className="underline" href={`https://unsplash.com/${UNSPLASH_UTM}`} target="_blank" rel="noopener noreferrer">Unsplash</a>. The photographer is credited in the photo panel.
      </p>
    </div>
  );
}

/** "Photo by <name> on Unsplash", both linked (Unsplash attribution guideline). */
export function UnsplashCredit({ credit, className = "" }: { credit: { name: string; url: string }; className?: string }) {
  return (
    <p className={`text-[11px] text-ink-2 ${className}`}>
      Photo by{" "}
      <a className="underline hover:text-ink" href={credit.url} target="_blank" rel="noopener noreferrer">{credit.name}</a> on{" "}
      <a className="underline hover:text-ink" href={`https://unsplash.com/${UNSPLASH_UTM}`} target="_blank" rel="noopener noreferrer">Unsplash</a>
    </p>
  );
}
