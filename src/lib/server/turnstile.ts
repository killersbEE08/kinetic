import "server-only";
import { env } from "./env";
import { HttpError } from "./auth-error";
import { logJson } from "./monitor";

// Cloudflare Turnstile bot check for public forms (viewer comments, abuse reports).
// Off unless TURNSTILE_SECRET_KEY is set (with NEXT_PUBLIC_TURNSTILE_SITE_KEY for the widget).

export const turnstileEnabled = () => !!env("TURNSTILE_SECRET_KEY");

/** Throws 403 unless the token passes. No-op when Turnstile isn't configured. */
export async function requireHuman(token: string | undefined, ip: string, action: string): Promise<void> {
  const secret = env("TURNSTILE_SECRET_KEY");
  if (!secret) return;
  if (!token) throw new HttpError(403, "Confirm you're not a robot, then send again.", "captcha_required");
  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token.slice(0, 2048));
  if (ip !== "unknown") form.set("remoteip", ip);
  let ok = false;
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const data = (await r.json()) as { success?: boolean; action?: string; "error-codes"?: string[] };
    ok = !!data.success && (!data.action || data.action === action);
    if (!ok) logJson("warn", { event: "captcha_failed", action, codes: data["error-codes"]?.slice(0, 3) });
  } catch (e) {
    // Fail closed: a public form without a working check is a spam path.
    logJson("warn", { event: "captcha_error", message: String((e as Error)?.message ?? e).slice(0, 200) });
  }
  if (!ok) throw new HttpError(403, "The robot check didn't pass. Try again.", "captcha_failed");
}
