"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { RequireUser } from "@/components/auth/RequireUser";
import { AppShell } from "@/components/app/AppShell";
import { formatBytes } from "@/components/app/assets-ui";
import { ErrorNote } from "@/components/ui/chrome";
import { ApiError, useBackend, type AlertSettings } from "@/lib/client/backend";
import { useMe } from "@/lib/client/me";
import { creditNote, MONTHLY_CREDITS, CREDIT_COST } from "@/lib/billing/credits";

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-[14px] border border-line bg-surface p-6">
      <h2 id={id} className="text-[17px] font-semibold tracking-[-0.01em]">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line py-3 text-[14px] first:border-t-0 first:pt-0">
      <span className="text-ink-2">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}

function CloudAccount() {
  const { user } = useUser();
  const { openUserProfile } = useClerk();
  return (
    <>
      <Row label="Name">{user?.fullName || "Not set"}</Row>
      <Row label="Email">{user?.primaryEmailAddress?.emailAddress ?? "Not set"}</Row>
      <div className="pt-2">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => openUserProfile()}>Change name, email or password</button>
      </div>
    </>
  );
}

/** How share-link alerts reach you: the bell always, plus email and a Slack channel. */
function AlertsSettings() {
  const backend = useBackend();
  const [s, setS] = useState<AlertSettings | null>(null);
  const [slackUrl, setSlackUrl] = useState("");
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    backend
      .getAlertSettings()
      .then(setS)
      .catch((e) => setMsg({ text: e instanceof ApiError ? e.message : "Alert settings couldn't be loaded.", error: true }));
  }, [backend]);

  const save = async (patch: { email?: boolean; slackUrl?: string | null }, done: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await backend.saveAlertSettings(patch);
      setS(await backend.getAlertSettings());
      setSlackUrl("");
      setMsg({ text: done, error: false });
    } catch (e) {
      setMsg({ text: e instanceof ApiError ? e.message : "That didn't save. Try again.", error: true });
    } finally {
      setBusy(false);
    }
  };

  if (!s) return msg ? <ErrorNote>{msg.text}</ErrorNote> : <div className="skeleton h-24" aria-busy="true" />;
  return (
    <div className="space-y-4 text-[14px]">
      <p className="text-ink-2">The bell shows when someone opens a share link, a summary of how long they spent on each slide, and new comments. Turn alerts off for one link in its Share settings.</p>
      <label className="flex items-start gap-3">
        <input type="checkbox" className="mt-1 h-4 w-4" checked={s.email} disabled={busy || !s.emailAvailable} onChange={(e) => save({ email: e.target.checked }, e.target.checked ? "Email alerts are on." : "Email alerts are off.")} />
        <span>
          Email me view summaries and comments
          {!s.emailAvailable && <span className="block text-[12px] text-ink-2">Email isn&rsquo;t set up on this server yet (RESEND_API_KEY and ALERT_EMAIL_FROM).</span>}
        </span>
      </label>
      <div>
        <span className="block font-medium">Slack</span>
        {s.slack ? (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-ink-2">Posting to a channel (webhook ending {s.slackHint}).</span>
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => save({ slackUrl: null }, "Slack alerts are off.")}>Remove</button>
          </div>
        ) : (
          <form
            className="mt-1 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (slackUrl.trim()) void save({ slackUrl: slackUrl.trim() }, "Slack alerts are on.");
            }}
          >
            <input className="field min-w-[260px] flex-1 text-[13px]" placeholder="https://hooks.slack.com/services/…" aria-label="Slack incoming webhook URL" value={slackUrl} onChange={(e) => setSlackUrl(e.target.value)} autoComplete="off" spellCheck={false} />
            <button type="submit" className="btn btn-secondary btn-sm" disabled={busy || !slackUrl.trim()}>Connect</button>
          </form>
        )}
        <p className="mt-1 text-[12px] text-ink-2">In Slack, add the &ldquo;Incoming Webhooks&rdquo; app to a channel and paste its URL here.</p>
      </div>
      {(s.slack || (s.email && s.emailAvailable)) && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={async () => {
            setMsg(null);
            try {
              await backend.testAlert();
              setMsg({ text: "Test alert sent. It can take a minute to arrive.", error: false });
            } catch (e) {
              setMsg({ text: e instanceof ApiError ? e.message : "The test alert couldn't be sent.", error: true });
            }
          }}
        >
          Send a test alert
        </button>
      )}
      {msg && <p role={msg.error ? "alert" : "status"} className={`text-[13px] ${msg.error ? "text-danger" : "text-success"}`}>{msg.text}</p>}
    </div>
  );
}

function SignedOutAfterDelete() {
  const { signOut } = useClerk();
  return (
    <button type="button" className="btn btn-primary" onClick={() => signOut({ redirectUrl: "/" })}>
      Close
    </button>
  );
}

