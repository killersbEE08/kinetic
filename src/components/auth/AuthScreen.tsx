"use client";

import Link from "next/link";
import { SignIn, SignUp } from "@clerk/nextjs";
import { Wordmark } from "@/components/ui/chrome";
import { useBackend } from "@/lib/client/backend";

function DemoNotice() {
  return (
    <div className="max-w-md rounded-[14px] border border-line bg-surface p-6 text-[15px] leading-[22px]">
      <h1 className="mb-2 text-[17px] font-semibold">Sign-in is not set up on this copy of DeckIQ</h1>
      <p className="text-ink-2">
        Add <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and <code>CLERK_SECRET_KEY</code> to enable accounts. Until then you can use demo mode: decks are saved in this browser.
      </p>
      <Link href="/dashboard" className="btn btn-primary mt-5">Open demo mode</Link>
    </div>
  );
}

export function AuthScreen({ kind }: { kind: "sign-in" | "sign-up" }) {
  const backend = useBackend();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6 py-16">
      <Wordmark />
      {backend.mode !== "cloud" ? (
        <DemoNotice />
      ) : kind === "sign-in" ? (
        <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" fallbackRedirectUrl="/dashboard" />
      ) : (
        <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" fallbackRedirectUrl="/dashboard" />
      )}
    </main>
  );
}
