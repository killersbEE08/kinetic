"use client";

// One interface for the UI, two implementations:
//  - cloud: Clerk session token → our API routes → Supabase / Gemini / Dodo
//  - demo:  no keys configured → decks in localStorage, offline generator in the browser
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useAuth } from "@clerk/nextjs";
import { newId } from "@/lib/deck/ids";
import { forgetAsset, prepareImage, primeAsset, setAssetLoader, type AssetMeta } from "./assets";
import { localAssets } from "./idb";
import type { Brand, Deck, GenerationInput, Intensity, Outline, Slide } from "@/lib/deck/schema";
import { Deck as DeckSchema } from "@/lib/deck/schema";
import type { EditScope, PatchOp } from "@/lib/deck/patch";
import { applyDeckPatch } from "@/lib/deck/patch";
import type { QaIssue } from "@/lib/deck/qa";
import { buildDeck } from "@/lib/deck/build";
import { offlineOutline, offlineSlides } from "@/lib/ai/offline";
import { buildProposal, EditError, offlineEdit } from "@/lib/ai/edit";
import { composeSlide } from "@/lib/deck/compose";
import { suggestedCount } from "@/lib/deck/stats";
import { snapshotBefore, type VersionKind, type VersionMeta } from "@/lib/deck/versions";
import { SERVER_EVENTS } from "@/lib/events";
import { demoSink, setTrackSink, track, type TrackedEvent } from "./track";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export interface DeckSummary {
  id: string;
  title: string;
  themeId: string;
  version: number;
  updatedAt: string;
  firstSlide: Slide | null;
  motionIntensity: Intensity;
  slideCount: number;
  brand?: Brand;
  /** Elements still marked "Suggested" (AI content not found in the user's material). */
  suggestedCount?: number;
  /** Set for decks in Trash: when it was deleted, and when it will be deleted for good. */
  deletedAt?: string;
  purgeAt?: string;
}

export interface Me {
  plan: "free" | "pro" | "team";
  planStatus: string;
  currentPeriodEnd: string | null;
  hasBillingAccount: boolean;
  creditsRemaining: number | null;
  /** This month's allowance right now (starter credits for new free accounts). */
  creditLimit?: number | null;
  /** Set when a free account has less than the full allowance, and why. */
  credits?: { reason: "starter" | "crowded" | "disposable"; full: number | null; unlockAt: string | null } | null;
  deckCount: number;
  features: { gemini: boolean; billing: boolean; storage: boolean; unsplash?: boolean; sharing?: boolean };
  storage?: { usedBytes: number; limitBytes: number; count: number };
}

export interface ShareOptions {
  name?: string;
  password?: string;
  allowDownload?: boolean;
  allowComments?: boolean;
  /** Alert the owner when someone opens the link. */
  notify?: boolean;
  expiresAt?: string | null;
}

export interface DeckComment {
  id: string;
  deckId: string;
  slideId: string;
  elementId: string | null;
  parentId: string | null;
  linkId: string | null;
  /** Name of the share link it came through ("Acme investors"). */
  linkName: string | null;
  authorName: string;
  authorEmail: string | null;
  byOwner: boolean;
  body: string;
  resolved: boolean;
  /** A viewer reported it; hidden from other viewers until you keep or delete it. */
  reported?: boolean;
  createdAt: string;
}

export interface NewCommentInput {
  slideId: string;
  elementId?: string;
  parentId?: string;
  body: string;
  authorName?: string;
}

export interface AppNotification {
  id: string;
  kind: "link_opened" | "link_viewed" | "comment";
  deckId: string | null;
  title: string;
  body: string;
  url: string | null;
  read: boolean;
  createdAt: string;
}

export interface AlertSettings {
  email: boolean;
  /** False when the server has no email provider configured. */
  emailAvailable: boolean;
  slack: boolean;
  slackHint: string | null;
}

export interface ShareLink {
  id: string;
  deckId: string;
  name: string;
  snapshotVersion: number;
  hasPassword: boolean;
  allowDownload: boolean;
  allowComments: boolean;
  notify: boolean;
  expiresAt: string | null;
  revoked: boolean;
  live: boolean;
  createdAt: string;
  updatedAt: string;
  stats: { views: number; viewers: number; totalMs: number; lastViewedAt: string | null };
  // Only from listShares() without a deck id:
  deckTitle?: string;
  slideCount?: number;
  perSlideMs?: number[];
  completed?: number;
  recent?: { at: string; lastSeenAt: string; email: string | null; country: string | null; device: string | null; slidesSeen: number; totalMs: number }[];
}

export interface BrandKit {
  id: string;
  kit: Brand;
  isDefault: boolean;
}

export interface StockPhoto {
  id: string;
  src: string;
  thumb: string;
  width: number;
  height: number;
  color: string | null;
  alt: string;
  author: string;
  authorUrl: string;
  downloadLocation: string;
}

