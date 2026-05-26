import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

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
    default: "Volvo Charging — live charging status & session history",
    template: "%s",
  },
  description:
    "Track your Volvo's state of charge, session-by-session energy history, and live location in one mobile-first dashboard. Connects to Volvo's official Connected Vehicle, Energy, and Location APIs.",
  applicationName: "Volvo Charging",
  authors: [{ name: "Marat Dyatko" }],
  keywords: [
    "Volvo charging",
    "Volvo EV dashboard",
    "Volvo state of charge",
    "Volvo Energy API",
    "Volvo Connected Vehicle API",
    "EV charging history",
    "Volvo XC40 Recharge charging",
    "Volvo EX30 charging app",
  ],
  openGraph: {
    type: "website",
    siteName: "Volvo Charging",
    title: "Volvo Charging — live charging status & session history",
    description:
      "Mobile-first dashboard for your Volvo's state of charge, charging sessions, and live location. Built on Volvo's official Connected Vehicle, Energy, and Location APIs.",
    url: "/",
    locale: "en_US",
  },
  twitter: {
    card: "summary",
    title: "Volvo Charging",
    description:
      "Live charging status and session history for your Volvo. Built on Volvo's official APIs.",
  },
  robots: { index: true, follow: true },
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
      </body>
    </html>
  );
}
