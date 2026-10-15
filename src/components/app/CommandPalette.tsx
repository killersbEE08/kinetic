"use client";

// Ctrl/⌘ K palette (docs/09 §4.7): jump to decks, templates and pages, or run an action.
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { FileUp, Home, Images, LayoutTemplate, Plus, Presentation, Settings, Tag } from "lucide-react";
import { useBackend, type DeckSummary } from "@/lib/client/backend";
import { CATEGORY_LABEL, TEMPLATES } from "@/lib/deck/templates";
import { fuzzyScore } from "./palette-score";

interface Item {
  id: string;
  group: "Decks" | "Actions" | "Templates" | "Go to";
  label: string;
  hint?: string;
  icon: typeof Home;
  run: () => void;
}

function Highlight({ text, query }: { text: string; query: string }) {
  const i = query.trim() ? text.toLowerCase().indexOf(query.trim().toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <b className="font-semibold">{text.slice(i, i + query.trim().length)}</b>
      {text.slice(i + query.trim().length)}
    </>
  );
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const backend = useBackend();
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      inputRef.current?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    backend
      .listDecks()
      .then((l) => !cancelled && setDecks(l))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, backend]);

  const items = useMemo<Item[]>(() => {
    const go = (href: string) => () => {
      onClose();
      router.push(href);
    };
    const all: Item[] = [
      ...decks.map((d) => ({ id: `d:${d.id}`, group: "Decks" as const, label: d.title, hint: `${d.slideCount} slides`, icon: Presentation, run: go(`/d/${d.id}`) })),
      { id: "a:new", group: "Actions", label: "New deck", hint: "Describe it or add files", icon: Plus, run: go("/new") },
      { id: "a:import", group: "Actions", label: "Import a file", hint: "PDF, Word, PowerPoint, Excel", icon: FileUp, run: go("/dashboard?mode=import") },
      { id: "a:redesign", group: "Actions", label: "Redesign a PowerPoint deck", icon: FileUp, run: go("/dashboard?mode=redesign") },
      { id: "a:photos", group: "Actions", label: "Upload photos", icon: Images, run: go("/assets") },
      ...TEMPLATES.map((t) => ({ id: `t:${t.id}`, group: "Templates" as const, label: t.name, hint: CATEGORY_LABEL[t.category], icon: LayoutTemplate, run: go(`/t/${t.id}`) })),
      { id: "g:home", group: "Go to", label: "Home", icon: Home, run: go("/dashboard") },
      { id: "g:decks", group: "Go to", label: "All decks", icon: Presentation, run: go("/decks") },
      { id: "g:templates", group: "Go to", label: "Templates", icon: LayoutTemplate, run: go("/templates") },
      { id: "g:photos", group: "Go to", label: "Photos", icon: Images, run: go("/assets") },
      { id: "g:plans", group: "Go to", label: "Plans and usage", icon: Tag, run: go("/pricing") },
      { id: "g:settings", group: "Go to", label: "Settings", hint: "Account, data export", icon: Settings, run: go("/settings") },
    ];
    if (!query.trim()) {
      // Empty query: recent decks first, then actions and pages (no long template list).
      return [...all.filter((i) => i.group === "Decks").slice(0, 5), ...all.filter((i) => i.group === "Actions" || i.group === "Go to")];
    }
    const order = { Decks: 0, Actions: 1, Templates: 2, "Go to": 3 };
    return all
      .map((i) => ({ i, s: fuzzyScore(query, `${i.label} ${i.hint ?? ""}`) }))
      .filter((x) => x.s > 0)
      // Exact substring matches (score >= 50) first, then loose letter-order matches; group order within each.
      .sort((a, b) => Number(b.s >= 50) - Number(a.s >= 50) || order[a.i.group] - order[b.i.group] || b.s - a.s)
      .slice(0, 30)
      .map((x) => x.i);
  }, [decks, query, router, onClose]);

  const sel = Math.min(active, Math.max(0, items.length - 1));
  useEffect(() => {
    document.getElementById(`cmd-${sel}`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  return (
    <dialog
      ref={ref}
      onClose={() => {
        setQuery("");
        setActive(0);
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      className="mx-auto mt-[12vh] w-[min(620px,calc(100vw-24px))] overflow-hidden rounded-[14px] border border-line bg-surface p-0 text-ink shadow-[0_24px_60px_-20px_rgba(0,0,0,.35)] backdrop:bg-black/35"
      aria-label="Command palette"
    >
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(items.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            items[sel]?.run();
          }
        }}
        placeholder="Search decks, templates and actions"
        aria-label="Search decks, templates and actions"
        role="combobox"
        aria-expanded="true"
        aria-controls="cmd-list"
        aria-activedescendant={items[sel] ? `cmd-${sel}` : undefined}
        className="w-full border-0 border-b border-line bg-transparent px-[18px] py-4 text-[16px] outline-none"
      />
      <ul id="cmd-list" role="listbox" className="max-h-[min(420px,60vh)] overflow-y-auto py-1">
        {items.length === 0 && <li className="px-[18px] py-6 text-center text-[14px] text-ink-2">Nothing matches &ldquo;{query}&rdquo;.</li>}
        {items.map((it, k) => {
          const head = k === 0 || items[k - 1].group !== it.group ? it.group : null;
          const Icon = it.icon;
          return (
            <li key={it.id} role="presentation">
              {head && <div className="px-[18px] pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-2">{head}</div>}
              <div
                id={`cmd-${k}`}
                role="option"
                aria-selected={k === sel}
                onMouseMove={() => setActive(k)}
                onClick={() => it.run()}
                className={`flex cursor-pointer items-center gap-3 px-[18px] py-2 text-[14px] ${k === sel ? "bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))]" : ""}`}
              >
                <Icon size={16} strokeWidth={1.75} className="flex-none text-ink-2" aria-hidden="true" />
                <span className="min-w-0 truncate"><Highlight text={it.label} query={query} /></span>
                {it.hint && <span className="ml-auto flex-none truncate pl-3 text-[12px] text-ink-2">{it.hint}</span>}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex gap-4 border-t border-line px-[18px] py-2 text-[11px] text-ink-2">
        <span>↑ ↓ to move</span>
        <span>Enter to open</span>
        <span>Esc to close</span>
      </div>
    </dialog>
  );
}
