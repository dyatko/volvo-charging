"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Triggers a server re-render every `intervalMs` while the tab is visible.
 * Each refresh re-runs the dashboard's server component, which calls
 * pollAllVehicles() and re-reads the latest snapshot from the DB.
 *
 * 15s × 2 API calls/poll × 1 vehicle = 8 req/min — well inside the
 * 100 req/min rate limit, and conservative against the 10k req/day quota
 * (~5.7k calls if the tab is open 12h, leaving headroom for the Cloud
 * Scheduler tick).
 *
 * Pauses when document.hidden so a forgotten background tab can't drain
 * the daily quota.
 */
export function AutoRefresh({ intervalMs = 15_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    function start() {
      if (timer) return;
      timer = setInterval(() => router.refresh(), intervalMs);
    }
    function stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    }
    function onVisibility() {
      if (document.visibilityState === "visible") start();
      else stop();
    }

    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router, intervalMs]);

  return null;
}