export interface UploadInfo {
  name: string;
  alt?: string;
}

export interface EditResult {
  summary: string;
  ops: PatchOp[];
  issues: QaIssue[];
  changedSlideIds: string[];
  engine: "gemini" | "offline";
}

export interface GenerateArgs {
  input: GenerationInput;
  outline: Outline;
  themeId: string;
  intensity: Intensity;
}

export interface Backend {
  mode: "cloud" | "demo";
  ready: boolean;
  signedIn: boolean;
  listDecks(): Promise<DeckSummary[]>;
  getDeck(id: string): Promise<Deck>;
  createDeck(deck: Deck): Promise<Deck>;
  patchDeck(id: string, version: number, ops: PatchOp[], author: "user" | "ai"): Promise<number>;
  /** Moves a deck to Trash. */
  deleteDeck(id: string): Promise<void>;
  listTrash(): Promise<DeckSummary[]>;
  restoreDeck(id: string): Promise<void>;
  /** Deletes a deck in Trash for good. */
  purgeDeck(id: string): Promise<void>;
  /** Saved versions of a deck, newest first. */
  listVersions(deckId: string): Promise<VersionMeta[]>;
  getVersion(deckId: string, versionId: string): Promise<Deck>;
  saveVersion(deckId: string, opts?: { label?: string; kind?: "named" | "before-restore" }): Promise<void>;
  renameVersion(deckId: string, versionId: string, label: string): Promise<void>;
  deleteVersion(deckId: string, versionId: string): Promise<void>;
  outline(input: GenerationInput): Promise<{ outline: Outline; engine: string }>;
  generate(args: GenerateArgs, onSlide: (index: number, slide: Slide) => void, signal?: AbortSignal): Promise<{ deck: Deck; issues: QaIssue[]; engine: string }>;
  edit(deck: Deck, scope: EditScope, instruction: string): Promise<EditResult>;
  me(): Promise<Me | null>;
  checkout(plan: "pro" | "team", seats?: number): Promise<string>;
  portal(): Promise<string>;
  /** Uploaded photos. `where` says if they're in your account or only in this browser. */
  listAssets(): Promise<{ assets: AssetMeta[]; where: "cloud" | "browser" }>;
  /** Resizes, strips metadata, and stores an image. */
  uploadAsset(file: Blob, info: UploadInfo): Promise<AssetMeta>;
  updateAsset(id: string, patch: { alt?: string; name?: string }): Promise<void>;
  deleteAsset(id: string): Promise<void>;
  /** Sharing, brand kits and stock photos: see the methods at the end of this interface. */
  listShares(deckId?: string): Promise<ShareLink[]>;
  createShare(deckId: string, opts: ShareOptions): Promise<ShareLink>;
  updateShare(id: string, patch: Partial<Omit<ShareOptions, "password">> & { revoked?: boolean; refresh?: boolean; password?: string | null }): Promise<ShareLink>;
  deleteShare(id: string): Promise<void>;
  listBrandKits(): Promise<BrandKit[]>;
  saveBrandKit(kit: BrandKit): Promise<void>;
  deleteBrandKit(id: string): Promise<void>;
  searchStock(q: string, page?: number): Promise<{ photos: StockPhoto[]; pages: number }>;
  trackStock(downloadLocation: string): Promise<void>;
  /** Everything stored for this account, as a ZIP (decks as JSON plus photo files). */
  exportData(onProgress?: (msg: string) => void): Promise<Blob>;
  /** Session token to prove who you are on public routes (share links), or null in demo mode / signed out. */
  authToken(): Promise<string | null>;
  /** Permanently deletes the account, decks and photos. */
  deleteAccount(): Promise<void>;
  /** Comments on a deck (yours, and from share links that allow comments). */
  listComments(deckId: string): Promise<DeckComment[]>;
  addComment(deckId: string, c: NewCommentInput): Promise<DeckComment>;
  updateComment(id: string, patch: { resolved?: boolean; body?: string; keep?: true }): Promise<DeckComment>;
  deleteComment(id: string): Promise<void>;
  /** The bell: share-link opens, view summaries and comments. */
  listNotifications(): Promise<{ unread: number; items: AppNotification[] }>;
  markNotificationsRead(ids: string[] | "all"): Promise<void>;
  getAlertSettings(): Promise<AlertSettings>;
  saveAlertSettings(patch: { email?: boolean; slackUrl?: string | null }): Promise<void>;
  testAlert(): Promise<void>;
}

