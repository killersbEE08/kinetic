"use client";

// Browser-only photo storage for demo mode (and as a fallback when cloud storage isn't set up).
import type { AssetMeta } from "./assets";

const DB = "kinetic-assets";
const STORE = "files";

interface Row {
  meta: AssetMeta;
  blob: Blob;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "meta.id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  });
}

export const localAssets = {
  async list(): Promise<AssetMeta[]> {
    const rows = await tx<Row[]>("readonly", (s) => s.getAll() as IDBRequest<Row[]>);
    return rows.map((r) => r.meta).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async put(meta: AssetMeta, blob: Blob): Promise<void> {
    try {
      await tx("readwrite", (s) => s.put({ meta, blob } satisfies Row));
    } catch {
      throw new Error("Your browser storage is full. Delete some photos and try again.");
    }
  },
  async blob(id: string): Promise<Blob> {
    const row = await tx<Row | undefined>("readonly", (s) => s.get(id) as IDBRequest<Row | undefined>);
    if (!row) throw new Error("not found");
    return row.blob;
  },
  async update(id: string, patch: Partial<Pick<AssetMeta, "alt" | "name">>): Promise<void> {
    const row = await tx<Row | undefined>("readonly", (s) => s.get(id) as IDBRequest<Row | undefined>);
    if (!row) throw new Error("not found");
    await tx("readwrite", (s) => s.put({ ...row, meta: { ...row.meta, ...patch } }));
  },
  async remove(id: string): Promise<void> {
    await tx("readwrite", (s) => s.delete(id));
  },
};
