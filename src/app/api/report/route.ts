import { z } from "zod";
import { enforceLimit, clientIp } from "@/lib/server/limits";
import { HttpError } from "@/lib/server/auth-error";

// POST /api/report: browser error reports and CSP violation reports. Logged as structured JSON
// (visible in Cloudflare Workers Observability and `wrangler tail`). No auth: errors can happen
// before sign-in, so it's rate-limited per IP and every field is size-capped. Never logs deck
// content, file names or tokens: the client sends only the message, a short stack and the route.

const ClientError = z.object({
  type: z.literal("error"),
  message: z.string().max(500),
  stack: z.string().max(2000).optional(),
  route: z.string().max(200),
  release: z.string().max(40).optional(),
  kind: z.enum(["error", "unhandledrejection", "react"]).default("error"),
});

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.slice(0, n) : undefined);

// Strips query strings and ids from paths so reports can't carry user data.
const scrubPath = (p: string) => p.replace(/\?.*$/, "").replace(/\/(d|t|v)\/[^/]+/g, "/$1/:id");

export async function POST(req: Request): Promise<Response> {
  try {
    await enforceLimit("anon", clientIp(req));
  } catch (e) {
    if (e instanceof HttpError) return new Response(null, { status: 429 });
  }
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 16_000) return new Response(null, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse((await req.text()).slice(0, 16_000));
  } catch {
    return new Response(null, { status: 400 });
  }

  const csp = (body as { "csp-report"?: Record<string, unknown> })["csp-report"];
  if (csp) {
    console.warn(JSON.stringify({ event: "csp_violation", directive: clip(csp["violated-directive"] ?? csp["effective-directive"], 120), blocked: clip(csp["blocked-uri"], 200), page: scrubPath(String(csp["document-uri"] ?? "")).slice(0, 200) }));
    return new Response(null, { status: 204 });
  }

  const parsed = ClientError.safeParse(body);
  if (!parsed.success) return new Response(null, { status: 400 });
  const r = parsed.data;
  console.error(JSON.stringify({ event: "client_error", kind: r.kind, message: r.message, stack: r.stack, route: scrubPath(r.route), release: r.release, ua: clip(req.headers.get("user-agent"), 160) }));
  return new Response(null, { status: 204 });
}
