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
import { getSession } from "@/lib/session";
import { db } from "@/db/client";
import { users, vehicles } from "@/db/schema";
import { eq } from "drizzle-orm";

export const metadata: Metadata = {
  title: "Volvo Charging",
  description: "Live status and historical sessions for your Volvo.",
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
        exteriorImageUrl: vehicles.exteriorImageUrl,
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
        {children}
      </body>
    </html>
  );
}
