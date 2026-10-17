import { adminDb, json } from "@/lib/server/auth";
import { config, env } from "@/lib/server/env";
import { clientIp, enforceLimit } from "@/lib/server/limits";
import { logJson } from "@/lib/server/monitor";

// Tables (and columns) each migration adds. /api/health reports the first migration whose
// objects are missing, so a deploy that skipped a migration fails loudly instead of features
// quietly breaking.
const REQUIRED: { migration: string; table: string; columns: string }[] = [
  { migration: "20261014000000_init.sql", table: "decks", columns: "id, doc, version, deleted_at" },
  { migration: "20261014000000_init.sql", table: "profiles", columns: "user_id, plan" },
  { migration: "20261014000000_init.sql", table: "ai_usage", columns: "id" },
  { migration: "20261015000000_assets.sql", table: "assets", columns: "id" },
  { migration: "20261016000000_sharing_brand.sql", table: "share_links", columns: "id, snapshot" },
  { migration: "20261016000000_sharing_brand.sql", table: "view_sessions", columns: "id" },
  { migration: "20261016000000_sharing_brand.sql", table: "brand_kits", columns: "id" },
  { migration: "20261017000000_versions_trash.sql", table: "deck_snapshots", columns: "id, kind" },
  { migration: "20261018000000_activity_comments_alerts.sql", table: "product_events", columns: "id, name" },
  { migration: "20261018000000_activity_comments_alerts.sql", table: "comments", columns: "id, slide_id" },
  { migration: "20261018000000_activity_comments_alerts.sql", table: "notifications", columns: "id, read_at" },
  { migration: "20261018000000_activity_comments_alerts.sql", table: "share_links", columns: "allow_comments, notify" },
  { migration: "20261018000000_activity_comments_alerts.sql", table: "profiles", columns: "alert_email, alert_slack_url" },
  { migration: "20261019000000_abuse_reports.sql", table: "abuse_reports", columns: "id, status" },
  { migration: "20261019000000_abuse_reports.sql", table: "blocked_links", columns: "link_id" },
  { migration: "20261020000000_free_tier_guard.sql", table: "free_signals", columns: "user_id, disposable" },
  { migration: "20261020000000_free_tier_guard.sql", table: "free_tier_config", columns: "daily_credit_cap" },
  { migration: "20261020000000_free_tier_guard.sql", table: "ai_usage", columns: "plan" },
];

// GET /api/health: public. 200 when every configured service is ready, 503 otherwise.
// Lists which migration is missing; never returns keys or user data.
export async function GET(req: Request): Promise<Response> {
  try {
    await enforceLimit("anon", clientIp(req));
  } catch {
    return new Response(null, { status: 429 });
  }
  const services = {
    auth: config.clerkEnabled(),
    database: config.supabaseEnabled(),
    ai: config.geminiEnabled() ? "gemini" : "offline",
    billing: config.dodoEnabled(),
    email: !!env("RESEND_API_KEY"),
    errorTracking: !!env("SENTRY_DSN"),
  };
  if (!config.supabaseEnabled()) return json({ ok: true, mode: "demo", services });
  if (!env("SUPABASE_SERVICE_ROLE_KEY")) return json({ ok: false, mode: "cloud", services, problem: "SUPABASE_SERVICE_ROLE_KEY is not set" }, 503);

  const db = adminDb();
  const results = await Promise.all(
    REQUIRED.map(async (r) => {
      const { error } = await db.from(r.table).select(r.columns, { head: true, count: "exact" }).limit(0);
      return { ...r, ok: !error, code: error?.code };
    }),
  );
  const missing = results.filter((r) => !r.ok);
  const migrations = [...new Set(missing.map((m) => m.migration))];
  if (missing.length) logJson("error", { event: "health_failed", migrations, codes: missing.map((m) => m.code) });
  return json(
    {
      ok: missing.length === 0,
      mode: "cloud",
      services,
      database: missing.length ? { ok: false, missingMigrations: migrations, missing: missing.map((m) => `${m.table}(${m.columns})`) } : { ok: true },
    },
    missing.length ? 503 : 200,
  );
}
