"use client";

// Uploaded photos ("asset:<id>" in a deck). Files are private: in cloud mode they come from
// /api/assets/<id> with the session token, in demo mode from IndexedDB. Either way the browser
// turns them into blob: URLs, so <img> never needs credentials and nothing is public.
import { useEffect, useSyncExternalStore } from "react";
import { assetIdOf } from "@/lib/deck/media";

export interface AssetMeta {
  id: string;
  name: string;
  mime: string;
  bytes: number;
  width: number;
  height: number;
  alt: string;
  createdAt: string;
}

/** Image types we accept. SVG is left out on purpose: it can carry scripts. */
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // before resizing
export const MAX_STORED_BYTES = 5 * 1024 * 1024; // after resizing (server limit too)
const MAX_EDGE = 2560;

type Entry = { status: "loading" } | { status: "ready"; url: string } | { status: "missing" };

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let loader: ((id: string) => Promise<Blob>) | null = null;
const waiting = new Set<string>();

function emit() {
  for (const l of listeners) l();
}

/** Called by the backend provider. Ids requested before a loader exists are loaded now. */
export function setAssetLoader(fn: (id: string) => Promise<Blob>) {
  loader = fn;
  for (const id of waiting) void load(id);
  waiting.clear();
}

async function load(id: string) {
  if (!loader) {
    waiting.add(id);
    return;
  }
  entries.set(id, { status: "loading" });
  try {
    const blob = await loader(id);
    entries.set(id, { status: "ready", url: URL.createObjectURL(blob) });
  } catch {
    entries.set(id, { status: "missing" });
  }
  emit();
}

function request(id: string) {
  if (!entries.has(id)) void load(id);
}

/** Puts a freshly uploaded file in the cache so it shows without a second download. */
export function primeAsset(id: string, blob: Blob) {
  const prev = entries.get(id);
  if (prev?.status === "ready") URL.revokeObjectURL(prev.url);
  entries.set(id, { status: "ready", url: URL.createObjectURL(blob) });
  emit();
}

export function forgetAsset(id: string) {
  const prev = entries.get(id);
  if (prev?.status === "ready") URL.revokeObjectURL(prev.url);
  entries.delete(id);
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * URL to show for an uploaded photo: a blob: URL when loaded, null while loading,
 * "missing" when the file was deleted or can't be read.
 */
export function useAssetUrl(src: string | null | undefined): string | null | "missing" {
  const id = src ? assetIdOf(src) : null;
  useEffect(() => {
    if (id) request(id);
  }, [id]);
  return useSyncExternalStore(
    subscribe,
    () => {
      if (!id) return null;
      const e = entries.get(id);
      return e?.status === "ready" ? e.url : e?.status === "missing" ? "missing" : null;
    },
    () => null,
  );
}

/** Resolves once every listed asset is loaded (or failed). Used before export. */
export async function preloadAssets(ids: string[]): Promise<void> {
  await Promise.all(
    [...new Set(ids)].map(async (id) => {
      if (!entries.has(id)) await load(id);
      while (entries.get(id)?.status === "loading") await new Promise((r) => setTimeout(r, 30));
    }),
  );
}

export function assetUrlNow(id: string): string | null {
  const e = entries.get(id);
  return e?.status === "ready" ? e.url : null;
}

// ---------------------------------------------------------------------------
// Image preparation: decode, check, resize, re-encode. Re-encoding also strips EXIF
// (including GPS location) from phone photos.

export class AssetError extends Error {}

export interface PreparedImage {
  blob: Blob;
  mime: string;
  width: number;
  height: number;
}

export function niceName(fileName: string): string {
  const base = fileName.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  const text = base && !/^(img|dsc|image|photo|screenshot)?\s*\d+$/i.test(base) ? base : "Photo";
  return (text.charAt(0).toUpperCase() + text.slice(1)).slice(0, 120);
}

function hasAlpha(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const step = Math.max(1, Math.floor(Math.min(w, h) / 40));
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) if (data[(y * w + x) * 4 + 3] < 250) return true;
  return false;
}

export async function prepareImage(file: Blob): Promise<PreparedImage> {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) throw new AssetError("Use a JPG, PNG, WebP or GIF image.");
  if (file.size > MAX_UPLOAD_BYTES) throw new AssetError("That image is over 15 MB. Use a smaller one.");
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new AssetError("That file couldn't be read as an image.");
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
  const width = Math.max(1, Math.round(bmp.width * scale));
  const height = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new AssetError("Your browser couldn't process that image.");
  ctx.drawImage(bmp, 0, 0, width, height);
  bmp.close();
  const keepAlpha = file.type !== "image/jpeg" && hasAlpha(ctx, width, height);
  const mime = keepAlpha ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, mime, 0.86));
  if (!blob) throw new AssetError("Your browser couldn't process that image.");
  if (blob.size > MAX_STORED_BYTES) throw new AssetError("That image is too detailed to store. Try a smaller one.");
  return { blob, mime, width, height };
}
