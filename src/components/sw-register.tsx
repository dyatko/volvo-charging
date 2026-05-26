"use client";

import { useEffect } from "react";

export function SWRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    // Skip in dev — the SW would cache stale Turbopack chunks and confuse HMR.
    if (process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => console.warn("SW registration failed", err));
  }, []);
  return null;
}