/** Zips the account data. Photos are fetched one by one so a large library doesn't spike memory. */
async function zipExport(data: Record<string, unknown>, photos: { id: string; name: string; mime: string }[], getPhoto: (id: string) => Promise<Blob>, onProgress?: (msg: string) => void): Promise<Blob> {
  const { zipSync, strToU8 } = await import("fflate");
  const files: Record<string, Uint8Array> = {
    "kinetic-export.json": strToU8(JSON.stringify(data, null, 2)),
    "README.txt": strToU8("Kinetic data export.\nkinetic-export.json: your decks (full documents), photo list and AI usage.\nphotos/: the photo files you uploaded.\nDecks can be re-imported by support on request.\n"),
  };
  const used = new Set<string>();
  for (const [i, p] of photos.entries()) {
    onProgress?.(`Adding photo ${i + 1} of ${photos.length}`);
    try {
      const ext = p.mime === "image/png" ? "png" : p.mime === "image/webp" ? "webp" : p.mime === "image/gif" ? "gif" : "jpg";
      let name = (p.name.replace(/[^\w .-]+/g, "").trim() || "photo").slice(0, 60);
      while (used.has(name)) name += "-" + p.id.slice(-4);
      used.add(name);
      files[`photos/${name}.${ext}`] = new Uint8Array(await (await getPhoto(p.id)).arrayBuffer());
    } catch {
      // A missing file shouldn't block the rest of the export.
    }
  }
  onProgress?.("Making the ZIP file");
  return new Blob([zipSync(files, { level: 0 }) as BlobPart], { type: "application/zip" });
}

async function toMeta(file: Blob, info: UploadInfo) {
  const img = await prepareImage(file);
  const name = info.name.trim().slice(0, 120) || "Photo";
  const meta: AssetMeta = {
    id: newId("as"),
    name,
    mime: img.mime,
    bytes: img.blob.size,
    width: img.width,
    height: img.height,
    alt: (info.alt ?? name).trim().slice(0, 250) || name,
    createdAt: new Date().toISOString(),
  };
  return { meta, blob: img.blob };
}

const browserAssets = {
  async list() {
    return { assets: await localAssets.list(), where: "browser" as const };
  },
  async upload(file: Blob, info: UploadInfo) {
    const { meta, blob } = await toMeta(file, info);
    await localAssets.put(meta, blob).catch((e: Error) => {
      throw new ApiError(507, e.message, "storage_full");
    });
    primeAsset(meta.id, blob);
    return meta;
  },
  async update(id: string, patch: { alt?: string; name?: string }) {
    await localAssets.update(id, patch);
  },
  async remove(id: string) {
    await localAssets.remove(id);
    forgetAsset(id);
  },
};

const BackendContext = createContext<Backend | null>(null);

export function useBackend(): Backend {
  const b = useContext(BackendContext);
  if (!b) throw new Error("useBackend must be used inside a BackendProvider");
  return b;
}

// ---------------------------------------------------------------------------
// Cloud

async function readError(res: Response): Promise<ApiError> {
  const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  return new ApiError(res.status, data.error ?? `Request failed (${res.status}).`, data.code);
}

