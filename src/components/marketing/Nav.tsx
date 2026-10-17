"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useBackend } from "@/lib/client/backend";
import { CATEGORIES, CATEGORY_LABEL, TEMPLATES } from "@/lib/deck/templates";

export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden="true">
      <rect x="1" y="12" width="5" height="9" rx="1.4" fill="currentColor" />
      <rect x="8.5" y="7" width="5" height="14" rx="1.4" fill="currentColor" />
      <rect x="16" y="1" width="5" height="20" rx="1.4" fill="#2563d9" />
    </svg>
  );
}

export function AnnouncementBar() {
  return (
    <div className="m-tex m-tex-blue">
      <Link href="/templates" className="m-frame flex h-9 items-center justify-center gap-2 text-[13px] font-medium text-white hover:underline">
        New: {TEMPLATES.length} sample decks you can open, play and edit
        <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}

type Menu = { label: string; items: { href: string; title: string; note?: string }[] };

const MENUS: Menu[] = [
  {
    label: "Product",
    items: [
      { href: "/#overview", title: "How it works", note: "Notes to outline to deck" },
      { href: "/#edit", title: "Editing", note: "Change one thing in plain words" },
      { href: "/#checks", title: "Quality checks", note: "No invented numbers" },
      { href: "/#platform", title: "Themes and motion", note: "6 themes, 20 layouts" },
    ],
  },
  {
    label: "Templates",
    items: [
      ...CATEGORIES.map((c) => ({ href: `/templates?type=${c}`, title: CATEGORY_LABEL[c], note: `${TEMPLATES.filter((t) => t.category === c).length} sample decks` })),
      { href: "/templates", title: "All templates" },
    ],
  },
];

function Dropdown({ menu }: { menu: Menu }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative" onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)} onMouseEnter={() => setOpen(true)} className="flex h-9 items-center gap-1 rounded-full px-3 text-[14px] text-[#3b3e45] hover:text-[var(--m-ink)]">
        {menu.label}
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="m-fade absolute left-1/2 top-full z-40 w-[280px] -translate-x-1/2 pt-2">
          <ul className="m-card p-2">
            {menu.items.map((i) => (
              <li key={i.href}>
                <Link href={i.href} onClick={() => setOpen(false)} className="block rounded-[10px] px-3 py-2 hover:bg-[var(--m-soft)]">
                  <span className="block text-[14px] font-medium">{i.title}</span>
                  {i.note && <span className="block text-[12px] text-[var(--m-gray)]">{i.note}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function Nav() {
  const backend = useBackend();
  const [mobile, setMobile] = useState(false);
  const [floating, setFloating] = useState(false);
  const signedIn = backend.mode === "demo" || backend.signedIn;
  useEffect(() => {
    const on = () => setFloating(window.scrollY > 48);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={`m-nav sticky top-0 z-30 ${floating ? "m-nav-float" : ""}`}>
      <div className="m-nav-bar m-frame flex h-16 items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-2 text-[18px] font-medium tracking-[-0.02em]" aria-label="Kinetic home">
          <Mark />
          Kinetic
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {MENUS.map((m) => (
            <Dropdown key={m.label} menu={m} />
          ))}
          <Link href="/pricing" className="flex h-9 items-center rounded-full px-3 text-[14px] text-[#3b3e45] hover:text-[var(--m-ink)]">Pricing</Link>
          {signedIn && <Link href="/dashboard" className="flex h-9 items-center rounded-full px-3 text-[14px] text-[#3b3e45] hover:text-[var(--m-ink)]">Dashboard</Link>}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          {!signedIn && <Link href="/sign-in" className="m-pill m-pill-light m-pill-sm">Sign in</Link>}
          {signedIn && backend.mode === "demo" && <Link href="/templates" className="m-pill m-pill-light m-pill-sm">Templates</Link>}
          <Link href="/new" className="m-pill m-pill-dark m-pill-sm">Start a deck free</Link>
        </div>
        <button type="button" className="m-pill m-pill-light m-pill-sm md:hidden" aria-expanded={mobile} aria-controls="m-mobile" onClick={() => setMobile((v) => !v)}>
          Menu
        </button>
      </div>
      {mobile && (
        <nav id="m-mobile" aria-label="Main" className="border-t border-[var(--m-line)] bg-white md:hidden">
          <div className="m-frame flex flex-col gap-1 py-3 text-[15px]">
            {[...MENUS.flatMap((m) => m.items.slice(0, 4)), { href: "/pricing", title: "Pricing" }].map((i) => (
              <Link key={i.href + i.title} href={i.href} className="rounded-[10px] px-2 py-2 hover:bg-[var(--m-soft)]" onClick={() => setMobile(false)}>
                {i.title}
              </Link>
            ))}
            <div className="mt-2 flex gap-2">
              {!signedIn && <Link href="/sign-in" className="m-pill m-pill-light m-pill-sm">Sign in</Link>}
              <Link href="/new" className="m-pill m-pill-dark m-pill-sm">Start a deck free</Link>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}
