import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
import { users, vehicles } from "@/db/schema";
import { eq } from "drizzle-orm";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "EV Charging History — live charging status & session log for your Volvo",
    template: "%s",
  },
  description:
    "Track your Volvo's state of charge, session-by-session energy history, and live location in one mobile-first dashboard. Connects to Volvo's official Connected Vehicle, Energy, and Location APIs.",
  applicationName: "EV Charging History",
  authors: [{ name: "Marat Dyatko" }],
  keywords: [
    "EV charging history",
    "EV charging log",
    "Volvo charging history",
    "Volvo EV dashboard",
    "Volvo state of charge",
    "Volvo Energy API",
    "Volvo Connected Vehicle API",
    "Volvo XC40 Recharge charging",
    "Volvo EX30 charging app",
  ],
  openGraph: {
    type: "website",
    siteName: "EV Charging History",
    title: "EV Charging History — live charging status & session log for your Volvo",
    description:
      "Mobile-first dashboard for your Volvo's state of charge, charging sessions, and live location. Built on Volvo's official Connected Vehicle, Energy, and Location APIs.",
    url: "/",
    locale: "en_US",
  },
  twitter: {
    card: "summary",
    title: "EV Charging History",
    description:
      "Live charging status and session log for your Volvo. Built on Volvo's official APIs.",
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
  icons: {
    apple: [{ url: "/apple-icon.svg", type: "image/svg+xml" }],
  },
};

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
    navProps = { signedIn: true, vehicles: list, activeVin: userRow?.activeVin ?? null };
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
