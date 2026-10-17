"use client";

// The bell: share-link opens, view summaries ("Acme viewed your deck for 2m"), and comments.
// Polls once a minute while the page is visible. Signed-in mode only.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bell, Eye, MessageSquare } from "lucide-react";
import { useBackend, type AppNotification } from "@/lib/client/backend";
import { DropMenu } from "@/components/editor/ui";
import { relTime } from "./ShareDialog";

export function NotificationBell({ align = "left", side = "bottom" }: { align?: "left" | "right"; side?: "top" | "bottom" }) {
  const backend = useBackend();
  const [data, setData] = useState<{ unread: number; items: AppNotification[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const on = backend.mode === "cloud" && backend.signedIn;

  const load = useCallback(() => {
    if (!on) return;
    backend
      .listNotifications()
      .then((d) => {
        setData(d);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [backend, on]);

  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  if (!on) return null;
  const unread = data?.unread ?? 0;

  const markAll = async () => {
    await backend.markNotificationsRead("all").catch(() => undefined);
    setData((d) => (d ? { unread: 0, items: d.items.map((n) => ({ ...n, read: true })) } : d));
  };
  const open = (n: AppNotification) => {
    if (!n.read) {
      void backend.markNotificationsRead([n.id]).catch(() => undefined);
      setData((d) => (d ? { unread: Math.max(0, d.unread - 1), items: d.items.map((x) => (x.id === n.id ? { ...x, read: true } : x)) } : d));
    }
  };

  return (
    <DropMenu
      align={align}
      side={side}
      width="w-[340px]"
      label="Alerts"
      trigger={({ toggle, open: isOpen }) => (
        <button type="button" onClick={() => (toggle(), !isOpen && load())} aria-expanded={isOpen} aria-label={unread ? `Alerts, ${unread} unread` : "Alerts"} title="Alerts" className="relative inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-ink-2 hover:bg-[color-mix(in_srgb,var(--ink)_7%,transparent)] hover:text-ink">
          <Bell size={16} aria-hidden="true" />
          {unread > 0 && <span className="tabular absolute -right-0.5 -top-0.5 min-w-[16px] rounded-full bg-accent px-1 text-center text-[10px] font-semibold leading-[16px] text-white">{unread > 9 ? "9+" : unread}</span>}
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
            <span className="text-[13px] font-semibold">Alerts</span>
            {unread > 0 && <button type="button" className="text-[12px] font-medium text-accent hover:underline" onClick={markAll}>Mark all read</button>}
          </div>
          {failed && !data && <p className="px-2 py-3 text-[13px] text-ink-2">Alerts couldn&rsquo;t be loaded. If this keeps happening, the database may need the latest migration.</p>}
          {data && data.items.length === 0 && <p className="px-2 py-3 text-[13px] leading-[19px] text-ink-2">Nothing yet. When someone opens one of your share links or leaves a comment, it shows up here.</p>}
          <ul className="max-h-[420px] overflow-y-auto">
            {data?.items.map((n) => {
              const Icon = n.kind === "comment" ? MessageSquare : Eye;
              const body = (
                <>
                  <Icon size={15} className="mt-0.5 flex-none text-ink-2" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[13px] leading-[18px] ${n.read ? "" : "font-semibold"}`}>{n.title}</span>
                    {n.body && <span className="mt-0.5 block text-[12px] leading-[17px] text-ink-2">{n.body}</span>}
                    <span className="mt-0.5 block text-[11px] text-ink-2">{relTime(n.createdAt)}</span>
                  </span>
                  {!n.read && <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-accent" aria-label="Unread" />}
                </>
              );
              const cls = "flex w-full items-start gap-2.5 rounded-[8px] px-2 py-2 text-left hover:bg-[color-mix(in_srgb,var(--ink)_5%,transparent)]";
              return (
                <li key={n.id}>
                  {n.url ? (
                    <Link href={n.url} className={cls} onClick={() => (open(n), close())}>{body}</Link>
                  ) : (
                    <button type="button" className={cls} onClick={() => open(n)}>{body}</button>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="border-t border-line px-2 pt-1.5">
            <Link href="/settings#alerts" className="text-[12px] text-ink-2 hover:text-ink" onClick={close}>Email and Slack alerts</Link>
          </div>
        </div>
      )}
    </DropMenu>
  );
}
