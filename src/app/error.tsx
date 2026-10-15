"use client";

import Link from "next/link";
import { useEffect } from "react";
import { reportError } from "@/lib/client/report";

// Shown when a page crashes. The error is reported (message and stack only) and the user can retry.
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    reportError(error, "react");
  }, [error]);
  return (
    <main className="mx-auto flex min-h-dvh max-w-[460px] flex-col justify-center px-6">
      <h1 className="text-[22px] font-semibold tracking-[-0.01em]">This page couldn&rsquo;t load</h1>
      <p className="mt-2 text-[15px] leading-[22px] text-ink-2">Your saved work is safe. Try again, or go back to your dashboard.{error.digest ? ` Reference: ${error.digest}` : ""}</p>
      <div className="mt-6 flex gap-3">
        <button type="button" className="btn btn-primary" onClick={() => retry()}>Try again</button>
        <Link href="/dashboard" className="btn btn-secondary">Go to dashboard</Link>
      </div>
    </main>
  );
}
