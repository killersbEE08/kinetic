"use client";

// "Report" form for a shared deck or one of its comments. Used on the viewer (/v/<id>, dark)
// and on the public report page (/report, light).
import { useState } from "react";
import { ABUSE_REASONS, COMMENT_REASONS, REASON_LABEL, type AbuseReason } from "@/lib/abuse";
import { Captcha, captchaOn } from "./Captcha";

export function ReportForm({ link, commentId, dark = false, onDone, askLink = false }: { link?: string; commentId?: string; dark?: boolean; onDone?: () => void; askLink?: boolean }) {
  const reasons = commentId ? COMMENT_REASONS : [...ABUSE_REASONS];
  const [url, setUrl] = useState(link ?? "");
  const [reason, setReason] = useState<AbuseReason | "">("");
  const [details, setDetails] = useState("");
  const [email, setEmail] = useState("");
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [reset, setReset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const field = dark ? "w-full rounded-[8px] border border-white/15 bg-transparent px-2.5 py-2 text-[13px] text-white placeholder:text-white/40" : "field text-[14px]";
  const muted = dark ? "text-white/60" : "text-ink-2";

  if (sent) {
    return (
      <div role="status" className="text-[14px]">
        <p className="font-semibold">Thanks, we got your report.</p>
        <p className={`mt-1 ${muted}`}>{commentId ? "The comment is hidden from other viewers while the deck owner reviews it." : "The Kinetic team reviews reports and removes links that break the rules."}</p>
        {onDone && <button type="button" className={dark ? "mt-3 h-9 rounded-[8px] bg-white px-3 text-[13px] font-semibold text-[#0b0b0c]" : "btn btn-secondary btn-sm mt-3"} onClick={onDone}>Close</button>}
      </div>
    );
  }

  const submit = async () => {
    if (!reason || busy || (captchaOn && !captcha) || !url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/abuse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ link: url.trim(), kind: commentId ? "comment" : "deck", commentId, reason, details: details.trim(), email: email.trim() || undefined, captcha: captcha ?? undefined }),
      });
      const data = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(data.error ?? "The report couldn't be sent. Try again.");
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
      setReset((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="space-y-3 text-[13px]"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {askLink && (
        <label className="block font-medium">
          Link to the deck
          <input className={`${field} mt-1`} placeholder="https://…/v/…" value={url} onChange={(e) => setUrl(e.target.value)} required />
        </label>
      )}
      <fieldset>
        <legend className="mb-1.5 font-medium">{commentId ? "What's wrong with this comment?" : "What's wrong with this deck?"}</legend>
        <div className="space-y-1.5">
          {reasons.map((r) => (
            <label key={r} className="flex items-start gap-2">
              <input type="radio" name="reason" className="mt-0.5 h-4 w-4" checked={reason === r} onChange={() => setReason(r)} />
              <span>{REASON_LABEL[r]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block font-medium">
        Details <span className={`font-normal ${muted}`}>(optional)</span>
        <textarea className={`${field} mt-1 min-h-[64px] resize-y`} value={details} maxLength={1000} onChange={(e) => setDetails(e.target.value)} />
      </label>
      <label className="block font-medium">
        Your email <span className={`font-normal ${muted}`}>(optional, if we need to ask you something)</span>
        <input type="email" className={`${field} mt-1`} value={email} maxLength={200} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </label>
      <Captcha action="report" onToken={setCaptcha} resetKey={reset} theme={dark ? "dark" : "auto"} />
      {error && <p role="alert" className={dark ? "text-[#ff8a80]" : "text-danger"}>{error}</p>}
      <button type="submit" className={dark ? "h-9 w-full rounded-[8px] bg-white text-[13px] font-semibold text-[#0b0b0c] disabled:opacity-40" : "btn btn-primary btn-sm"} disabled={busy || !reason || (captchaOn && !captcha) || !url.trim()}>
        {busy ? "Sending" : "Send report"}
      </button>
    </form>
  );
}
