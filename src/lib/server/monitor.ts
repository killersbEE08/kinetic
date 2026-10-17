import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { env } from "./env";

// Error and performance monitoring without an SDK. Everything is logged as one JSON line
// (Cloudflare Workers Observability and `wrangler tail` index these fields). When SENTRY_DSN
// is set, errors are also sent to Sentry with its HTTP envelope API.

/** Keeps a promise running after the response is sent (Workers), or just lets it run (dev). */
export function background(p: Promise<unknown>): void {
  const safe = p.catch((e) => console.warn(JSON.stringify({ event: "background_failed", message: String((e as Error)?.message ?? e).slice(0, 300) })));
  try {
    getCloudflareContext().ctx.waitUntil(safe);
  } catch {
    void safe;
  }
}

/** Strips ids and query strings from paths so logs can't carry user data. */
export function scrubPath(p: string): string {
  return p
    .replace(/\?.*$/, "")
    .replace(/\/(d|t|v)\/[^/]+/g, "/$1/:id")
    .replace(/\/api\/(decks|shares|assets|comments|v)\/[^/]+/g, "/api/$1/:id")
    .replace(/\/(versions|asset)\/[^/]+/g, "/$1/:id");
}

export function logJson(level: "info" | "warn" | "error", data: Record<string, unknown>): void {
  const line = JSON.stringify({ ...data, release: env("NEXT_PUBLIC_RELEASE") ?? "dev" });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

interface Dsn {
  url: string;
  key: string;
}

export function parseDsn(dsn: string | undefined): Dsn | null {
  if (!dsn) return null;
  const m = dsn.match(/^https:\/\/([a-f0-9]+)@([a-z0-9.-]+)\/(\d+)$/i);
  if (!m) return null;
  return { url: `https://${m[2]}/api/${m[3]}/envelope/`, key: m[1] };
}

const hex32 = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");

/** Builds a Sentry envelope for one error event. Exported for tests. */
export function sentryEnvelope(err: { type: string; message: string; stack?: string }, tags: Record<string, string>, release: string): string {
  const id = hex32();
  const event = {
    event_id: id,
    timestamp: Date.now() / 1000,
    platform: "javascript",
    level: "error",
    release,
    environment: env("DODO_PAYMENTS_ENVIRONMENT") === "live_mode" ? "production" : "development",
    tags,
    exception: { values: [{ type: err.type.slice(0, 100), value: err.message.slice(0, 500) }] },
    extra: { stack: err.stack?.slice(0, 4000) },
  };
  return [JSON.stringify({ event_id: id, sent_at: new Date().toISOString() }), JSON.stringify({ type: "event" }), JSON.stringify(event)].join("\n");
}

/** Logs an error and, when configured, sends it to Sentry in the background. */
export function captureError(e: unknown, tags: Record<string, string>): void {
  const err = e instanceof Error ? { type: e.name || "Error", message: e.message, stack: e.stack } : { type: "Error", message: String(e) };
  logJson("error", { event: "server_error", ...tags, error: err.type, message: err.message.slice(0, 500), stack: err.stack?.slice(0, 2000) });
  sendToSentry(err, tags);
}

export function sendToSentry(err: { type: string; message: string; stack?: string }, tags: Record<string, string>): void {
  const dsn = parseDsn(env("SENTRY_DSN"));
  if (!dsn) return;
  const body = sentryEnvelope(err, tags, env("NEXT_PUBLIC_RELEASE") ?? "dev");
  background(
    fetch(dsn.url, {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope", "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${dsn.key}, sentry_client=kinetic/1.0` },
      body,
    }),
  );
}

/** Requests slower than this are logged as slow_request. */
export const SLOW_MS = 1500;
