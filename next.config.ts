import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloud Run picks up the tiny standalone bundle instead of the full
  // node_modules tree — much smaller image, much faster cold start.
  output: "standalone",
};

export default nextConfig;
