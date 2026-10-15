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
}

export interface Me {
  plan: "free" | "pro" | "team";
  planStatus: string;
  currentPeriodEnd: string | null;
  hasBillingAccount: boolean;
  creditsRemaining: number | null;
  deckCount: number;
  features: { gemini: boolean; billing: boolean; storage: boolean };
  storage?: { usedBytes: number; limitBytes: number; count: number };
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
  deleteDeck(id: string): Promise<void>;
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
    };
  }, [call, isLoaded, isSignedIn]);

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
function touch(id: string) {
  const m = JSON.parse(localStorage.getItem(updatedAtKey) ?? "{}") as Record<string, string>;
  m[id] = new Date().toISOString();
  localStorage.setItem(updatedAtKey, JSON.stringify(m));
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
          .map((d) => ({ id: d.id, title: d.title, themeId: d.themeId, version: d.version, updatedAt: times[d.id] ?? new Date(0).toISOString(), firstSlide: d.slides[0] ?? null, motionIntensity: d.motionIntensity, slideCount: d.slides.length, brand: d.brand }))
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
        return s[deck.id];
      },
      async patchDeck(id, version, ops) {
        const s = readStore();
        const d = s[id];
        if (!d) throw new ApiError(404, "Deck not found.", "not_found");
        if (d.version !== version) throw new ApiError(409, "This deck changed in another tab. Reload to get the latest version.", "conflict");
        const next = applyDeckPatch(d, ops).doc;
        s[id] = { ...next, version: version + 1 };
        writeStore(s);
        touch(id);
        return version + 1;
      },
      async deleteDeck(id) {
        const s = readStore();
        delete s[id];
        writeStore(s);
      },
      async outline(input) {
        await sleep(350);
        return { outline: offlineOutline(input), engine: "offline" };
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
    }),
    [],
  );
  useEffect(() => setAssetLoader((id) => localAssets.blob(id)), []);
  return <BackendContext value={value}>{children}</BackendContext>;
}

/** Used by the editor's "Add slide". */
export const blankSlide = () => composeSlide({ layout: "headlineBody", slots: [{ slot: "title", text: "New slide" }, { slot: "body", text: "Click to edit this text." }] });
