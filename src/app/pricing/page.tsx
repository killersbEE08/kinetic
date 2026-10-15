"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SiteHeader, ErrorNote } from "@/components/ui/chrome";
import { ApiError, useBackend, type Me } from "@/lib/client/backend";
import { PLANS } from "@/lib/billing/catalog";

export default function PricingPage() {
  const backend = useBackend();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [seats, setSeats] = useState(3);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (backend.mode === "cloud" && backend.signedIn) backend.me().then(setMe).catch(() => setMe(null));
  }, [backend]);

  async function choose(plan: "pro" | "team") {
    setError(null);
    if (backend.mode === "cloud" && !backend.signedIn) {
      router.push(`/sign-up?redirect_url=${encodeURIComponent("/pricing")}`);
      return;
    }
    setBusy(plan);
    try {
      const url = await backend.checkout(plan, plan === "team" ? seats : undefined);
      window.location.assign(url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not open checkout. Try again.");
      setBusy(null);
    }
  }

  async function manage() {
    setBusy("portal");
    try {
      window.location.assign(await backend.portal());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not open the billing portal.");
      setBusy(null);
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-[1200px] px-6 py-16">
        <h1 className="text-[44px] font-semibold leading-[1.05] tracking-[-0.035em]">Plans</h1>
        <p className="mt-4 max-w-[620px] text-[17px] leading-[26px] text-ink-2">Start free. Upgrade when you need more decks or AI credits. Prices in USD; Indian prices shown below each plan. Payments are handled by Dodo Payments.</p>

        {me && (
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-[10px] border border-line bg-surface px-5 py-4 text-[15px]">
            <span>
              You&rsquo;re on <strong className="font-semibold capitalize">{me.plan}</strong>
              {me.planStatus === "cancelled" && me.currentPeriodEnd && <> until {new Date(me.currentPeriodEnd).toLocaleDateString()}</>}
              {me.planStatus === "past_due" && <> · payment overdue, update your card to keep it</>}
              {me.creditsRemaining !== null && <> · {me.creditsRemaining.toLocaleString()} AI credits left this month</>}
            </span>
            {me.hasBillingAccount && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={manage} disabled={busy === "portal"}>
                {busy === "portal" ? "Opening" : "Manage billing"}
              </button>
            )}
          </div>
        )}
        {backend.mode === "demo" && (
          <p className="mt-8 rounded-[10px] border border-line bg-surface px-5 py-4 text-[15px] text-ink-2">
            This copy runs in demo mode, so checkout is turned off. Add Clerk, Supabase and Dodo Payments keys to enable paid plans.
          </p>
        )}
        {error && (
          <div className="mt-6">
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {PLANS.map((p) => {
            const current = me?.plan === p.id;
            return (
              <section key={p.id} aria-labelledby={`plan-${p.id}`} className={`flex flex-col rounded-[14px] border bg-surface p-6 ${p.id === "pro" ? "border-ink" : "border-line"}`}>
                <h2 id={`plan-${p.id}`} className="text-[20px] font-semibold">{p.name}</h2>
                <p className="mt-1 text-[14px] text-ink-2">{p.blurb}</p>
                <p className="tabular mt-6 text-[40px] font-semibold tracking-[-0.03em]">{p.price}</p>
                <p className="min-h-[20px] text-[13px] text-ink-2">{p.period || "forever"}</p>
                <p className="mt-1 text-[13px] text-ink-2">India: {p.india}</p>
                <ul className="mt-6 flex-1 space-y-2 text-[15px]">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <span aria-hidden="true" className="text-ink-2">–</span>
                      {f}
                    </li>
                  ))}
                </ul>
                {p.id === "team" && (
                  <label className="mt-6 flex items-center justify-between gap-3 text-[14px]">
                    Seats
                    <input type="number" min={1} max={500} value={seats} onChange={(e) => setSeats(Math.max(1, Math.min(500, Number(e.target.value) || 1)))} className="field w-24 text-right tabular" />
                  </label>
                )}
                <div className="mt-6">
                  {p.id === "free" ? (
                    <Link href="/new" className="btn btn-secondary w-full">{current ? "Your current plan" : "Start a deck"}</Link>
                  ) : current ? (
                    <button type="button" className="btn btn-secondary w-full" disabled>Your current plan</button>
                  ) : (
                    <button type="button" className={`btn w-full ${p.id === "pro" ? "btn-primary" : "btn-secondary"}`} onClick={() => choose(p.id)} disabled={!!busy || backend.mode === "demo"}>
                      {busy === p.id ? "Opening checkout" : `Upgrade to ${p.name}`}
                    </button>
                  )}
                </div>
              </section>
            );
          })}
        </div>
        <p className="mt-8 text-[13px] text-ink-2">AI credits: generating a deck uses one credit per slide plus two for the outline; each AI edit uses one. Credits reset on the first of each month.</p>
      </main>
    </>
  );
}
