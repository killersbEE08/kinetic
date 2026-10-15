"use client";

// Shared UI for files and photos: the drop zone (documents + images), photo thumbnails,
// and the library picker dialog.
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ApiError, useBackend } from "@/lib/client/backend";
import { AssetError, niceName, useAssetUrl, type AssetMeta } from "@/lib/client/assets";
import { IMPORT_ACCEPT, ImportError, importFile, importKind, isImageFile, type ImportResult } from "@/lib/client/import";
import { ASSET_PREFIX } from "@/lib/deck/media";

export interface ImportedDoc {
  id: string;
  name: string;
  kind: ImportResult["kind"];
  text: string;
  words: number;
  note?: string;
}

const KIND_LABEL: Record<ImportResult["kind"], string> = { pdf: "PDF", docx: "Word", pptx: "PowerPoint", xlsx: "Excel", csv: "CSV", text: "Text" };
export const kindLabel = (k: ImportResult["kind"]) => KIND_LABEL[k];

const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

function message(e: unknown, fallback: string) {
  return e instanceof ImportError || e instanceof AssetError || e instanceof ApiError ? e.message : fallback;
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

/** Thumbnail of an uploaded photo. */
export function AssetThumb({ id, alt, className = "" }: { id: string; alt: string; className?: string }) {
  const url = useAssetUrl(ASSET_PREFIX + id);
  if (url === "missing") return <div className={`flex items-center justify-center bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] text-[12px] text-ink-2 ${className}`}>Not found</div>;
  if (!url) return <div className={`skeleton ${className}`} aria-hidden="true" />;
  // eslint-disable-next-line @next/next/no-img-element -- blob: URL of the user's upload
  return <img src={url} alt={alt} className={`object-cover ${className}`} draggable={false} />;
}

/**
 * Drop zone for documents and photos. Documents are read in the browser; photos (dropped
 * directly or found inside documents) are added to the user's library.
 */
export function ImportZone({
  onImported,
  allowDocs = true,
  allowPhotos = true,
  compact = false,
  children,
}: {
  onImported: (docs: ImportedDoc[], photos: AssetMeta[]) => void;
  allowDocs?: boolean;
  allowPhotos?: boolean;
  compact?: boolean;
  children?: ReactNode;
}) {
  const backend = useBackend();
  const inputId = useId();
  const [over, setOver] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [summary, setSummary] = useState<string | null>(null);

  const handle = useCallback(
    async (list: FileList | File[]) => {
      const files = Array.from(list).slice(0, 20);
      if (!files.length) return;
      setErrors([]);
      setSummary(null);
      const docs: ImportedDoc[] = [];
      const photos: AssetMeta[] = [];
      const errs: string[] = [];
      let fromDocs = 0;
      for (const f of files) {
        try {
          if (isImageFile(f)) {
            if (!allowPhotos) throw new ImportError(`${f.name}: drop photos on the photo area instead.`);
            setStatus(`Adding ${f.name}`);
            photos.push(await backend.uploadAsset(f, { name: niceName(f.name) }));
          } else {
            if (!allowDocs) throw new ImportError(`${f.name}: only photos can be added here.`);
            if (!importKind(f.name)) throw new ImportError(`${f.name}: use PDF, Word, PowerPoint, Excel, CSV or text.`);
            setStatus(`Reading ${f.name}`);
            const r = await importFile(f);
            docs.push({ id: `${f.name}-${f.size}-${f.lastModified}`, name: r.name, kind: r.kind, text: r.text, words: wordCount(r.text), note: r.note });
            if (allowPhotos) {
              for (const [k, img] of r.images.entries()) {
                setStatus(`Saving photo ${k + 1} of ${r.images.length} from ${f.name}`);
                try {
                  photos.push(await backend.uploadAsset(img.blob, { name: `${niceName(f.name)} ${k + 1}` }));
                  fromDocs++;
                } catch (e) {
                  errs.push(message(e, `A photo in ${f.name} couldn't be saved.`));
                  if (e instanceof ApiError && (e.status === 402 || e.status === 507)) break;
                }
              }
            }
          }
        } catch (e) {
          errs.push(message(e, `${f.name} couldn't be read.`));
        }
      }
      setStatus(null);
      setErrors(errs);
      const parts = [docs.length && `${docs.length} file${docs.length > 1 ? "s" : ""} read`, photos.length && `${photos.length} photo${photos.length > 1 ? "s" : ""} added to your library${fromDocs ? ` (${fromDocs} found inside your files)` : ""}`].filter(Boolean);
      if (parts.length) setSummary(parts.join(", ") + ".");
      if (docs.length || photos.length) onImported(docs, photos);
    },
    [allowDocs, allowPhotos, backend, onImported],
  );

  const accept = [allowDocs ? IMPORT_ACCEPT : "", allowPhotos ? "image/jpeg,image/png,image/webp,image/gif" : ""].filter(Boolean).join(",");
  const what = allowDocs && allowPhotos ? "files or photos" : allowDocs ? "files" : "photos";

  return (
    <div>
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void handle(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-[10px] border-2 border-dashed text-center transition-colors ${over ? "border-accent bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface))]" : "border-line hover:border-ink-2"} ${compact ? "px-4 py-4" : "px-6 py-8"}`}
        aria-busy={!!status}
      >
        {children ?? (
          <>
            <span className="text-[15px] font-medium">Drop {what} here, or <span className="text-accent underline">browse</span></span>
            <span className="text-[13px] text-ink-2">
              {allowDocs && "PDF, Word, PowerPoint, Excel, CSV, text"}
              {allowDocs && allowPhotos && " · "}
              {allowPhotos && "JPG, PNG, WebP, GIF photos"}
            </span>
          </>
        )}
        <input
          id={inputId}
          type="file"
          multiple
          accept={accept}
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) void handle(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      <div aria-live="polite" className="mt-2 space-y-1 text-[13px]">
        {status && <p className="text-ink-2" role="status">{status}</p>}
        {summary && !status && <p className="text-ink-2">{summary}</p>}
        {errors.map((e, i) => (
          <p key={i} className="text-danger" role="alert">{e}</p>
        ))}
      </div>
    </div>
  );
}

/** Dialog to pick photos from the library (and upload more). */
export function LibraryPicker({ open, onClose, onPick, multiple = true, title = "Choose photos" }: { open: boolean; onClose: () => void; onPick: (assets: AssetMeta[]) => void; multiple?: boolean; title?: string }) {
  const backend = useBackend();
  const ref = useRef<HTMLDialogElement>(null);
  const [assets, setAssets] = useState<AssetMeta[] | null>(null);
  const [where, setWhere] = useState<"cloud" | "browser">("cloud");
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    backend
      .listAssets()
      .then((r) => {
        if (cancelled) return;
        setAssets(r.assets);
        setWhere(r.where);
      })
      .catch((e) => !cancelled && setError(message(e, "Could not load your photos.")));
    return () => {
      cancelled = true;
    };
  }, [open, backend]);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : multiple ? [...p, id] : [id]));

  return (
    <dialog ref={ref} onClose={onClose} className="m-auto w-[min(880px,calc(100vw-32px))] rounded-[20px] border border-line bg-surface p-0 text-ink backdrop:bg-black/40" aria-labelledby="lib-title">
      <div className="flex items-center justify-between border-b border-line px-6 py-4">
        <h2 id="lib-title" className="text-[17px] font-semibold">{title}</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
      </div>
      <div className="max-h-[60vh] overflow-y-auto px-6 py-5">
        <ImportZone allowDocs={false} compact onImported={(_, photos) => {
          setAssets((a) => [...photos, ...(a ?? [])]);
          setPicked((p) => (multiple ? [...photos.map((x) => x.id), ...p] : photos[0] ? [photos[0].id] : p));
        }} />
        {where === "browser" && <p className="mt-2 text-[12px] text-ink-2">Photos are saved in this browser only.</p>}
        {error && <p className="mt-3 text-[13px] text-danger" role="alert">{error}</p>}
        {assets === null && !error ? (
          <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4" aria-busy="true">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton aspect-[4/3]" />)}
          </div>
        ) : assets && assets.length === 0 ? (
          <p className="mt-5 text-[14px] text-ink-2">No photos yet. Add some above.</p>
        ) : (
          <ul className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4" role="listbox" aria-multiselectable={multiple} aria-label="Your photos">
            {assets?.map((a) => {
              const on = picked.includes(a.id);
              return (
                <li key={a.id} role="option" aria-selected={on}>
                  <button type="button" onClick={() => toggle(a.id)} className={`relative block w-full overflow-hidden rounded-[8px] border-2 ${on ? "border-accent" : "border-transparent hover:border-line"}`} aria-label={`${on ? "Unselect" : "Select"} ${a.alt}`}>
                    <AssetThumb id={a.id} alt="" className="aspect-[4/3] w-full" />
                    {on && <span className="absolute right-1.5 top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-1.5 text-[12px] font-semibold text-white">{multiple ? picked.indexOf(a.id) + 1 : "✓"}</span>}
                  </button>
                  <p className="mt-1 truncate text-[12px] text-ink-2">{a.name}</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
        <span className="text-[13px] text-ink-2">{picked.length ? `${picked.length} selected` : multiple ? "Pick one or more photos" : "Pick a photo"}</span>
        <div className="flex gap-2">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!picked.length}
            onClick={() => {
              const byId = new Map((assets ?? []).map((a) => [a.id, a]));
              onPick(picked.map((id) => byId.get(id)).filter((a): a is AssetMeta => !!a));
              setPicked([]);
              onClose();
            }}
          >
            {multiple ? "Use photos" : "Use photo"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
