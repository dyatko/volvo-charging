"use client";

import { useEffect } from "react";

export function SWRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    // Skip in dev — the SW would cache stale Turbopack chunks and confuse HMR.
    if (process.env.NODE_ENV !== "production") return;

    const swContainer = navigator.serviceWorker;
    let reloading = false;

    // Does a worker already control this page? On a brand-new install there's
    // no controller yet, and the first activation fires `controllerchange`
    // once — we must NOT treat that as an update or we'd pointlessly reload
    // the very first visit. A controller-change *after* one already existed is
    // the real "a newer worker has taken over" signal.
    const hadController = Boolean(swContainer.controller);

    const onControllerChange = () => {
      if (reloading || !hadController) return;
      reloading = true;
      // The new worker has already called skipWaiting() + clients.claim() (see
      // /sw.js), so it now controls us. Reload so the page picks up the new
      // HTML and chunks: network-first navigation then serves the fresh shell.
      // This is what spares users from killing and relaunching the app.
      window.location.reload();
    };
    swContainer.addEventListener("controllerchange", onControllerChange);

    let registration: ServiceWorkerRegistration | undefined;
    swContainer
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        registration = reg;
      })
      .catch((err) => console.warn("SW registration failed", err));

    // An installed iOS PWA is *suspended*, not closed, when you switch away,
    // so the browser never polls for a new worker on its own — which is why a
    // freshly deployed version doesn't show up until the app is force-quit.
    // Ask explicitly whenever the app returns to the foreground: if a new
    // deploy exists, /sw.js now ships byte-different source, the update is
    // found, the new worker activates, and onControllerChange reloads us.
    const checkForUpdate = () => {
      if (document.visibilityState === "visible") registration?.update();
    };
    document.addEventListener("visibilitychange", checkForUpdate);

    return () => {
      swContainer.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", checkForUpdate);
    };
  }, []);
  return null;
}
