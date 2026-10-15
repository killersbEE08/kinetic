"use client";

// Account summary (plan, credits, storage) shared by the app shell, cost labels and settings.
// One request per page load; call refresh() after an action that spends credits.
import { useCallback, useEffect, useState } from "react";
import { useBackend, type Me } from "./backend";
import { creditLabel } from "@/lib/billing/credits";

let cache: { key: string; at: number; me: Me | null } | null = null;
const listeners = new Set<(m: Me | null) => void>();

export function useMe(): { me: Me | null; loaded: boolean; refresh: () => void } {
  const backend = useBackend();
  const key = `${backend.mode}:${backend.signedIn}`;
  // Initial value from the cache (any age); the effect below refreshes it when stale.
  const [me, setMe] = useState<Me | null>(() => (cache && cache.key === key ? cache.me : null));
  const [loaded, setLoaded] = useState<boolean>(() => !!cache && cache.key === key);

  const load = useCallback(() => {
    if (!backend.ready || !backend.signedIn) return;
    backend
      .me()
      .catch(() => null)
      .then((m) => {
        cache = { key, at: Date.now(), me: m };
        for (const l of listeners) l(m);
      });
  }, [backend, key]);

  useEffect(() => {
    const l = (m: Me | null) => {
      setMe(m);
      setLoaded(true);
    };
    listeners.add(l);
    if (!(cache && cache.key === key && Date.now() - cache.at < 30_000)) load();
    return () => {
      listeners.delete(l);
    };
  }, [key, load]);

  return { me, loaded, refresh: load };
}

/**
 * "Uses 2 credits" label for an AI button. Hidden when AI runs offline (it's free then)
 * and turns into a warning when the user can't afford it.
 */
export function CreditCost({ credits, className = "" }: { credits: number; className?: string }) {
  const { me } = useMe();
  if (!me || !me.features.gemini) return null;
  const left = me.creditsRemaining;
  const short = left !== null && left < credits;
  return (
    <span className={`tabular text-[12px] ${short ? "text-danger" : "text-ink-2"} ${className}`} title={left !== null ? `${left.toLocaleString()} credits left this month` : undefined}>
      {short ? `Needs ${creditLabel(credits)}, ${left} left` : `Uses ${creditLabel(credits)}`}
    </span>
  );
}
