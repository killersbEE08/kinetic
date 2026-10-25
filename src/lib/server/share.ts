import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";
import { HttpError } from "./auth-error";
import type { Deck } from "@/lib/deck/schema";
import { presentable } from "@/lib/deck/slides";

// Share links: ids, passwords, and signed viewer sessions. Web Crypto only (runs on Workers).

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf instanceof Uint8Array ? buf : new Uint8Array(buf))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/** 22-character random link id (128 bits): unguessable, URL-safe. */
export function newShareId(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(16)));
}

export const SHARE_ID_RX = /^[A-Za-z0-9_-]{16,40}$/;

/** Secret used to sign viewer sessions. A dedicated secret is preferred; falls back to one derived from the service key. */
async function signingKey(): Promise<CryptoKey> {
  const secret = env("SHARE_SIGNING_SECRET") ?? `kinetic-share:${env("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`;
  if (secret.length < 24) throw new HttpError(503, "Sharing is not configured on this server.", "share_disabled");
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function hmac(data: string): Promise<string> {
  return b64url(await crypto.subtle.sign("HMAC", await signingKey(), enc.encode(data)));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/**
 * Token a viewer sends back with time beats, photo requests and comments: proves it opened this
 * link. Session 0 is the owner previewing their own link (nothing is recorded for it).
 */
export async function sessionToken(linkId: string, sessionId: number): Promise<string> {
  return `${sessionId}.${await hmac(`view:${linkId}:${sessionId}`)}`;
}

/** The session id (0 for an owner preview), or null when the token isn't valid for this link. */
export async function verifySessionToken(linkId: string, token: string | null | undefined): Promise<number | null> {
  if (!token || token.length > 200) return null;
  const [sid, sig] = token.split(".");
  const id = Number(sid);
  if (!Number.isInteger(id) || id < 0 || !sig) return null;
  return safeEqual(sig, await hmac(`view:${linkId}:${id}`)) ? id : null;
}

/** True when the DeckIQ team took this link down. Fails open if the table doesn't exist yet. */
export async function linkBlocked(db: SupabaseClient, linkId: string): Promise<boolean> {
  const { data, error } = await db.from("blocked_links").select("link_id").eq("link_id", linkId).maybeSingle();
  if (error) return false;
  return !!data;
}

export const BLOCKED_MESSAGE = "This link was removed because it broke DeckIQ's rules.";

/** PBKDF2-SHA256, 100k iterations: "pbkdf2$<iter>$<salt>$<hash>". */
export async function hashPassword(pw: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100_000 }, key, 256);
  return `pbkdf2$100000$${b64url(salt)}$${b64url(bits)}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, iter, saltB64, hashB64] = stored.split("$");
  if (alg !== "pbkdf2" || !saltB64 || !hashB64) return false;
  const salt = Uint8Array.from(atob(saltB64.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: Number(iter) || 100_000 }, key, 256);
  return safeEqual(b64url(bits), hashB64);
}

/** Daily-rotating viewer fingerprint: counts unique viewers without storing IP addresses. */
export async function viewerHash(ip: string, ua: string): Promise<string> {
  const day = new Date().toISOString().slice(0, 10);
  return (await hmac(`viewer:${day}:${ip}:${ua.slice(0, 200)}`)).slice(0, 22);
}

export function deviceOf(ua: string): string {
  if (/ipad|tablet/i.test(ua)) return "tablet";
  if (/mobi|android|iphone/i.test(ua)) return "phone";
  return "desktop";
}

export interface LinkRow {
  id: string;
  deck_id: string;
  owner_id: string;
  name: string;
  snapshot: unknown;
  snapshot_version: number;
  password_hash: string | null;
  allow_download: boolean;
  allow_comments?: boolean;
  notify?: boolean;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export const linkLive = (l: Pick<LinkRow, "revoked_at" | "expires_at">) => !l.revoked_at && (!l.expires_at || new Date(l.expires_at).getTime() > Date.now());

/** Asset ids ("asset:<id>") used by a deck snapshot, so the viewer can only fetch those. */
export function snapshotAssetIds(snapshot: unknown): Set<string> {
  const out = new Set<string>();
  const json = JSON.stringify(snapshot ?? {});
  for (const m of json.matchAll(/"asset:([a-z0-9_-]{8,32})"/g)) out.add(m[1]);
  return out;
}

export const LINK_COLS = "id, deck_id, name, snapshot_version, password_hash, allow_download, allow_comments, notify, expires_at, revoked_at, created_at, updated_at";

/** What the owner sees about a link (never the password hash itself). */
export function publicLink(l: Omit<LinkRow, "snapshot" | "owner_id">, stats?: { views: number; viewers: number; totalMs: number; lastViewedAt: string | null }) {
  return {
    id: l.id,
    deckId: l.deck_id,
    name: l.name,
    snapshotVersion: l.snapshot_version,
    hasPassword: !!l.password_hash,
    allowDownload: l.allow_download,
    allowComments: !!l.allow_comments,
    notify: l.notify ?? true,
    expiresAt: l.expires_at,
    revoked: !!l.revoked_at,
    live: linkLive(l),
    createdAt: l.created_at,
    updatedAt: l.updated_at,
    stats: stats ?? { views: 0, viewers: 0, totalMs: 0, lastViewedAt: null },
  };
}

/** The deck as viewers get it: without the user's original notes, and without hidden slides. */
export function snapshotOf(doc: Deck): Deck {
  const { source: _source, ...rest } = presentable(doc); // eslint-disable-line @typescript-eslint/no-unused-vars -- dropped on purpose
  return rest as Deck;
}



/** The joined deck row comes back as an object or a one-item array depending on the relation. */
export function deckDeleted(row: unknown): boolean {
  const d = (row as { decks?: { deleted_at: string | null } | { deleted_at: string | null }[] } | null)?.decks;
  const one = Array.isArray(d) ? d[0] : d;
  return !!one?.deleted_at;
}