export function CloudBackendProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();

  const call = useCallback(
    async (path: string, init: RequestInit = {}): Promise<Response> => {
      const token = await getToken();
      if (!token) throw new ApiError(401, "Sign in to continue.", "unauthenticated");
      const json = typeof init.body === "string";
      const res = await fetch(path, {
        ...init,
        headers: { ...(json ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${token}`, ...init.headers },
      });
      if (!res.ok) throw await readError(res);
      return res;
    },
    [getToken],
  );

  // Photo storage: R2 through our API when the server has it, otherwise this browser.
  const storage = useRef<"unknown" | "cloud" | "browser">("unknown");
  const isStorageOff = (e: unknown) => e instanceof ApiError && e.code === "storage_disabled";

  useEffect(() => {
    if (!isSignedIn) return;
    setAssetLoader(async (id) => {
      if (storage.current !== "browser") {
        try {
          return await (await call(`/api/assets/${encodeURIComponent(id)}`)).blob();
        } catch (e) {
          if (!isStorageOff(e)) throw e;
          storage.current = "browser";
        }
      }
      return localAssets.blob(id);
    });
  }, [call, isSignedIn]);

  const value = useMemo<Backend>(() => {
    const listAssets = async (): Promise<{ assets: AssetMeta[]; where: "cloud" | "browser" }> => {
      if (storage.current !== "browser") {
        try {
          const r = (await (await call("/api/assets")).json()) as { assets: AssetMeta[] };
          storage.current = "cloud";
          return { assets: r.assets, where: "cloud" };
        } catch (e) {
          if (!isStorageOff(e)) throw e;
          storage.current = "browser";
        }
      }
      return browserAssets.list();
    };
    return {
      mode: "cloud",
      ready: isLoaded,
      signedIn: !!isSignedIn,
      async listDecks() {
        return ((await (await call("/api/decks")).json()) as { decks: DeckSummary[] }).decks;
      },
      async getDeck(id) {
        return ((await (await call(`/api/decks/${encodeURIComponent(id)}`)).json()) as { deck: Deck }).deck;
      },
      async createDeck(deck) {
        return ((await (await call("/api/decks", { method: "POST", body: JSON.stringify({ deck }) })).json()) as { deck: Deck }).deck;
      },
      async patchDeck(id, version, ops, author) {
        const r = await call(`/api/decks/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ version, ops, author }) });
        return ((await r.json()) as { version: number }).version;
      },
      async deleteDeck(id) {
        await call(`/api/decks/${encodeURIComponent(id)}`, { method: "DELETE" });
      },
      async listTrash() {
        return ((await (await call("/api/decks?trash=1")).json()) as { decks: DeckSummary[] }).decks;
      },
      async restoreDeck(id) {
        await call(`/api/decks/${encodeURIComponent(id)}/restore`, { method: "POST" });
      },
      async purgeDeck(id) {
        await call(`/api/decks/${encodeURIComponent(id)}?permanent=1`, { method: "DELETE" });
      },
      async listVersions(deckId) {
        return ((await (await call(`/api/decks/${encodeURIComponent(deckId)}/versions`)).json()) as { versions: VersionMeta[] }).versions;
      },
      async getVersion(deckId, vid) {
        return ((await (await call(`/api/decks/${encodeURIComponent(deckId)}/versions/${encodeURIComponent(vid)}`)).json()) as { deck: Deck }).deck;
      },
      async saveVersion(deckId, opts = {}) {
        await call(`/api/decks/${encodeURIComponent(deckId)}/versions`, { method: "POST", body: JSON.stringify(opts) });
      },
      async renameVersion(deckId, vid, label) {
        await call(`/api/decks/${encodeURIComponent(deckId)}/versions/${encodeURIComponent(vid)}`, { method: "PATCH", body: JSON.stringify({ label }) });
      },
      async deleteVersion(deckId, vid) {
        await call(`/api/decks/${encodeURIComponent(deckId)}/versions/${encodeURIComponent(vid)}`, { method: "DELETE" });
      },
      async outline(input) {
        return (await (await call("/api/ai/outline", { method: "POST", body: JSON.stringify({ input }) })).json()) as { outline: Outline; engine: string };
      },
      async generate(args, onSlide, signal) {
        const res = await call("/api/ai/generate", { method: "POST", body: JSON.stringify(args), signal });
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (value) buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            const ev = JSON.parse(line);
            if (ev.type === "slide") onSlide(ev.index, ev.slide);
            else if (ev.type === "done") return { deck: ev.deck, issues: ev.issues, engine: ev.engine };
            else if (ev.type === "error") throw new ApiError(502, ev.error, ev.code);
          }
          if (done) break;
        }
        throw new ApiError(502, "The connection closed before the deck was finished. Try again.", "stream_closed");
      },
      async edit(deck, scope, instruction) {
        return (await (await call("/api/ai/edit", { method: "POST", body: JSON.stringify({ deck, scope, instruction }) })).json()) as EditResult;
      },
      async me() {
        return (await (await call("/api/me")).json()) as Me;
      },
      async checkout(plan, seats) {
        return ((await (await call("/api/billing/checkout", { method: "POST", body: JSON.stringify({ plan, seats }) })).json()) as { url: string }).url;
      },
      async portal() {
        return ((await (await call("/api/billing/portal", { method: "POST" })).json()) as { url: string }).url;
      },
      async listAssets() {
        return listAssets();
      },
      async uploadAsset(file, info) {
        if (storage.current === "unknown") await listAssets();
        if (storage.current === "browser") return browserAssets.upload(file, info);
        const { meta, blob } = await toMeta(file, info);
        const form = new FormData();
        form.set("file", blob, meta.name);
        form.set("meta", JSON.stringify({ id: meta.id, name: meta.name, alt: meta.alt, width: meta.width, height: meta.height }));
        const r = (await (await call("/api/assets", { method: "POST", body: form })).json()) as { asset: AssetMeta };
        primeAsset(r.asset.id, blob);
        return r.asset;
      },
      async updateAsset(id, patch) {
        if (storage.current === "browser") return browserAssets.update(id, patch);
        await call(`/api/assets/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
      },
      async deleteAsset(id) {
        if (storage.current === "browser") return browserAssets.remove(id);
        await call(`/api/assets/${encodeURIComponent(id)}`, { method: "DELETE" });
        forgetAsset(id);
      },
      async listShares(deckId) {
        const r = await call(deckId ? `/api/decks/${encodeURIComponent(deckId)}/shares` : "/api/shares");
        return ((await r.json()) as { links: ShareLink[] }).links;
      },
      async createShare(deckId, opts) {
        const r = await call(`/api/decks/${encodeURIComponent(deckId)}/shares`, { method: "POST", body: JSON.stringify(opts) });
        return ((await r.json()) as { link: ShareLink }).link;
      },
      async updateShare(id, patch) {
        const r = await call(`/api/shares/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
        return ((await r.json()) as { link: ShareLink }).link;
      },
      async deleteShare(id) {
        await call(`/api/shares/${encodeURIComponent(id)}`, { method: "DELETE" });
      },
      async listBrandKits() {
        return ((await (await call("/api/brand-kits")).json()) as { kits: BrandKit[] }).kits;
      },
      async saveBrandKit(kit) {
        await call("/api/brand-kits", { method: "PUT", body: JSON.stringify(kit) });
      },
      async deleteBrandKit(id) {
        await call(`/api/brand-kits?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      },
      async searchStock(q, page = 1) {
        return (await (await call(`/api/photos/unsplash?q=${encodeURIComponent(q)}&page=${page}`)).json()) as { photos: StockPhoto[]; pages: number };
      },
      async trackStock(downloadLocation) {
        await call("/api/photos/unsplash/download", { method: "POST", body: JSON.stringify({ downloadLocation }) }).catch(() => undefined);
      },
      async exportData(onProgress) {
        onProgress?.("Collecting your decks");
        const data = (await (await call("/api/me/account")).json()) as Record<string, unknown> & { photos?: { id: string; name: string; mime: string }[] };
        const cloudPhotos = data.photos ?? [];
        const local = await localAssets.list().catch(() => []);
        const getPhoto = async (id: string) => (cloudPhotos.some((p) => p.id === id) ? (await call(`/api/assets/${encodeURIComponent(id)}`)).blob() : localAssets.blob(id));
        return zipExport({ ...data, browserPhotos: local }, [...cloudPhotos, ...local], getPhoto, onProgress);
      },
      async deleteAccount() {
        await call("/api/me/account", { method: "DELETE", body: JSON.stringify({ confirm: "DELETE" }) });
        for (const a of await localAssets.list().catch(() => [])) await localAssets.remove(a.id).catch(() => undefined);
      },
      async listComments(deckId) {
        return ((await (await call(`/api/decks/${encodeURIComponent(deckId)}/comments`)).json()) as { comments: DeckComment[] }).comments;
      },
      async addComment(deckId, c) {
        const r = await call(`/api/decks/${encodeURIComponent(deckId)}/comments`, { method: "POST", body: JSON.stringify(c) });
        return ((await r.json()) as { comment: DeckComment }).comment;
      },
      async updateComment(id, patch) {
        const r = await call(`/api/comments/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
        return ((await r.json()) as { comment: DeckComment }).comment;
      },
      async deleteComment(id) {
        await call(`/api/comments/${encodeURIComponent(id)}`, { method: "DELETE" });
      },
      async listNotifications() {
        return (await (await call("/api/notifications")).json()) as { unread: number; items: AppNotification[] };
      },
      async markNotificationsRead(ids) {
        await call("/api/notifications", { method: "POST", body: JSON.stringify(ids === "all" ? { all: true } : { ids }) });
      },
      async getAlertSettings() {
        return (await (await call("/api/me/alerts")).json()) as AlertSettings;
      },
      async saveAlertSettings(patch) {
        await call("/api/me/alerts", { method: "PUT", body: JSON.stringify(patch) });
      },
      async testAlert() {
        await call("/api/me/alerts", { method: "POST", body: "{}" });
      },
      async authToken() {
        return isSignedIn ? ((await getToken().catch(() => null)) ?? null) : null;
      },
    };
  }, [call, isLoaded, isSignedIn, getToken]);

  // Product events: batched, sent a few seconds after the last one or when the page is hidden.
  useEffect(() => {
    if (!isSignedIn) return;
    let queue: TrackedEvent[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      const batch = queue.filter((e) => !SERVER_EVENTS.has(e.name)).slice(0, 25);
      queue = [];
      if (batch.length) void call("/api/activity", { method: "POST", body: JSON.stringify({ events: batch }), keepalive: true }).catch(() => undefined);
    };
    setTrackSink((e) => {
      queue.push(e);
      if (queue.length >= 20) flush();
      else if (!timer) timer = setTimeout(flush, 3000);
    });
    const onHide = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      flush();
      setTrackSink(null);
    };
  }, [call, isSignedIn]);

  return <BackendContext value={value}>{children}</BackendContext>;
}

