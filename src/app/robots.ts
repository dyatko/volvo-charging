import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { publicOriginFromHeaders } from "@/lib/origin";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = publicOriginFromHeaders(await headers());
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // The signed-in surface area is per-user state; nothing useful to index
        // (and not reachable without a session anyway).
        disallow: ["/dashboard", "/api/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