function SettingsInner() {
  const backend = useBackend();
  const { me } = useMe();
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  const cloud = backend.mode === "cloud";

  async function exportData() {
    setExportError(null);
    setExporting("Starting");
    try {
      const blob = await backend.exportData(setExporting);
      const { download } = await import("@/lib/export/render");
      download(blob, `kinetic-export-${new Date().toISOString().slice(0, 10)}.zip`);
      setExporting(null);
    } catch (e) {
      setExportError(e instanceof ApiError ? e.message : "The export couldn't be made. Try again.");
      setExporting(null);
    }
  }

  async function deleteAccount() {
    setDeleteError(null);
    setDeleting(true);
    try {
      await backend.deleteAccount();
      setDeleted(true);
    } catch (e) {
      setDeleteError(e instanceof ApiError ? e.message : "Something went wrong. Nothing more was deleted; try again.");
    } finally {
      setDeleting(false);
    }
  }

  if (deleted) {
    return (
      <main className="mx-auto max-w-[560px] px-6 py-24">
        <h1 className="text-[24px] font-semibold tracking-[-0.02em]">{cloud ? "Your account is deleted" : "Browser data cleared"}</h1>
        <p className="mt-2 text-[15px] text-ink-2">{cloud ? "Your decks, photos and usage history have been removed. Thanks for trying Kinetic." : "Decks and photos saved in this browser have been removed."}</p>
        <div className="mt-6">{cloud ? <SignedOutAfterDelete /> : <Link href="/dashboard" className="btn btn-primary">Back to dashboard</Link>}</div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[760px] space-y-6 px-6 py-10">
      <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Settings</h1>

      {cloud && (
        <Section id="acc-h" title="Account">
          <CloudAccount />
        </Section>
      )}

      <Section id="plan-h" title="Plan and usage">
        {me ? (
          <>
            <Row label="Plan"><span className="capitalize">{me.plan}</span>{me.planStatus === "cancelled" && me.currentPeriodEnd ? ` (ends ${new Date(me.currentPeriodEnd).toLocaleDateString()})` : ""}</Row>
            {me.creditsRemaining !== null && <Row label="AI credits left this month"><span className="tabular">{me.creditsRemaining.toLocaleString()} of {(me.creditLimit ?? MONTHLY_CREDITS[me.plan]).toLocaleString()}</span></Row>}
            {creditNote(me.credits) && <p className="text-[13px] text-ink-2">{creditNote(me.credits)}</p>}
            <Row label="Decks"><span className="tabular">{me.deckCount}{me.plan === "free" ? " of 3" : ""}</span></Row>
            {me.storage && <Row label="Photo storage"><span className="tabular">{formatBytes(me.storage.usedBytes)} of {formatBytes(me.storage.limitBytes)}</span></Row>}
            <p className="mt-3 text-[13px] text-ink-2">Costs: outline {CREDIT_COST.outline} credits, slides {CREDIT_COST.generatePerSlide} credit each (max {CREDIT_COST.generateMax} per deck), AI edit {CREDIT_COST.edit} credit. Credits refill on the 1st of each month.</p>
            <Link href="/pricing" className="btn btn-secondary btn-sm mt-4">{me.plan === "free" ? "See plans" : "Manage plan"}</Link>
          </>
        ) : cloud ? (
          <div className="skeleton h-24" aria-busy="true" />
        ) : (
          <p className="text-[14px] text-ink-2">Demo mode has no plan. Decks and photos are saved in this browser, and AI uses the offline engine.</p>
        )}
      </Section>

      {cloud && (
        <div id="alerts" className="scroll-mt-6">
          <Section id="alerts-h" title="Alerts">
            <AlertsSettings />
          </Section>
        </div>
      )}

      <Section id="data-h" title="Your data">
        <p className="text-[14px] leading-[21px] text-ink-2">
          Download everything we store for you: every deck (full content), your photo files, and your AI usage history, as one ZIP file. Your content is never used to train AI models.
        </p>
        <button type="button" className="btn btn-secondary mt-4" onClick={exportData} disabled={!!exporting}>
          {exporting ? "Preparing" : "Download my data"}
        </button>
        <p className="mt-2 min-h-[18px] text-[13px] text-ink-2" role="status" aria-live="polite">{exporting}</p>
        {exportError && <ErrorNote>{exportError}</ErrorNote>}
      </Section>

      <Section id="del-h" title={cloud ? "Delete account" : "Clear browser data"}>
        <p className="text-[14px] leading-[21px] text-ink-2">
          {cloud
            ? "This permanently deletes your decks, photos, AI usage history and your sign-in account. Shared copies stop working. It can't be undone, so download your data first if you might need it."
            : "This removes every deck and photo saved in this browser."}
        </p>
        {cloud && me && me.plan !== "free" && me.planStatus === "active" && <p className="mt-3 text-[13px] text-warning">You have an active {me.plan} subscription. Cancel it on the Plans page before deleting your account.</p>}
        <label className="mt-4 block max-w-[320px] text-[13px] font-medium">
          Type <span className="font-mono">DELETE</span> to confirm
          <input className="field mt-1" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" spellCheck={false} />
        </label>
        <button type="button" className="btn btn-danger mt-3" disabled={confirm !== "DELETE" || deleting} onClick={deleteAccount}>
          {deleting ? "Deleting" : cloud ? "Delete my account" : "Clear browser data"}
        </button>
        {deleteError && <div className="mt-3"><ErrorNote>{deleteError}</ErrorNote></div>}
      </Section>

      <p className="text-[12px] text-ink-2">Keyboard: Ctrl K (⌘ K on Mac) opens search from any page.</p>
    </main>
  );
}

export default function SettingsPage() {
  return (
    <RequireUser>
      <AppShell>
        <SettingsInner />
      </AppShell>
    </RequireUser>
  );
}
