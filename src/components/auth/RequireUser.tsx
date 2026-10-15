"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useBackend } from "@/lib/client/backend";

/**
 * Client-side gate for app pages. The real protection is server-side: every API route
 * verifies the Clerk session token, and Supabase RLS limits rows to the token's user.
 * (Next 16's Node.js proxy isn't supported on OpenNext/Cloudflare, so there is no middleware.)
 */
export function RequireUser({ children }: { children: ReactNode }) {
  const backend = useBackend();
  const router = useRouter();
  const blocked = backend.mode === "cloud" && backend.ready && !backend.signedIn;
  useEffect(() => {
    if (blocked) router.replace(`/sign-in?redirect_url=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }, [blocked, router]);
  if (!backend.ready || blocked) {
    return (
      <div className="flex min-h-dvh items-center justify-center" aria-busy="true">
        <p className="text-[14px] text-ink-2" role="status">
          {blocked ? "Taking you to sign in" : "Loading your account"}
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
