"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader, ErrorNote, UpgradeNote } from "@/components/ui/chrome";
import { RequireUser } from "@/components/auth/RequireUser";
import { AssetThumb, formatBytes, ImportZone } from "@/components/app/assets-ui";
import { ApiError, useBackend } from "@/lib/client/backend";
import type { AssetMeta } from "@/lib/client/assets";

function AssetCard({ a, onSave, onDelete }: { a: AssetMeta; onSave: (patch: { name: string; alt: string }) => Promise<void>; onDelete: () => void }) {
  const [name, setName] = useState(a.name);
  const [alt, setAlt] = useState(a.alt);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const dirty = name.trim() !== a.name || alt.trim() !== a.alt;
  return (
    <li className="overflow-hidden rounded-[10px] border border-line bg-surface">
      <AssetThumb id={a.id} alt={a.alt} className="aspect-[4/3] w-full" />
      <div className="space-y-2 p-3">
        <label className="block text-[12px] font-medium text-ink-2">
          Name
          <input className="field mt-1 h-9 py-0 text-[13px]" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block text-[12px] font-medium text-ink-2">
          Description for screen readers
          <input className="field mt-1 h-9 py-0 text-[13px]" value={alt} maxLength={250} onChange={(e) => setAlt(e.target.value)} placeholder="What the photo shows" />
        </label>
        <p className="tabular text-[12px] text-ink-2">{a.width} × {a.height} · {formatBytes(a.bytes)}</p>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-sm flex-1"
            disabled={!dirty || !name.trim() || !alt.trim() || state === "saving"}
            onClick={async () => {
              setState("saving");
              try {
                await onSave({ name: name.trim(), alt: alt.trim() });
                setState("saved");
              } catch {
                setState("idle");
              }
            }}
          >
            {state === "saving" ? "Saving" : state === "saved" && !dirty ? "Saved" : "Save"}
          </button>
          <button type="button" className="btn btn-ghost btn-sm text-danger" onClick={onDelete} aria-label={`Delete ${a.name}`}>Delete</button>
        </div>
      </div>
    </li>
  );
}

function AssetsInner() {
  const backend = useBackend();
  const [assets, setAssets] = useState<AssetMeta[] | null>(null);
  const [where, setWhere] = useState<"cloud" | "browser">("cloud");
  const [error, setError] = useState<{ text: string; upgrade: boolean } | null>(null);
  const [query, setQuery] = useState("");

  const fail = (e: unknown, fallback: string) => setError({ text: e instanceof ApiError ? e.message : fallback, upgrade: e instanceof ApiError && e.status === 402 });

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await backend.listAssets();
      setAssets(r.assets);
      setWhere(r.where);
    } catch (e) {
      setError({ text: e instanceof ApiError ? e.message : "Could not load your photos.", upgrade: false });
    }
  }, [backend]);

  useEffect(() => {
    let cancelled = false;
    backend
      .listAssets()
      .then((r) => {
        if (cancelled) return;
        setAssets(r.assets);
        setWhere(r.where);
      })
      .catch((e) => !cancelled && setError({ text: e instanceof ApiError ? e.message : "Could not load your photos.", upgrade: false }));
    return () => {
      cancelled = true;
    };
  }, [backend]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (assets ?? []).filter((a) => !q || a.name.toLowerCase().includes(q) || a.alt.toLowerCase().includes(q));
  }, [assets, query]);
  const total = (assets ?? []).reduce((n, a) => n + a.bytes, 0);

  async function remove(a: AssetMeta) {
    if (!window.confirm(`Delete "${a.name}"? Slides that use it will show an empty photo area until you pick another.`)) return;
    try {
      await backend.deleteAsset(a.id);
      setAssets((list) => list?.filter((x) => x.id !== a.id) ?? null);
    } catch (e) {
      fail(e, "Could not delete the photo.");
    }
  }

  return (
    <main className="mx-auto max-w-[1280px] px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em]">Photos</h1>
          <p className="mt-1 text-[13px] text-ink-2">
            {assets ? `${assets.length} photo${assets.length === 1 ? "" : "s"} · ${formatBytes(total)}` : "Loading"}
            {where === "browser" ? " · saved in this browser only" : " · private to your account"}
          </p>
        </div>
        <label className="sr-only" htmlFor="asset-search">Search photos</label>
        <input id="asset-search" type="search" placeholder="Search photos" value={query} onChange={(e) => setQuery(e.target.value)} className="field h-10 w-56 py-0" />
      </div>

      <div className="mt-6">
        <ImportZone allowDocs={false} onImported={(_, photos) => setAssets((a) => [...photos, ...(a ?? [])])} />
        <p className="mt-2 text-[12px] text-ink-2">Photos are resized to at most 2560 px and location data from phones is removed before they are saved. Use photos you have the rights to.</p>
      </div>

      <div className="mt-6 space-y-3">{error && (error.upgrade ? <UpgradeNote message={error.text} /> : <ErrorNote onRetry={load}>{error.text}</ErrorNote>)}</div>

      {assets === null && !error ? (
        <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => <li key={i} className="skeleton aspect-[4/3]" />)}
        </ul>
      ) : shown.length === 0 ? (
        <p className="mt-8 text-[15px] text-ink-2">{query ? <>No photos match &ldquo;{query}&rdquo;.</> : "No photos yet. Add some above, or import a PowerPoint, Word or PDF file in a new deck."}</p>
      ) : (
        <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {shown.map((a) => (
            <AssetCard
              key={a.id}
              a={a}
              onDelete={() => remove(a)}
              onSave={async (patch) => {
                try {
                  await backend.updateAsset(a.id, patch);
                  setAssets((list) => list?.map((x) => (x.id === a.id ? { ...x, ...patch } : x)) ?? null);
                } catch (e) {
                  fail(e, "Could not save the photo details.");
                  throw e;
                }
              }}
            />
          ))}
        </ul>
      )}
    </main>
  );
}

export default function AssetsPage() {
  return (
    <RequireUser>
      <AppHeader />
      <AssetsInner />
    </RequireUser>
  );
}
