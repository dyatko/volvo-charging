import type { NextConfig } from "next";
import { randomBytes } from "node:crypto";

// A fresh id minted once per `next build`. We pin Next's own build id to it
// and inline it into the bundle as NEXT_PUBLIC_BUILD_ID, so server, client,
// and the service worker we serve from /sw.js all agree on "which version".
// Each deploy therefore ships byte-different worker source — which is exactly
// what lets an already-installed PWA notice a new version and refresh itself
// instead of waiting to be force-quit. See src/app/sw.js/route.ts and
// src/components/sw-register.tsx.
const BUILD_ID = randomBytes(8).toString("hex");

const nextConfig: NextConfig = {
  // Cloud Run picks up the tiny standalone bundle instead of the full
  // node_modules tree — much smaller image, much faster cold start.
  output: "standalone",

  generateBuildId: async () => BUILD_ID,
  env: { NEXT_PUBLIC_BUILD_ID: BUILD_ID },
};

export default nextConfig;