// ---------------------------------------------------------------------------
// Demo (no keys). Same behaviour as the server's offline engine.

const STORE_KEY = "kinetic.demo.decks.v1";

function readStore(): Record<string, Deck> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as Record<string, unknown>;
    const out: Record<string, Deck> = {};
    for (const [k, v] of Object.entries(raw)) {
      const p = DeckSchema.safeParse(v);
      if (p.success) out[k] = p.data;
    }
    return out;
  } catch {
    return {};
  }
}

function writeStore(s: Record<string, Deck & { updatedAt?: string }>) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    throw new ApiError(507, "Your browser storage is full. Delete a deck and try again.", "storage_full");
  }
}

const updatedAtKey = "kinetic.demo.updated.v1";

const demoKits = {
  read(): BrandKit[] {
    try {
      return JSON.parse(localStorage.getItem("kinetic.demo.brandkits.v1") ?? "[]") as BrandKit[];
    } catch {
      return [];
    }
  },
  write(kits: BrandKit[]) {
    localStorage.setItem("kinetic.demo.brandkits.v1", JSON.stringify(kits));
  },
};
function touch(id: string) {
  const m = JSON.parse(localStorage.getItem(updatedAtKey) ?? "{}") as Record<string, string>;
  m[id] = new Date().toISOString();
  localStorage.setItem(updatedAtKey, JSON.stringify(m));
}

