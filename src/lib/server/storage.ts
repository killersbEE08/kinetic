import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { HttpError } from "./auth-error";

// The parts of the Workers R2 binding we use (avoids pulling in all of @cloudflare/workers-types).
export interface R2ObjectBodyLike {
  body: ReadableStream;
  size: number;
  httpEtag: string;
}
export interface R2BucketLike {
  put(key: string, value: ArrayBuffer | ReadableStream, options?: { httpMetadata?: { contentType?: string; cacheControl?: string } }): Promise<unknown>;
  get(key: string): Promise<R2ObjectBodyLike | null>;
  delete(key: string | string[]): Promise<void>;
  list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<{ objects: { key: string }[]; truncated: boolean; cursor?: string }>;
}

/** Deletes every object under a prefix, 1,000 keys per call. Returns how many were deleted. */
export async function deletePrefix(bucket: R2BucketLike, prefix: string): Promise<number> {
  let cursor: string | undefined;
  let n = 0;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000 });
    const keys = page.objects.map((o) => o.key);
    if (keys.length) await bucket.delete(keys);
    n += keys.length;
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return n;
}

/** R2 bucket bound as ASSETS_BUCKET in wrangler.jsonc, or null when it isn't configured. */
export function assetBucket(): R2BucketLike | null {
  try {
    const env = getCloudflareContext().env as unknown as { ASSETS_BUCKET?: R2BucketLike };
    return env.ASSETS_BUCKET ?? null;
  } catch {
    return null;
  }
}

export function requireBucket(): R2BucketLike {
  const b = assetBucket();
  if (!b) throw new HttpError(503, "Photo storage is not configured on this server.", "storage_disabled");
  return b;
}

/** Objects are namespaced by the verified Clerk user id, so one user's key can never reach another's file. */
export const assetKey = (userId: string, assetId: string) => `u/${userId}/${assetId}`;

export { sniffImage } from "./sniff";
