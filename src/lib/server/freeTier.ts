import "server-only";
import { createClerkClient } from "@clerk/nextjs/server";
import { emailDomain, isDisposable, networkPrefix } from "@/lib/billing/abuse";
import { adminDb, type AuthedUser } from "./auth";
import { config, env } from "./env";
import { background, logJson } from "./monitor";

// Collects the free-tier signals (email domain, network) once per user, on their first AI
// request. Fails open: if anything here breaks, the per-user limits and the daily free cap in
// spend_ai_credits still apply.

const seen = new Set<string>();

async function networkHash(prefix: string): Promise<string> {
  const secret = env("SHARE_SIGNING_SECRET") ?? `kinetic-net:${env("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`net:${prefix}`)));
  return Array.from(sig.slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function primaryEmail(user: AuthedUser): Promise<string | null> {
  if (user.email) return user.email;
  try {
    const u = await createClerkClient({ secretKey: env("CLERK_SECRET_KEY") }).users.getUser(user.userId);
    return u.primaryEmailAddress?.emailAddress ?? null;
  } catch {
    return null;
  }
}

export async function recordFreeSignals(user: AuthedUser): Promise<void> {
  if (seen.has(user.userId) || !env("SUPABASE_SERVICE_ROLE_KEY") || !config.supabaseEnabled()) return;
  try {
    const db = adminDb();
    const { data, error } = await db.from("free_signals").select("user_id").eq("user_id", user.userId).maybeSingle();
    if (error) return; // table not there yet
    if (data) {
      seen.add(user.userId);
      return;
    }
    const domain = emailDomain(await primaryEmail(user));
    const extra = (env("DISPOSABLE_EMAIL_DOMAINS") ?? "").split(",");
    const disposable = isDisposable(domain, extra);
    const prefix = networkPrefix(user.ip);
    const row = { user_id: user.userId, email_domain: domain, disposable, network_hash: prefix ? await networkHash(prefix) : null };
    const { error: insErr } = await db.from("free_signals").upsert(row, { onConflict: "user_id", ignoreDuplicates: true });
    if (insErr) return logJson("warn", { event: "free_signals_failed", code: insErr.code });
    seen.add(user.userId);
    if (disposable) logJson("warn", { event: "disposable_signup", domain });
  } catch (e) {
    logJson("warn", { event: "free_signals_failed", message: String((e as Error)?.message ?? e).slice(0, 200) });
  }
}

let lastAlertDay = "";
let warned80 = "";

/** Logs (and emails the team once a day) when the free tier nears or hits its daily cap. */
export function watchFreeCap(freeToday: number | undefined, cap: number | null | undefined, reached = false) {
  const day = new Date().toISOString().slice(0, 10);
  if (reached) {
    if (lastAlertDay === day) return;
    lastAlertDay = day;
    logJson("error", { event: "free_cap_reached", cap });
    background(opsEmail(`Free AI tier hit its daily cap (${cap} credits)`, `Free users are on the offline engine until midnight UTC.\n\nCheck for abuse:\n  select * from free_tier_watch;\n\nRaise the cap:\n  update free_tier_config set daily_credit_cap = <n> where id = 1;`));
    return;
  }
  if (freeToday && cap && freeToday >= cap * 0.8 && warned80 !== day) {
    warned80 = day;
    logJson("warn", { event: "free_cap_80", freeToday, cap });
  }
}

async function opsEmail(subject: string, text: string) {
  const key = env("RESEND_API_KEY");
  const from = env("ALERT_EMAIL_FROM");
  const to = env("OPS_ALERT_EMAIL") ?? env("ABUSE_REPORT_EMAIL");
  if (!key || !from || !to) return;
  await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [to], subject, text }) }).catch(() => undefined);
}
