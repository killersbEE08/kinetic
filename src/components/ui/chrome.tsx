"use client";

import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { useBackend } from "@/lib/client/backend";

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 font-semibold tracking-[-0.02em] text-[17px] text-ink" aria-label="DeckIQ home">
      {/* Mark: three bars that read as a build sequence. */}
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <rect x="1" y="10" width="4" height="7" rx="1" fill="currentColor" />
        <rect x="7" y="6" width="4" height="11" rx="1" fill="currentColor" />
        <rect x="13" y="1" width="4" height="16" rx="1" fill="var(--accent)" />
      </svg>
      DeckIQ
    </Link>
  );
}

export function Segmented<T extends string>({ label, value, options, onChange, size = "md" }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; size?: "sm" | "md" }) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[10px] bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] p-1" id={id}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`${size === "sm" ? "h-8 px-3 text-[13px]" : "h-9 px-4 text-[14px]"} rounded-[8px] font-medium transition-colors ${on ? "bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-ink-2 hover:text-ink"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Marketing header (docs/03 S0): border appears after 24px scroll; menu button below 768px. */
export function SiteHeader() {
  const backend = useBackend();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  const signedIn = backend.mode === "cloud" && backend.signedIn;
  const links = (
    <>
      <Link href="/#how" className="text-[15px] text-ink-2 hover:text-ink">How it works</Link>
      <Link href="/pricing" className="text-[15px] text-ink-2 hover:text-ink">Pricing</Link>
      {backend.mode === "cloud" && !signedIn && <Link href="/sign-in" className="text-[15px] text-ink-2 hover:text-ink">Sign in</Link>}
      {(signedIn || backend.mode === "demo") && <Link href="/dashboard" className="text-[15px] text-ink-2 hover:text-ink">Dashboard</Link>}
    </>
  );
  return (
    <header className={`sticky top-0 z-30 bg-canvas transition-[border-color] ${scrolled ? "border-b border-line" : "border-b border-transparent"}`}>
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-6">
        <Wordmark />
        <nav aria-label="Main" className="hidden items-center gap-8 md:flex">
          {links}
          <Link href="/new" className="btn btn-primary btn-sm">Start a deck free</Link>
        </nav>
        <div className="flex items-center gap-2 md:hidden">
          <Link href="/new" className="btn btn-primary btn-sm">Start a deck</Link>
          <button type="button" className="btn btn-ghost btn-sm" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen((o) => !o)}>
            Menu
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Main" className="flex flex-col gap-4 border-t border-line px-6 py-4 md:hidden">
          {links}
        </nav>
      )}
    </header>
  );
}

export function AccountArea() {
  const backend = useBackend();
  if (backend.mode === "demo") {
    return (
      <span className="rounded-[6px] border border-line px-2 py-1 text-[12px] text-ink-2" title="No sign-in keys are configured. Decks are saved in this browser.">
        Demo mode
      </span>
    );
  }
  if (!backend.signedIn) return <Link href="/sign-in" className="btn btn-secondary btn-sm">Sign in</Link>;
  return <UserButton />;
}

const APP_LINKS = [
  ["/dashboard", "Home"],
  ["/decks", "Decks"],
  ["/assets", "Photos"],
  ["/templates", "Templates"],
  ["/pricing", "Plans"],
] as const;

/** App header for signed-in pages. */
export function AppHeader({ children }: { children?: ReactNode }) {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-6 px-6">
        <Wordmark href="/dashboard" />
        <nav aria-label="App" className="flex items-center gap-1 overflow-x-auto text-[14px]">
          {APP_LINKS.map(([href, label]) => {
            const on = path === href || (href !== "/dashboard" && path.startsWith(href + "/"));
            return (
              <Link key={href} href={href} aria-current={on ? "page" : undefined} className={`rounded-[8px] px-2.5 py-1.5 ${on ? "bg-[color-mix(in_srgb,var(--ink)_7%,transparent)] font-medium text-ink" : "text-ink-2 hover:text-ink"}`}>
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {children}
          <Link href="/new" className="btn btn-primary btn-sm hidden sm:inline-flex">New deck</Link>
          <AccountArea />
        </div>
      </div>
    </header>
  );
}

export function ErrorNote({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start justify-between gap-4 rounded-[10px] border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--danger)_6%,var(--surface))] px-4 py-3 text-[14px] text-ink">
      <span>{children}</span>
      {onRetry && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

/** Shown when an API call returns 402 (plan or credit limit). Never blocks work already done. */
export function UpgradeNote({ message }: { message: string }) {
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-4 rounded-[10px] border border-line bg-surface px-4 py-3 text-[14px]">
      <span>{message}</span>
      <Link href="/pricing" className="btn btn-primary btn-sm">See plans</Link>
    </div>
  );
}
