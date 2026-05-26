"use client";

import { useEffect, useState } from "react";

export function StickySignIn() {
  const [heroVisible, setHeroVisible] = useState(true);
  const [footerVisible, setFooterVisible] = useState(false);

  useEffect(() => {
    const hero = document.getElementById("hero-cta");
    const footer = document.getElementById("site-footer");
    const observers: IntersectionObserver[] = [];

    if (hero) {
      const o = new IntersectionObserver(
        ([entry]) => setHeroVisible(entry.isIntersecting),
        { threshold: 0, rootMargin: "0px 0px -20% 0px" },
      );
      o.observe(hero);
      observers.push(o);
    }
    if (footer) {
      const o = new IntersectionObserver(
        ([entry]) => setFooterVisible(entry.isIntersecting),
        { threshold: 0 },
      );
      o.observe(footer);
      observers.push(o);
    }
    return () => observers.forEach((o) => o.disconnect());
  }, []);

  const show = !heroVisible && !footerVisible;

  return (
    <div
      aria-hidden={!show}
      className={
        "fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/85 px-4 py-3 backdrop-blur transition-transform duration-200 dark:border-zinc-800 dark:bg-zinc-950/85 " +
        (show ? "translate-y-0" : "pointer-events-none translate-y-full")
      }
    >
      <a
        href="/api/auth/start"
        className="mx-auto flex max-w-md items-center justify-center rounded-lg bg-zinc-900 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-zinc-900/20 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:shadow-zinc-100/10 dark:hover:bg-zinc-200"
      >
        Sign in with Volvo ID →
      </a>
    </div>
  );
}