// Demo Trash and version history, kept in this browser. Storage is small, so demo mode keeps
// fewer automatic versions than the server and drops the oldest when the browser is full.
const TRASH_KEY = "kinetic.demo.trash.v1";
const VERSIONS_KEY = "kinetic.demo.versions.v1";
const DEMO_TRASH_DAYS = 30;
const DEMO_MAX_AUTO = 15;
type DemoVersion = VersionMeta & { doc: Deck };

function readJsonKey<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? "null") as T) ?? fallback;
  } catch {
    return fallback;
  }
}
const demoTrash = {
  read: () => readJsonKey<Record<string, { deck: Deck; deletedAt: string }>>(TRASH_KEY, {}),
  write: (t: Record<string, { deck: Deck; deletedAt: string }>) => localStorage.setItem(TRASH_KEY, JSON.stringify(t)),
};
const demoVersions = {
  read: () => readJsonKey<Record<string, DemoVersion[]>>(VERSIONS_KEY, {}),
  write(all: Record<string, DemoVersion[]>) {
    // Drop the oldest automatic versions until it fits in the browser's storage.
    for (;;) {
      try {
        localStorage.setItem(VERSIONS_KEY, JSON.stringify(all));
        return;
      } catch {
        let oldest: { deck: string; i: number; at: string } | null = null;
        for (const [deck, list] of Object.entries(all))
          list.forEach((v, i) => {
            if (v.kind !== "named" && (!oldest || v.createdAt < oldest.at)) oldest = { deck, i, at: v.createdAt };
          });
        if (!oldest) return;
        const o = oldest as { deck: string; i: number };
        all[o.deck].splice(o.i, 1);
      }
    }
  },
  add(deck: Deck, kind: VersionKind, label: string | null = null) {
    const all = demoVersions.read();
    const list = all[deck.id] ?? [];
    list.unshift({ id: newId("vr"), version: deck.version, kind, label, createdAt: new Date().toISOString(), title: deck.title, slideCount: deck.slides.length, doc: structuredClone(deck) });
    let auto = 0;
    all[deck.id] = list.filter((v) => v.kind === "named" || ++auto <= DEMO_MAX_AUTO);
    demoVersions.write(all);
  },
};

const COMMENTS_KEY = "kinetic.demo.comments.v1";
const demoComments = {
  read: () => readJsonKey<DeckComment[]>(COMMENTS_KEY, []),
  write(list: DeckComment[]) {
    try {
      localStorage.setItem(COMMENTS_KEY, JSON.stringify(list.slice(-1000)));
    } catch {
      throw new ApiError(507, "Your browser storage is full. Delete a deck and try again.", "storage_full");
    }
  },
};

function demoSummary(d: Deck, updatedAt: string): DeckSummary {
  return { id: d.id, title: d.title, themeId: d.themeId, version: d.version, updatedAt, firstSlide: d.slides[0] ?? null, motionIntensity: d.motionIntensity, slideCount: d.slides.length, brand: d.brand, suggestedCount: suggestedCount(d) };
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });

