"use client";

// App shell for signed-in pages (docs/09 §2): quiet left sidebar on desktop, collapsible to an
// icon rail (remembered), bottom tab bar on phones, and a Ctrl/⌘ K command palette everywhere.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { UserButton, useUser } from "@clerk/nextjs";
import { Home, Images, LayoutTemplate, Link2, Palette, PanelLeftClose, PanelLeftOpen, Plus, Presentation, Search, Settings, Tag } from "lucide-react";
import { useBackend } from "@/lib/client/backend";
import { useMe } from "@/lib/client/me";
import { MONTHLY_CREDITS } from "@/lib/billing/credits";
import { formatBytes } from "./assets-ui";
import { CommandPalette } from "./CommandPalette";

const NAV = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/decks", label: "Decks", icon: Presentation },
  { href: "/templates", label: "Templates", icon: LayoutTemplate },
  { href: "/assets", label: "Photos", icon: Images },
  { href: "/brand", label: "Brand kits", icon: Palette },
  { href: "/shared", label: "Shared links", icon: Link2 },
] as const;

const PaletteCtx = createContext<() => void>(() => {});
/** Opens the command palette (for "Search" buttons inside pages). */
export const useOpenPalette = () => useContext(PaletteCtx);

const isActive = (path: string, href: string) => path === href || (href !== "/dashboard" && path.startsWith(href + "/"));

function Mark({ size = 28 }: { size?: number }) {
  return (
    <span className="flex flex-none items-center justify-center rounded-[8px] bg-ink" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size * 0.57} height={size * 0.57} viewBox="0 0 18 18">
        <rect x="1" y="10" width="4" height="7" rx="1" fill="var(--canvas)" />
        <rect x="7" y="6" width="4" height="11" rx="1" fill="var(--canvas)" />
        <rect x="13" y="1" width="4" height="16" rx="1" fill="var(--accent)" />
      </svg>
    </span>
  );
}

function CloudName() {
  const { user } = useUser();
  return <>{user?.firstName || user?.username || "Your space"}</>;
}

