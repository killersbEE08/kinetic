"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { RequireUser } from "@/components/auth/RequireUser";
import { useBackend, type Me } from "@/lib/client/backend";

// Dodo redirects here after checkout with ?status=… . The plan itself is set by the webhook,
// so we poll /api/me for a short while until it shows up.
function ReturnInner() {
  const backend = useBackend();
  const params = useSearchParams();
  const status = params.get("status") ?? "";
  const [me, setMe] = useState<Me | null>(null);
  const [tries, setTries] = useState(0);
  const failed = /fail|cancel/i.test(status);

  useEffect(() => {
    if (failed || backend.mode !== "cloud") return;
    let stop = false;
    const tick = async (n: number) => {
      const m = await backend.me().catch(() => null);
      if (stop) return;
      setMe(m);
      setTries(n);
      if ((!m || m.plan === "free") && n < 10) setTimeout(() => tick(n + 1), 2000);
    };
    tick(1);
    return () => {
      stop = true;
    };
  }, [backend, failed]);

  const upgraded = me && me.plan !== "free";
  return (
    <main className="mx-auto max-w-[560px] px-6 py-24">
      <h1 className="text-[34px] font-semibold tracking-[-0.025em]">{failed ? "Payment didn't go through" : upgraded ? `You're on ${me!.plan === "team" ? "Team" : "Pro"}` : "Confirming your payment"}</h1>
      <p className="mt-4 text-[17px] leading-[26px] text-ink-2" role="status" aria-live="polite">
        {failed
          ? "You haven't been charged. You can try again from the plans page."
          : upgraded
            ? `You have ${me!.creditsRemaining?.toLocaleString() ?? "more"} AI credits this month and no deck limit.`
            : tries >= 10
              ? "This is taking longer than usual. Your plan will update within a few minutes; you can keep working."
              : "Waiting for confirmation from Dodo Payments."}
      </p>
      <div className="mt-8 flex gap-3">
        <Link href={failed ? "/pricing" : "/dashboard"} className="btn btn-primary">{failed ? "Back to plans" : "Go to your dashboard"}</Link>
      </div>
    </main>
  );
}

export default function BillingReturnPage() {
  return (
    <RequireUser>
      <AppShell>
      <Suspense fallback={null}>
        <ReturnInner />
      </Suspense>
      </AppShell>
    </RequireUser>
  );
}
