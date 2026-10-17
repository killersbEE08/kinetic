"use client";

// Cloudflare Turnstile widget for public forms. Renders nothing unless
// NEXT_PUBLIC_TURNSTILE_SITE_KEY is set at build time (the server then requires a token).
import { useEffect, useRef } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
export const captchaOn = !!SITE_KEY;

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing")));
    s.onerror = () => {
      loading = null;
      reject(new Error("turnstile failed to load"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * Calls onToken with a fresh token (or null when it expires). Change `resetKey` after each
 * submit: tokens are single-use.
 */
export function Captcha({ action, onToken, resetKey, theme = "auto" }: { action: string; onToken: (t: string | null) => void; resetKey: number; theme?: "auto" | "light" | "dark" }) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const cb = useRef(onToken);
  useEffect(() => {
    cb.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!SITE_KEY || !box.current) return;
    let cancelled = false;
    loadTurnstile()
      .then((t) => {
        if (cancelled || !box.current) return;
        widget.current = t.render(box.current, {
          sitekey: SITE_KEY,
          action,
          theme,
          size: "flexible",
          callback: (tok: string) => cb.current(tok),
          "expired-callback": () => cb.current(null),
          "error-callback": () => cb.current(null),
        });
      })
      .catch(() => cb.current(null));
    return () => {
      cancelled = true;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [action, theme]);

  useEffect(() => {
    if (resetKey && widget.current) {
      window.turnstile?.reset(widget.current);
      cb.current(null);
    }
  }, [resetKey]);

  if (!SITE_KEY) return null;
  return <div ref={box} className="min-h-[65px]" />;
}
