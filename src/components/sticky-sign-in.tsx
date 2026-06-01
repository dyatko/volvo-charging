"use client";

import { useEffect, useState } from "react";

export function StickySignIn() {
  // This is the page's only sign-in CTA, so it stays on screen from load —
  // it only retracts once the footer scrolls into view, to avoid covering it.
  const [footerVisible, setFooterVisible] = useState(false);

  useEffect(() => {
    const footer = document.getElementById("site-footer");
    if (!footer) return;
    const o = new IntersectionObserver(
      ([entry]) => setFooterVisible(entry.isIntersecting),
      { threshold: 0 },
    );
    o.observe(footer);
    return () => o.disconnect();
  }, []);

  const show = !footerVisible;

  return (
    <div
      aria-hidden={!show}
      className={
        "fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/85 px-4 py-3 backdrop-blur transition-transform duration-200 dark:border-zinc-800 dark:bg-zinc-950/85 " +
        (show ? "translate-y-0" : "pointer-events-none translate-y-full")
      }
    >
      <div className="mx-auto max-w-md">
        <a
          href="/api/auth/start"
          className="flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-3 font-mono text-sm font-semibold uppercase tracking-[0.08em] text-white shadow-lg shadow-zinc-900/20 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:shadow-zinc-100/10 dark:hover:bg-zinc-200"
        >
          Sign in with Volvo ID →
        </a>
        <p className="mt-2 text-center text-xs text-zinc-500">
          You sign in on Volvo&apos;s own page (official OAuth 2.0 + PKCE) — we never see
          your password — then return to your dashboard with live charging state ready.
        </p>
      </div>
    </div>
  );
}
