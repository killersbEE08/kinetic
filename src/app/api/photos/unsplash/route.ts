import { config, env } from "@/lib/server/env";
import { handle, HttpError, json, requireUser } from "@/lib/server/auth";
import { UNSPLASH_UTM } from "@/lib/deck/media";

// GET /api/photos/unsplash?q=…&page=1 — stock photo search through our server, so the Unsplash
// access key never reaches the browser (Unsplash API guideline 4). Results are hotlinked from
// images.unsplash.com (guideline 1) and carry photographer attribution (guideline 3).

interface UnsplashPhoto {
  id: string;
  width: number;
  height: number;
  color: string | null;
  alt_description: string | null;
  description: string | null;
  urls: { raw: string; small: string };
  links: { download_location: string };
  user: { name: string; links: { html: string } };
}

export const GET = handle(async (req: Request) => {
  await requireUser(req, "read");
  if (!config.unsplashEnabled()) throw new HttpError(503, "Stock photos aren't set up on this server yet.", "unsplash_disabled");
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const page = Math.max(1, Math.min(20, Number(url.searchParams.get("page")) || 1));
  if (q.length < 2) throw new HttpError(400, "Type at least 2 letters to search.", "short_query");

  const api = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&page=${page}&per_page=24&orientation=landscape&content_filter=high`; // slop-lint-ignore: Unsplash API parameter
  // Cache identical searches for an hour to stay well inside the API's hourly limit.
  const cache = typeof caches !== "undefined" ? (caches as unknown as { default?: Cache }).default : undefined;
  const cacheKey = new Request(`https://cache.kinetic.internal/unsplash?q=${encodeURIComponent(q.toLowerCase())}&p=${page}`);
  let data: { total: number; total_pages: number; results: UnsplashPhoto[] } | null = null;
  const hit = await cache?.match(cacheKey).catch(() => undefined);
  if (hit) data = await hit.json();
  if (!data) {
    const res = await fetch(api, { headers: { Authorization: `Client-ID ${env("UNSPLASH_ACCESS_KEY")}`, "Accept-Version": "v1" }, signal: AbortSignal.timeout(10_000) });
    if (res.status === 403 || res.status === 429) throw new HttpError(503, "Stock photo search is busy right now. Try again in a few minutes.", "unsplash_limited");
    if (!res.ok) throw new HttpError(502, "Stock photo search didn't respond. Try again.", "unsplash_error");
    data = (await res.json()) as { total: number; total_pages: number; results: UnsplashPhoto[] };
    await cache?.put(cacheKey, new Response(JSON.stringify(data), { headers: { "Cache-Control": "max-age=3600", "Content-Type": "application/json" } })).catch(() => undefined);
  }

  return json({
    total: data.total,
    pages: data.total_pages,
    photos: data.results
      // Unsplash+ photos (plus.unsplash.com) need a subscription; only offer free ones.
      .filter((p) => p.urls.raw.startsWith("https://images.unsplash.com/"))
      .map((p) => ({
        id: p.id,
        src: p.urls.raw,
        thumb: p.urls.small,
        width: p.width,
        height: p.height,
        color: p.color,
        alt: (p.alt_description || p.description || `Photo by ${p.user.name}`).slice(0, 240),
        author: p.user.name.slice(0, 80),
        authorUrl: `${p.user.links.html}${UNSPLASH_UTM}`,
        downloadLocation: p.links.download_location,
      })),
  });
});
