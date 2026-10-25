"use client";

import { useSyncExternalStore } from "react";

/** True while the media query matches. False during server render. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Phones and small tablets (below Tailwind's md breakpoint, 768px). */
export const useIsMobile = () => useMedia("(max-width: 767px)");
