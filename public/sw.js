// Service worker for EV Charging History.
//
// One cache (`shell-v1`): app-shell HTML + static assets. The dashboard is
// rendered by RSC with state baked into the HTML, so caching that HTML is
// what gives us "offline read of the last known state" — there's no
// client-side state API to layer SWR over.
//
// Bump CACHE_VERSION whenever the precache list or routing rules change;
// the `activate` handler purges anything that doesn't match.

const CACHE_VERSION = "v1";
const SHELL_CACHE = `shell-${CACHE_VERSION}`;

// Keep the precache minimal: Next ships hashed JS/CSS that will be fetched
// lazily and cached opportunistically. We only need to guarantee the
// HTML entry points so the user gets *something* offline.
const PRECACHE_URLS = ["/", "/dashboard", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      // addAll fails-all on the first 404; fetch individually + tolerate
      // missing entries so a renamed route doesn't brick the install.
      Promise.all(
        PRECACHE_URLS.map((url) =>
          fetch(url, { credentials: "same-origin" })
            .then((res) => (res.ok ? cache.put(url, res) : null))
            .catch(() => null),
        ),
      ),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k)),
        ),
      ),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations (HTML): network-first, fall back to cached app shell on
  // failure. Keeps the live page fresh while online; offline users get
  // the dashboard HTML they last saw, with state baked in by the RSC
  // render (this is our "offline read" mechanism).
  if (req.mode === "navigate") {
    event.respondWith(networkFirstWithShellFallback(req));
    return;
  }

  // Static assets: cache-first.
  if (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/icon")) {
    event.respondWith(cacheFirst(req, SHELL_CACHE));
    return;
  }
});

async function networkFirstWithShellFallback(req) {
  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    const cached =
      (await cache.match(req)) ||
      (await cache.match("/dashboard")) ||
      (await cache.match("/"));
    if (cached) return cached;
    return new Response("Offline.", { status: 503, statusText: "Offline" });
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return cached || Response.error();
  }
}
