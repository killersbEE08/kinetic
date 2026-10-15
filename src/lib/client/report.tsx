"use client";

import { useEffect } from "react";

// Sends uncaught browser errors to /api/report (at most 5 per page load, duplicates dropped).
// Only the message, a short stack and the current path are sent: no deck text, no file names.

const RELEASE = process.env.NEXT_PUBLIC_RELEASE ?? "dev";
let sent = 0;
const seen = new Set<string>();

export function reportError(err: unknown, kind: "error" | "unhandledrejection" | "react" = "error") {
  if (typeof window === "undefined" || sent >= 5) return;
  const e = err instanceof Error ? err : new Error(typeof err === "string" ? err : "Unknown error");
  const key = e.message + (e.stack?.split("\n")[1] ?? "");
  if (seen.has(key)) return;
  seen.add(key);
  sent++;
  const body = JSON.stringify({ type: "error", kind, message: e.message.slice(0, 500), stack: e.stack?.slice(0, 2000), route: location.pathname, release: RELEASE });
  try {
    if (!navigator.sendBeacon?.("/api/report", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/report", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true });
    }
  } catch {
    // Reporting must never throw.
  }
}

export function ErrorReporter() {
  useEffect(() => {
    const onError = (ev: ErrorEvent) => {
      // Cross-origin script errors carry no information.
      if (ev.message === "Script error." && !ev.error) return;
      reportError(ev.error ?? ev.message, "error");
    };
    const onRejection = (ev: PromiseRejectionEvent) => {
      // Aborted fetches (user pressed Stop) are expected.
      if (ev.reason instanceof DOMException && ev.reason.name === "AbortError") return;
      reportError(ev.reason, "unhandledrejection");
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
