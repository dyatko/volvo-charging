import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { publicOriginFromHeaders } from "@/lib/origin";
import "./globals.css";
import { SWRegister } from "@/components/sw-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { getSession } from "@/lib/session";
import { db } from "@/db/client";
import { stateSnapshots, users, vehicles } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export async function generateMetadata(): Promise<Metadata> {
  const siteUrl = publicOriginFromHeaders(await headers());
  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: "Volvo charging history — every session your Volvo app doesn't show",
      template: "%s",
    },
    description:
      "See your Volvo's full charging history: every plug-in session, every kWh, every location. Fills the gap in the Volvo Cars app, which only logs Public Charging partner sessions. Built on Volvo's official Connected Vehicle, Energy, and Location APIs.",
    applicationName: "EV Charging History",
    authors: [{ name: "Marat Dyatko" }],
    keywords: [
      "Volvo charging history",
      "Volvo app charging history",
      "Volvo charging session history",
      "Volvo charging log",
      "Volvo home charging history",
      "Volvo Public Charging alternative",
      "Volvo Cars app missing feature",
      "Volvo EV dashboard",
      "Volvo state of charge",
      "Volvo Energy API",
      "Volvo Connected Vehicle API",
      "Volvo EX30 charging history",
      "Volvo XC40 Recharge charging history",
      "Volvo EX90 charging history",
    ],
    openGraph: {
      type: "website",
      siteName: "EV Charging History",
      title: "Volvo charging history — every session your Volvo app doesn't show",
      description:
        "Every plug-in, every kWh, every location. The charging history the Volvo Cars app doesn't give you — built on Volvo's official Connected Vehicle, Energy, and Location APIs.",
      url: siteUrl,
      locale: "en_US",
      // Image is auto-picked up from src/app/opengraph-image.tsx (file convention).
    },
    twitter: {
      card: "summary_large_image",
      title: "Volvo charging history — every session your Volvo app doesn't show",
      description:
        "Every plug-in, every kWh, every location. The charging history the Volvo Cars app doesn't give you — built on Volvo's official APIs.",
      // Image is auto-picked up from src/app/opengraph-image.tsx (file convention).
    },
    robots: { index: true, follow: true },
    appleWebApp: {
      capable: true,
      title: "EV Charging",
      statusBarStyle: "black-translucent",
    },
    // Next 16's apple-icon file convention only accepts jpg/png. SVG works
    // fine via an explicit `<link rel="apple-touch-icon">`, even though iOS
    // rasterizes it before showing on the home screen.
    //
    // `app/icon.svg` is auto-included by file convention and theme-adapts via
    // `prefers-color-scheme` inside the SVG. The two `.ico` files below give
    // older browsers (that don't honor SVG favicons) a theme-aware fallback.
    icons: {
      icon: [
        { url: "/favicon-light.ico", media: "(prefers-color-scheme: light)" },
        { url: "/favicon-dark.ico", media: "(prefers-color-scheme: dark)" },
      ],
      apple: [{ url: "/apple-icon.svg", type: "image/svg+xml" }],
    },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  let navProps: React.ComponentProps<typeof Nav> = { signedIn: false };
  if (session.userId) {
    // Lightweight join just for the switcher — no token refresh here.
    const userRow = (
      await db.select({ activeVin: users.activeVin }).from(users).where(eq(users.id, session.userId)).limit(1)
    )[0];
    const list = await db
      .select({
        vin: vehicles.vin,
        model: vehicles.model,
        modelYear: vehicles.modelYear,
        fuelType: vehicles.fuelType,
        externalColour: vehicles.externalColour,
        batteryCapacityKwh: vehicles.batteryCapacityKwh,
        gearbox: vehicles.gearbox,
        upholstery: vehicles.upholstery,
        steering: vehicles.steering,
        exteriorImageUrl: vehicles.exteriorImageUrl,
        internalImageUrl: vehicles.internalImageUrl,
        currentLat: vehicles.currentLat,
        currentLng: vehicles.currentLng,
        locationUpdatedAt: vehicles.locationUpdatedAt,
        lastSeenAt: vehicles.lastSeenAt,
      })
      .from(vehicles)
      .where(eq(vehicles.userId, session.userId))
      .orderBy(vehicles.vin);
    const activeVin = userRow?.activeVin ?? null;
    let activeSoc: number | null = null;
    if (activeVin) {
      const snap = (
        await db
          .select({ soc: stateSnapshots.soc })
          .from(stateSnapshots)
          .where(eq(stateSnapshots.vin, activeVin))
          .orderBy(desc(stateSnapshots.observedAt))
          .limit(1)
      )[0];
      activeSoc = snap?.soc ?? null;
    }
    navProps = { signedIn: true, vehicles: list, activeVin, activeSoc };
  }
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <Nav {...navProps} />
        <div className="flex flex-1 flex-col">{children}</div>
        <Footer />
        <SWRegister />
      </body>
    </html>
  );
}