function Meter({ label, value, max, text }: { label: string; value: number; max: number; text: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between gap-2 text-[12px] text-ink-2">
        <span>{label}</span>
        <span className="tabular">{text}</span>
      </div>
      <div className="mb-2.5 mt-1.5 h-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--ink)_8%,transparent)]" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
        <div className={`h-full rounded-full ${pct >= 80 ? "bg-warning" : "bg-accent"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function UsageCard() {
  const { me } = useMe();
  const backend = useBackend();
  if (backend.mode === "demo") {
    return <p className="rounded-[10px] border border-line bg-surface p-3 text-[12px] leading-[17px] text-ink-2">Demo mode: decks and photos are saved in this browser.</p>;
  }
  if (!me) return <div className="skeleton h-[118px] rounded-[10px]" aria-hidden="true" />;
  const limit = MONTHLY_CREDITS[me.plan];
  const used = me.creditsRemaining === null ? 0 : limit - me.creditsRemaining;
  return (
    <div className="rounded-[10px] border border-line bg-surface p-3" aria-label="Plan usage">
      {me.creditsRemaining !== null && me.features.gemini && <Meter label="AI credits used" value={used} max={limit} text={`${used.toLocaleString()} / ${limit.toLocaleString()}`} />}
      {me.plan === "free" ? <Meter label="Decks" value={me.deckCount} max={3} text={`${me.deckCount} / 3`} /> : me.storage && <Meter label="Photo storage" value={me.storage.usedBytes} max={me.storage.limitBytes} text={`${formatBytes(me.storage.usedBytes)} / ${formatBytes(me.storage.limitBytes)}`} />}
      <Link href="/pricing" className="btn btn-secondary btn-sm mt-0.5 w-full min-h-8">
        {me.plan === "free" ? "See Pro plan" : "Plan and usage"}
      </Link>
    </div>
  );
}

function NavLink({ href, label, icon: Icon, collapsed, path }: { href: string; label: string; icon: typeof Home; collapsed: boolean; path: string }) {
  const on = isActive(path, href);
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      title={collapsed ? label : undefined}
      className={`flex items-center gap-2.5 rounded-[8px] px-2.5 py-[7px] text-[14px] ${collapsed ? "justify-center" : ""} ${on ? "bg-surface font-semibold text-ink shadow-[0_1px_2px_rgba(16,17,20,.06),0_2px_8px_rgba(16,17,20,.04)]" : "text-ink-2 hover:bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] hover:text-ink"}`}
    >
      <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
      {collapsed ? <span className="sr-only">{label}</span> : label}
    </Link>
  );
}

function Account({ collapsed }: { collapsed: boolean }) {
  const backend = useBackend();
  if (backend.mode !== "cloud") return null;
  return (
    <div className={`flex items-center gap-2.5 px-2 py-1.5 text-[13px] ${collapsed ? "justify-center" : ""}`}>
      <UserButton />
      {!collapsed && <span className="truncate text-ink-2"><CloudName /></span>}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const backend = useBackend();
  const { me } = useMe();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading a saved preference after hydration
      setCollapsed(localStorage.getItem("kinetic.sidebar.collapsed") === "1");
    } catch {}
  }, []);
  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem("kinetic.sidebar.collapsed", c ? "0" : "1");
      } catch {}
      return !c;
    });

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const planLabel = backend.mode === "demo" ? "Demo mode" : me ? `${me.plan[0].toUpperCase()}${me.plan.slice(1)} plan` : " ";

  return (
    <PaletteCtx value={openPalette}>
      <a href="#app-content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-[8px] focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>
      <div className={`grid min-h-dvh grid-cols-1 ${collapsed ? "md:grid-cols-[64px_1fr]" : "md:grid-cols-[240px_1fr]"}`}>
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-dvh flex-col gap-1 border-r border-line bg-[color-mix(in_srgb,var(--ink)_3%,var(--canvas))] p-3 md:flex" aria-label="Main navigation">
          <div className={`flex items-center gap-2.5 px-1.5 py-1.5 ${collapsed ? "flex-col" : ""}`}>
            <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5" aria-label="Kinetic home">
              <Mark />
              {!collapsed && (
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-[14px] font-semibold">{backend.mode === "cloud" ? <CloudName /> : "Kinetic"}</span>
                  <span className="block truncate text-[12px] text-ink-2">{planLabel}</span>
                </span>
              )}
            </Link>
            <button type="button" onClick={toggle} className={`${collapsed ? "" : "ml-auto"} rounded-[6px] p-1 text-ink-2 hover:bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] hover:text-ink`} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
              {collapsed ? <PanelLeftOpen size={16} aria-hidden="true" /> : <PanelLeftClose size={16} aria-hidden="true" />}
            </button>
          </div>

          <button type="button" onClick={openPalette} className={`my-2 flex items-center gap-2 rounded-[10px] border border-line bg-surface px-2.5 py-[7px] text-left text-[13px] text-ink-2 hover:border-ink-2 ${collapsed ? "justify-center" : ""}`} aria-label="Search or jump to (Ctrl K)">
            <Search size={15} aria-hidden="true" />
            {!collapsed && (
              <>
                Search or jump to
                <kbd className="ml-auto rounded-[4px] border border-line px-1 text-[11px] text-ink-2">Ctrl K</kbd>
              </>
            )}
          </button>

          <Link href="/new" className={`btn btn-primary btn-sm mb-2 ${collapsed ? "px-0" : ""}`} title={collapsed ? "New deck" : undefined}>
            <Plus size={15} aria-hidden="true" />
            {collapsed ? <span className="sr-only">New deck</span> : "New deck"}
          </Link>

          <nav aria-label="App" className="flex flex-col gap-0.5">
            {NAV.map((n) => (
              <NavLink key={n.href} {...n} collapsed={collapsed} path={path} />
            ))}
          </nav>

          <div className="mt-auto flex flex-col gap-1">
            {!collapsed && <UsageCard />}
            <nav aria-label="Account" className="flex flex-col gap-0.5">
              <NavLink href="/pricing" label="Plans" icon={Tag} collapsed={collapsed} path={path} />
              <NavLink href="/settings" label="Settings" icon={Settings} collapsed={collapsed} path={path} />
            </nav>
            <Account collapsed={collapsed} />
          </div>
        </aside>

        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-canvas px-4 md:hidden">
          <Link href="/dashboard" aria-label="Kinetic home"><Mark size={26} /></Link>
          <span className="truncate text-[14px] font-semibold">{NAV.find((n) => isActive(path, n.href))?.label ?? (path.startsWith("/settings") ? "Settings" : "Kinetic")}</span>
          <button type="button" onClick={openPalette} className="btn btn-ghost btn-sm ml-auto px-2.5" aria-label="Search"><Search size={18} aria-hidden="true" /></button>
          {backend.mode === "cloud" && <UserButton />}
        </header>

        <div id="app-content" className="min-w-0 pb-20 md:pb-0">{children}</div>
      </div>

      {/* Mobile bottom bar */}
      <nav aria-label="App" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface pb-[max(8px,env(safe-area-inset-bottom))] pt-2 md:hidden">
        {[NAV[0], NAV[1], { href: "/new", label: "New", icon: Plus }, NAV[5], { href: "/settings", label: "Settings", icon: Settings }].map((n) => {
          const on = isActive(path, n.href);
          const Icon = n.icon;
          return (
            <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined} className={`flex flex-col items-center gap-0.5 text-[11px] ${on ? "font-semibold text-ink" : "text-ink-2"}`}>
              <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
              {n.label}
            </Link>
          );
        })}
      </nav>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </PaletteCtx>
  );
}
