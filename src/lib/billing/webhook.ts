// Standard Webhooks signature verification (used by Dodo Payments), Web Crypto only so it
// runs on Cloudflare Workers. Spec: https://www.standardwebhooks.com/
// Signed content: `${webhook-id}.${webhook-timestamp}.${rawBody}`, HMAC-SHA256 with the
// base64-decoded secret (after stripping "whsec_"). Header: space-separated "v1,<base64sig>".

const TOLERANCE_SECONDS = 5 * 60;

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: ArrayBuffer): string {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface WebhookHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

export type VerifyResult = { ok: true } | { ok: false; reason: string };

export async function signWebhook(secret: string, id: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", base64ToBytes(secret.replace(/^whsec_/, "")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`));
  return bytesToBase64(sig);
}

export async function verifyWebhook(secret: string, h: WebhookHeaders, rawBody: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<VerifyResult> {
  if (!h.id || !h.timestamp || !h.signature) return { ok: false, reason: "missing headers" };
  const ts = Number(h.timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "bad timestamp" };
  if (Math.abs(nowSeconds - ts) > TOLERANCE_SECONDS) return { ok: false, reason: "timestamp outside tolerance" };

  let expected: string;
  try {
    expected = await signWebhook(secret, h.id, h.timestamp, rawBody);
  } catch {
    return { ok: false, reason: "invalid secret" };
  }
  const candidates = h.signature
    .split(" ")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("v1,"))
    .map((s) => s.slice(3));
  return candidates.some((c) => timingSafeEqual(c, expected)) ? { ok: true } : { ok: false, reason: "signature mismatch" };
}
