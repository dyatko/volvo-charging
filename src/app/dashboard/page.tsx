import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { chargingSessions, stateSnapshots } from "@/db/schema";
import { getSession } from "@/lib/session";
import { loadUserContext } from "@/lib/userVehicle";
import { pollAllVehicles } from "@/lib/polling";
import { AutoRefresh } from "@/components/auto-refresh";
import { DangerZone } from "@/components/danger-zone";
import { RelativeTime } from "@/components/relative-time";

// Per-user state — never something a search engine should serve. robots.txt
// already disallows /dashboard, but a misbehaving crawler that follows a
// direct link still needs the page-level signal.
export const metadata: Metadata = {
  title: "Dashboard — EV Charging History",
  robots: { index: false, follow: false, nocache: true },
};

function fmtSessionDuration(startedAt: Date, endedAt: Date | null): string {
  const end = endedAt ?? new Date();
  const minutes = Math.max(0, Math.round((end.getTime() - startedAt.getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function fmtCoord(lat: number | null, lng: number | null): string | null {
  if (lat == null || lng == null) return null;
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

function MapLink({
  lat,
  lng,
  label,
  className,
}: {
  lat: number;
  lng: number;
  label: string;
  className?: string;
}) {
  return (
    <a
      href={`https://www.google.com/maps?q=${lat},${lng}`}
      target="_blank"
      rel="noopener noreferrer"
      className={className ?? "underline-offset-2 hover:underline"}
      title="Open in Google Maps"
    >
      {label}
    </a>
  );
}

export const dynamic = "force-dynamic";

const friendly: Record<string, string> = {
  CONNECTED: "Plugged in",
  CONNECTED_AC: "AC plugged in",
  CONNECTED_DC: "DC plugged in",
  DISCONNECTED: "Unplugged",
  IDLE: "Idle",
  CHARGING: "Charging",
  DONE: "Done",
  DISCHARGING: "Discharging",
  SCHEDULED: "Scheduled",
  ERROR: "Error",
  UNSPECIFIED: "—",
  NONE: "None",
  AC: "AC",
  DC: "DC",
  POWER_AVAILABLE: "Power available",
  NO_POWER_AVAILABLE: "No power",
  FAULT: "Fault",
};

function toIso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  return typeof d === "string" ? d : d.toISOString();
}

function Pill({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
      {label}
    </span>
  );
}

// Brand anchors from <ChargingLogo />: red at low SOC, orange in the middle,
// green at high. The ring interpolates between them so a change of one
// percent never produces a visible color jump.
const SOC_RED: readonly [number, number, number] = [0xe5, 0x39, 0x35];
const SOC_ORANGE: readonly [number, number, number] = [0xff, 0x8a, 0x00];
const SOC_GREEN: readonly [number, number, number] = [0x00, 0xc8, 0x53];

function mixRgb(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): string {
  const h = (v: number) => Math.round(v).toString(16).padStart(2, "0");
  return `#${h(a[0] + (b[0] - a[0]) * t)}${h(a[1] + (b[1] - a[1]) * t)}${h(a[2] + (b[2] - a[2]) * t)}`;
}

function socRingColor(soc: number): string {
  if (soc <= 10) return mixRgb(SOC_RED, SOC_RED, 0);
  if (soc >= 90) return mixRgb(SOC_GREEN, SOC_GREEN, 0);
  if (soc <= 50) return mixRgb(SOC_RED, SOC_ORANGE, (soc - 10) / 40);
  return mixRgb(SOC_ORANGE, SOC_GREEN, (soc - 50) / 40);
}

function SocRing({ soc, target }: { soc: number | null; target: number | null }) {
  const value = soc ?? 0;
  const radius = 60;
  const circ = 2 * Math.PI * radius;
  const ringColor = soc != null ? socRingColor(soc) : undefined;
  return (
    <div className="relative h-40 w-40">
      <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
        <circle cx="80" cy="80" r={radius} stroke="currentColor" strokeOpacity="0.1" strokeWidth="14" fill="none" />
        <circle
          cx="80"
          cy="80"
          r={radius}
          stroke={ringColor ?? "currentColor"}
          strokeWidth="14"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${(circ * value) / 100} ${circ}`}
          className={ringColor ? undefined : "text-zinc-400"}
        />
        {target ? (
          <circle
            cx="80"
            cy="80"
            r={radius + 12}
            stroke="currentColor"
            strokeOpacity="0.4"
            strokeWidth="2"
            strokeDasharray={`${(2 * Math.PI * (radius + 12) * target) / 100} ${2 * Math.PI * (radius + 12)}`}
            fill="none"
            className="text-zinc-500"
          />
        ) : null}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-4xl font-semibold tabular-nums">
          {soc != null ? soc : "—"}
          <span className="text-base font-normal text-zinc-500">%</span>
        </div>
        {target ? <div className="text-xs text-zinc-500">target {target}%</div> : null}
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session.userId) redirect("/");
  const ctx = await loadUserContext(session.userId);
  if (!ctx || !ctx.activeVehicle) redirect("/");

  const energyCreds = ctx.credsFor("energy");

  // Poll ALL of the user's vehicles on every dashboard load.
  if (energyCreds) {
    await pollAllVehicles(ctx).catch(() => undefined);
  }

  const active = ctx.activeVehicle;

  const latest = (
    await db
      .select()
      .from(stateSnapshots)
      .where(eq(stateSnapshots.vin, active.vin))
      .orderBy(desc(stateSnapshots.observedAt))
      .limit(1)
  )[0];

  const sessionRows = await db
    .select()
    .from(chargingSessions)
    .where(eq(chargingSessions.vin, active.vin))
    .orderBy(desc(chargingSessions.startedAt))
    .limit(50);

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-6">
      <AutoRefresh />
      {!energyCreds ? (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
          Your Energy API token has expired or is missing. Showing the last cached snapshot.
          <Link href="/" className="ml-1 underline">Sign in again</Link>.
        </div>
      ) : null}

      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">
            {active.model ? `Volvo ${active.model}` : "Volvo"}
            {active.modelYear ? (
              <span className="ml-1 font-normal text-zinc-500">· {active.modelYear}</span>
            ) : null}
          </h1>
          <p className="mt-0.5 break-all text-xs text-zinc-500">
            {active.batteryCapacityKwh != null ? (
              <span className="tabular-nums">{Math.round(active.batteryCapacityKwh)} kWh</span>
            ) : null}
            {active.batteryCapacityKwh != null ? <span> · </span> : null}
            <span className="font-mono">{active.vin}</span>
          </p>
        </div>
        {active.exteriorImageUrl ? (
          <Image
            src={active.exteriorImageUrl}
            alt={active.model ? `${active.model} exterior` : "Vehicle exterior"}
            width={120}
            height={72}
            className="h-16 w-24 shrink-0 rounded object-cover"
            unoptimized
          />
        ) : null}
      </header>

      <section className="flex flex-col items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <SocRing soc={latest?.soc ?? null} target={latest?.targetSoc ?? null} />
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Pill label={friendly[latest?.connectionStatus ?? ""] ?? "—"} />
          <Pill label={friendly[latest?.chargingStatus ?? ""] ?? "—"} />
          {latest?.chargingType && latest.chargingType !== "NONE" ? (
            <Pill label={friendly[latest.chargingType] ?? latest.chargingType} />
          ) : null}
        </div>
        {latest?.rangeKm != null ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">~{latest.rangeKm} km range</p>
        ) : null}
        {latest?.chargingPowerKw != null ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Charging at {latest.chargingPowerKw.toFixed(1)} kW
          </p>
        ) : null}
        {active.currentLat != null && active.currentLng != null ? (
          <p className="font-mono text-xs tabular-nums text-zinc-500">
            <span aria-hidden>📍</span>{" "}
            <MapLink
              lat={active.currentLat}
              lng={active.currentLng}
              label={`${active.currentLat.toFixed(5)}, ${active.currentLng.toFixed(5)}`}
              className="underline-offset-2 hover:underline hover:text-zinc-700 dark:hover:text-zinc-300"
            />
          </p>
        ) : null}
        <p className="text-xs text-zinc-500">
          Updated <RelativeTime iso={toIso(active.lastSeenAt ?? latest?.observedAt ?? null)} />
        </p>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold tracking-tight">Charging sessions</h2>
        {sessionRows.length === 0 ? (
          <div className="mt-2 rounded-xl border border-dashed border-zinc-300 p-5 text-center text-xs text-zinc-500 dark:border-zinc-700">
            No sessions yet. Plug the car in (or hit{" "}
            <span className="font-medium">Refresh now</span> while plugged in) and one will
            appear here.
          </div>
        ) : (
          <ul className="mt-2 space-y-2">
            {sessionRows.map((s) => {
              const startLocLabel = fmtCoord(s.startLat, s.startLng);
              const endLocLabel = fmtCoord(s.endLat, s.endLng);
              // For an in-progress session, compute live SOC + energy from the
              // latest snapshot rather than waiting for the close to populate them.
              const liveSoc = s.isOpen ? latest?.soc ?? null : null;
              const displayEndSoc = s.endSoc ?? liveSoc;
              const liveEnergyKwh =
                s.energyKwh ??
                (displayEndSoc != null && active.batteryCapacityKwh != null
                  ? Math.max(0, ((displayEndSoc - s.startSoc) / 100) * active.batteryCapacityKwh)
                  : null);
              return (
                <li
                  key={s.id}
                  className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {new Date(s.startedAt).toLocaleString()}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {liveEnergyKwh != null ? (
                          <>+{liveEnergyKwh.toFixed(2)} kWh · </>
                        ) : null}
                        {fmtSessionDuration(
                          new Date(s.startedAt),
                          s.endedAt ? new Date(s.endedAt) : null,
                        )}
                        {" · "}
                        {s.connectionType ?? "?"}
                        {s.isOpen ? " · in progress" : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm tabular-nums">
                        {s.startSoc}% → {displayEndSoc != null ? `${displayEndSoc}%` : "…"}
                      </p>
                      {s.peakPowerKw != null ? (
                        <p className="text-xs text-zinc-500">peak {s.peakPowerKw.toFixed(1)} kW</p>
                      ) : null}
                    </div>
                  </div>
                  {startLocLabel || endLocLabel ? (
                    <p className="mt-2 font-mono text-xs tabular-nums text-zinc-500">
                      {startLocLabel && s.startLat != null && s.startLng != null ? (
                        <>
                          <span aria-hidden>📍</span>{" "}
                          <MapLink
                            lat={s.startLat}
                            lng={s.startLng}
                            label={startLocLabel}
                            className="underline-offset-2 hover:underline hover:text-zinc-700 dark:hover:text-zinc-300"
                          />
                        </>
                      ) : null}
                      {startLocLabel && endLocLabel ? " · " : null}
                      {endLocLabel && s.endLat != null && s.endLng != null ? (
                        <>
                          <span aria-hidden>📍</span>{" "}
                          <MapLink
                            lat={s.endLat}
                            lng={s.endLng}
                            label={endLocLabel}
                            className="underline-offset-2 hover:underline hover:text-zinc-700 dark:hover:text-zinc-300"
                          />
                        </>
                      ) : null}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {ctx.vehicles.length > 1 ? (
        <p className="mt-6 text-center text-xs text-zinc-500">
          Polling {ctx.vehicles.length} vehicles · use the switcher in the header to view another.
        </p>
      ) : null}

      <DangerZone />
    </main>
  );
}
