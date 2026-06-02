import { readFileSync } from "node:fs";
import { join } from "node:path";

// The service worker is served from here (rather than as a static public/ file)
// for one reason: we stamp the current deploy's build id into its first line.
// A browser only treats a worker as "new" when its bytes differ from the
// installed one, so a static, never-changing sw.js makes a code-only deploy
// invisible to an already-installed PWA — it keeps serving the old cached
// shell until the app is force-quit. Stamping the build id means every deploy
// ships byte-different worker source, so registration.update() (see
// src/components/sw-register.tsx) finds the new version and refreshes the app.
//
// Worker logic below is otherwise unchanged from the old public/sw.js; the
// only edit is SHELL_CACHE using string concatenation instead of a template
// literal, so the source can be embedded in the template string we serve.

export const dynamic = "force-dynamic";

function deployVersion(): string {
  // next.config inlines this at build time; the .next/BUILD_ID read is a
  // belt-and-braces fallback for the standalone runtime (Next writes the same
  // id there). "dev" only in local `next dev`, where the SW is not registered.
  const fromEnv = process.env.NEXT_PUBLIC_BUILD_ID;
  if (fromEnv) return fromEnv;
  try {
    return readFileSync(join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim();
  } catch {
    return "dev";
  }
}

const SW_SOURCE = `// Service worker for EV Charging History.
//
// One cache ("shell-<version>"): app-shell HTML + static assets. The dashboard
// is rendered by RSC with state baked into the HTML, so caching that HTML is
// what gives us "offline read of the last known state" — there's no
// client-side state API to layer SWR over.
//
// CACHE_VERSION guards the precache list / routing rules; the build id stamped
// at the very top of this file (see src/app/sw.js/route.ts) is what makes the
// worker byte-different per deploy so an installed PWA notices new versions.

const CACHE_VERSION = "v2";
const SHELL_CACHE = "shell-" + CACHE_VERSION;

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
`;

export function GET() {
  const body = `// build: ${deployVersion()}\n${SW_SOURCE}`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      // Always revalidate the worker script itself so a new deploy is picked
      // up promptly instead of being served from the HTTP cache.
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Service-Worker-Allowed": "/",
    },
  });
}