export function DemoBackendProvider({ children }: { children: ReactNode }) {
  const value = useMemo<Backend>(
    () => ({
      mode: "demo",
      ready: true,
      signedIn: true,
      async listDecks() {
        const s = readStore();
        const times = JSON.parse(localStorage.getItem(updatedAtKey) ?? "{}") as Record<string, string>;
        return Object.values(s)
          .map((d) => demoSummary(d, times[d.id] ?? new Date(0).toISOString()))
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      },
      async getDeck(id) {
        const d = readStore()[id];
        if (!d) throw new ApiError(404, "Deck not found.", "not_found");
        return d;
      },
      async createDeck(deck) {
        const s = readStore();
        s[deck.id] = { ...deck, version: 0 };
        writeStore(s);
        touch(deck.id);
        demoVersions.add(s[deck.id], "created");
        track("deck_created", { deckId: deck.id, props: { slides: deck.slides.length, suggested: suggestedCount(deck) } });
        return s[deck.id];
      },
      async patchDeck(id, version, ops, author) {
        const s = readStore();
        const d = s[id];
        if (!d) throw new ApiError(404, "Deck not found.", "not_found");
        if (d.version !== version) throw new ApiError(409, "This deck changed in another tab. Reload to get the latest version.", "conflict");
        const next = applyDeckPatch(d, ops).doc;
        const kind = snapshotBefore(version, author);
        if (kind) demoVersions.add(d, kind);
        s[id] = { ...next, version: version + 1 };
        writeStore(s);
        touch(id);
        return version + 1;
      },
      async deleteDeck(id) {
        const s = readStore();
        const d = s[id];
        if (!d) return;
        const t = demoTrash.read();
        t[id] = { deck: d, deletedAt: new Date().toISOString() };
        demoTrash.write(t);
        delete s[id];
        writeStore(s);
      },
      async listTrash() {
        const t = demoTrash.read();
        const cutoff = Date.now() - DEMO_TRASH_DAYS * 86_400_000;
        let purged = false;
        for (const [id, e] of Object.entries(t))
          if (new Date(e.deletedAt).getTime() < cutoff) {
            delete t[id];
            purged = true;
          }
        if (purged) demoTrash.write(t);
        return Object.values(t)
          .map((e) => ({ ...demoSummary(e.deck, e.deletedAt), deletedAt: e.deletedAt, purgeAt: new Date(new Date(e.deletedAt).getTime() + DEMO_TRASH_DAYS * 86_400_000).toISOString() }))
          .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
      },
      async restoreDeck(id) {
        const t = demoTrash.read();
        const e = t[id];
        if (!e) throw new ApiError(404, "That deck isn't in Trash.", "not_found");
        const s = readStore();
        s[id] = e.deck;
        writeStore(s);
        touch(id);
        delete t[id];
        demoTrash.write(t);
      },
      async purgeDeck(id) {
        const t = demoTrash.read();
        delete t[id];
        demoTrash.write(t);
        const v = demoVersions.read();
        delete v[id];
        demoVersions.write(v);
        demoComments.write(demoComments.read().filter((c) => c.deckId !== id));
      },
      async listVersions(deckId) {
        return (demoVersions.read()[deckId] ?? []).map(({ doc: _doc, ...meta }) => (void _doc, meta));
      },
      async getVersion(deckId, vid) {
        const v = (demoVersions.read()[deckId] ?? []).find((x) => x.id === vid);
        if (!v) throw new ApiError(404, "Version not found.", "not_found");
        return v.doc;
      },
      async saveVersion(deckId, opts = {}) {
        const d = readStore()[deckId];
        if (!d) throw new ApiError(404, "Deck not found.", "not_found");
        const kind = opts.kind ?? "named";
        demoVersions.add(d, kind, kind === "named" ? opts.label?.trim().slice(0, 80) || null : null);
      },
      async renameVersion(deckId, vid, label) {
        const all = demoVersions.read();
        const v = all[deckId]?.find((x) => x.id === vid);
        if (!v) throw new ApiError(404, "Version not found.", "not_found");
        v.label = label.trim().slice(0, 80);
        v.kind = "named";
        demoVersions.write(all);
      },
      async deleteVersion(deckId, vid) {
        const all = demoVersions.read();
        all[deckId] = (all[deckId] ?? []).filter((x) => x.id !== vid);
        demoVersions.write(all);
      },
      async outline(input) {
        await sleep(350);
        const outline = offlineOutline(input);
        track("outline_created", { props: { engine: "offline", slides: outline.slides.length, deckType: input.deckType } });
        return { outline, engine: "offline" };
      },
      async generate(args, onSlide, signal) {
        const slotted = offlineSlides(args.outline);
        const source = `${args.input.prompt}\n\n${args.input.notes}`.trim();
        const { deck, issues } = buildDeck({ title: args.outline.title, slides: slotted, themeId: args.themeId, intensity: args.intensity, language: args.input.language, sourceText: source });
        for (let i = 0; i < deck.slides.length; i++) {
          await sleep(180, signal);
          onSlide(i, deck.slides[i]);
        }
        return { deck, issues, engine: "offline" };
      },
      async edit(deck, scope, instruction) {
        await sleep(250);
        try {
          const { summary, change } = offlineEdit(deck, scope, instruction);
          const p = buildProposal(deck, scope, change, summary, deck.source);
          return { summary: p.summary, ops: p.ops, issues: p.issues, changedSlideIds: p.changedSlideIds, engine: "offline" };
        } catch (e) {
          if (e instanceof EditError) throw new ApiError(422, e.message, "edit_rejected");
          throw e;
        }
      },
      async me() {
        return null;
      },
      async checkout() {
        throw new ApiError(503, "Payments need sign-in. Add Clerk, Supabase and Dodo keys to enable them.", "billing_disabled");
      },
      async portal() {
        throw new ApiError(503, "Payments need sign-in.", "billing_disabled");
      },
      listAssets: browserAssets.list,
      uploadAsset: browserAssets.upload,
      updateAsset: browserAssets.update,
      deleteAsset: browserAssets.remove,
      async listShares() {
        return [];
      },
      async createShare() {
        throw new ApiError(503, "Share links need an account. Add Clerk and Supabase keys to turn them on.", "share_disabled");
      },
      async updateShare() {
        throw new ApiError(503, "Share links need an account.", "share_disabled");
      },
      async deleteShare() {},
      async listBrandKits() {
        return demoKits.read();
      },
      async saveBrandKit(kit) {
        const all = demoKits.read().filter((k) => k.id !== kit.id).map((k) => (kit.isDefault ? { ...k, isDefault: false } : k));
        demoKits.write([...all, kit]);
      },
      async deleteBrandKit(id) {
        demoKits.write(demoKits.read().filter((k) => k.id !== id));
      },
      async searchStock() {
        throw new ApiError(503, "Stock photo search needs the server. Add an UNSPLASH_ACCESS_KEY and sign-in keys to turn it on.", "unsplash_disabled");
      },
      async trackStock() {},
      async exportData(onProgress) {
        const photos = await localAssets.list();
        return zipExport({ exportedAt: new Date().toISOString(), mode: "demo", decks: Object.values(readStore()), photos }, photos, (id) => localAssets.blob(id), onProgress);
      },
      async deleteAccount() {
        localStorage.removeItem(STORE_KEY);
        localStorage.removeItem(updatedAtKey);
        localStorage.removeItem(TRASH_KEY);
        localStorage.removeItem(VERSIONS_KEY);
        localStorage.removeItem(COMMENTS_KEY);
        for (const a of await localAssets.list()) await browserAssets.remove(a.id);
      },
      async listComments(deckId) {
        return demoComments.read().filter((c) => c.deckId === deckId);
      },
      async addComment(deckId, c) {
        if (!readStore()[deckId]) throw new ApiError(404, "Deck not found.", "not_found");
        const all = demoComments.read();
        if (c.parentId && !all.some((x) => x.id === c.parentId && !x.parentId)) throw new ApiError(400, "Reply to the first comment of the thread.", "invalid_input");
        const comment: DeckComment = { id: crypto.randomUUID(), deckId, slideId: c.slideId, elementId: c.elementId ?? null, parentId: c.parentId ?? null, linkId: null, linkName: null, authorName: c.authorName ?? "You", authorEmail: null, byOwner: true, body: c.body.trim().slice(0, 2000), resolved: false, createdAt: new Date().toISOString() };
        demoComments.write([...all, comment]);
        track("comment_added", { deckId, props: { reply: !!c.parentId, by: "owner" } });
        return comment;
      },
      async updateComment(id, patch) {
        const all = demoComments.read();
        const c = all.find((x) => x.id === id);
        if (!c) throw new ApiError(404, "Comment not found.", "not_found");
        if (patch.resolved !== undefined) c.resolved = patch.resolved;
        if (patch.keep) c.reported = false;
        if (patch.body !== undefined) c.body = patch.body.trim().slice(0, 2000);
        demoComments.write(all);
        return c;
      },
      async deleteComment(id) {
        demoComments.write(demoComments.read().filter((x) => x.id !== id && x.parentId !== id));
      },
      async listNotifications() {
        return { unread: 0, items: [] };
      },
      async markNotificationsRead() {},
      async getAlertSettings() {
        throw new ApiError(503, "Alerts need an account. Add Clerk and Supabase keys to turn them on.", "alerts_disabled");
      },
      async saveAlertSettings() {
        throw new ApiError(503, "Alerts need an account.", "alerts_disabled");
      },
      async testAlert() {
        throw new ApiError(503, "Alerts need an account.", "alerts_disabled");
      },
      async authToken() {
        return null;
      },
    }),
    [],
  );
  useEffect(() => setAssetLoader((id) => localAssets.blob(id)), []);
  useEffect(() => {
    setTrackSink(demoSink);
    return () => setTrackSink(null);
  }, []);
  return <BackendContext value={value}>{children}</BackendContext>;
}

/** Used by the editor's "Add slide". */
export const blankSlide = () => composeSlide({ layout: "headlineBody", slots: [{ slot: "title", text: "New slide" }, { slot: "body", text: "Click to edit this text." }] });
