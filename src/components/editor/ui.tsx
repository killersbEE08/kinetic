"use client";

// Small building blocks for the editor chrome: icon buttons, dropdown menus, keyboard hints.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border border-line bg-canvas px-1 font-sans text-[10.5px] font-medium text-ink-2">{children}</kbd>;
}

/** Square icon-only button. `label` is the accessible name and the tooltip. */
export function IconButton({ label, onClick, disabled, active, children, className = "", shortcut }: { label: string; onClick?: () => void; disabled?: boolean; active?: boolean; children: ReactNode; className?: string; shortcut?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-pressed={active === undefined ? undefined : active}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 w-8 flex-none items-center justify-center rounded-[8px] text-ink-2 transition-colors hover:bg-[color-mix(in_srgb,var(--ink)_7%,transparent)] hover:text-ink disabled:pointer-events-none disabled:opacity-35 ${active ? "bg-[color-mix(in_srgb,var(--ink)_8%,transparent)] text-ink" : ""} ${className}`}
    >
      {children}
    </button>
  );
}

export const menuItem = "flex w-full items-center gap-2.5 rounded-[6px] px-2.5 py-[7px] text-left text-[13px] text-ink hover:bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] disabled:pointer-events-none disabled:opacity-40";

/** Button + dropdown panel that closes on outside click or Escape. */
export function DropMenu({
  trigger,
  children,
  align = "left",
  side = "bottom",
  width = "min-w-[200px]",
  label,
}: {
  trigger: (p: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  side?: "bottom" | "top";
  width?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  // Fixed to the viewport so scrolling panels (slide rail, inspector) never clip the menu.
  const [pos, setPos] = useState<CSSProperties>({});
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !box?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), setOpen(false));
    const onScroll = (e: Event) => !menuRef.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, box]);
  const toggle = () => {
    const r = box?.getBoundingClientRect();
    if (!open && r) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // Open upwards when there is not enough room below (or when asked to).
      const up = side === "top" || (vh - r.bottom < 300 && r.top > vh - r.bottom);
      setPos({
        position: "fixed",
        ...(up ? { bottom: vh - r.top + 6 } : { top: r.bottom + 6 }),
        ...(align === "left" ? { left: Math.max(8, r.left) } : { right: Math.max(8, vw - r.right) }),
        maxHeight: (up ? r.top : vh - r.bottom) - 16,
      });
    }
    setOpen((o) => !o);
  };
  return (
    <div ref={setBox} className="relative">
      {trigger({ open, toggle })}
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          style={pos}
          className={`z-50 max-w-[calc(100vw-16px)] overflow-y-auto rounded-[12px] border border-line bg-surface p-1.5 shadow-[0_16px_40px_-12px_rgba(16,17,20,.28),0_2px_6px_rgba(16,17,20,.06)] ${width}`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuSep() {
  return <div className="my-1 h-px bg-line" role="separator" />;
}

/** Native <dialog> wrapper used for editor modals. */
export function Modal({ open, onClose, title, children, width = "w-[min(640px,calc(100vw-32px))]" }: { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} className={`m-auto rounded-[20px] border border-line bg-surface p-0 text-ink shadow-[0_24px_64px_-16px_rgba(0,0,0,.35)] backdrop:bg-black/40 ${width}`} aria-label={title}>
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <button type="button" className="btn btn-ghost btn-sm min-h-8" onClick={onClose}>Close</button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto p-5">{open && children}</div>
    </dialog>
  );
}
