import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { chargingSessions, users } from "@/db/schema";
import { getSession } from "@/lib/session";
import { loadUserContext, getVehicleRow } from "@/lib/userVehicle";
import { latestSnapshot, pollAllVehicles } from "@/lib/polling";
import { isPollStale } from "@/lib/pollCadence";
import { resolveLocationLabels } from "@/lib/geocoding/labels";
import { getGoogleMapsBrowserKey, getGoogleMapsMapId } from "@/lib/maps/config";
import { AutoRefresh } from "@/components/auto-refresh";
import { RelativeTime } from "@/components/relative-time";
import { DangerZone } from "@/components/danger-zone";
import { VehicleDashboard } from "@/components/vehicle-dashboard";
import { sessionLatLng } from "@/lib/dashboard/types";
import { toVehicleDashboardProps } from "@/lib/dashboard/adapt";

// Per-user state — never something a search engine should serve. robots.txt
// already disallows /dashboard, but a misbehaving crawler that follows a
// direct link still needs the page-level signal.
export const metadata: Metadata = {
  title: "Dashboard — EV Charging History",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session.userId) redirect("/");
  const ctx = await loadUserContext(session.userId);
  if (!ctx || !ctx.activeVehicle) redirect("/");

  const energyCreds = ctx.credsFor("energy");

  // Record activity: the user is looking right now. This keeps the scheduler
  // tick polling every minute for 15 min after they leave (see
  // src/lib/pollCadence.ts). Update the in-memory ctx too so the force-poll
  // below treats them as active on this very render.
  const seenAt = new Date();
  ctx.userLastSeenAt = seenAt;
  await db
    .update(users)
    .set({ lastSeenAt: seenAt })
    .where(eq(users.id, ctx.userId))
    .catch(() => undefined);

  // Poll ALL of the user's vehicles on every dashboard load (force — a
  // user-initiated view always gets fresh data, bypassing the cadence gate).
  if (energyCreds) {
    await pollAllVehicles(ctx).catch(() => undefined);
  }

  // Re-read the active vehicle: the force-poll above wrote fresh last_seen_at /
  // last_polled_at / last_error to the DB, but ctx.activeVehicle is the snapshot
  // from *before* the poll. Render the post-poll row so "Updated …" and the
  // health banner reflect the poll we just ran, not the one before it.
  const active = (await getVehicleRow(ctx.activeVehicle.vin)) ?? ctx.activeVehicle;

  // Has the background poller gone stale (no successful read in a while)? Reuse
  // seenAt (this request's timestamp) as "now" — calling Date.now() inline in
  // the render below trips the react-hooks/purity rule.
  const pollStale = isPollStale(active.lastSeenAt, seenAt.getTime());

  const latest = await latestSnapshot(active.vin);

  const sessionRows = await db
    .select()
    .from(chargingSessions)
    .where(eq(chargingSessions.vin, active.vin))
    .orderBy(desc(chargingSessions.startedAt))
    .limit(50);

  // Resolve coarse "Area · City" names for every displayed location (current
  // position + each session's latest-known fix), batched and deduped by
  // quantised position. A first view also backfills names for historical
  // sessions into the geocode cache; best-effort, so it never breaks the render.
  const displayedCoords: Array<[number, number]> = [];
  if (active.currentLat != null && active.currentLng != null) {
    displayedCoords.push([active.currentLat, active.currentLng]);
  }
  for (const s of sessionRows) {
    const loc = sessionLatLng(s);
    if (loc) displayedCoords.push([loc.lat, loc.lng]);
  }
  const nameFor = await resolveLocationLabels(displayedCoords);

  // Browser-side Maps key for the overview map (rendered inside VehicleDashboard).
  // Null/placeholder → no map (additive).
  const browserKey = getGoogleMapsBrowserKey();

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-6">
      <AutoRefresh />
      {!energyCreds ? (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
          Your Energy API token has expired or is missing. Showing the last cached snapshot.
          <Link href="/" className="ml-1 underline">Sign in again</Link>.
        </div>
      ) : pollStale ? (
        // Creds look fine right now, but the background poller hasn't had a
        // successful read in a while — so data may be missing for that gap.
        // Only renders on a genuine stall; nothing shows when polling is healthy.
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
          We haven&apos;t been able to update {active.model ? `your ${active.model}` : "your car"} since{" "}
          <RelativeTime iso={active.lastSeenAt ? active.lastSeenAt.toISOString() : null} />
          {active.consecutiveFailures > 0 ? ` (${active.consecutiveFailures} failed attempts)` : ""}, so
          charging data for this period may be missing.
          <Link href="/" className="ml-1 underline">Reconnect Volvo</Link>.
          {active.lastError ? (
            <span className="mt-1 block font-mono text-[11px] opacity-70">{active.lastError}</span>
          ) : null}
        </div>
      ) : null}

      <VehicleDashboard
        {...toVehicleDashboardProps({
          vehicle: active,
          latest,
          sessions: sessionRows,
          nameFor,
          mapApiKey: browserKey,
          mapId: getGoogleMapsMapId(),
        })}
      />

      {ctx.vehicles.length > 1 ? (
        <p className="mt-6 text-center text-xs text-zinc-500">
          Polling {ctx.vehicles.length} vehicles · use the switcher in the header to view another.
        </p>
      ) : null}

      <DangerZone />
    </main>
  );
}
