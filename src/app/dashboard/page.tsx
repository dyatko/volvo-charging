import { redirect } from "next/navigation";
import Image from "next/image";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { chargingSessions, stateSnapshots } from "@/db/schema";
import { getSession } from "@/lib/session";
import { loadUserVehicleAndCreds } from "@/lib/userVehicle";
import { pollOne } from "@/lib/polling";
import { RefreshButton } from "@/components/refresh-button";

export const dynamic = "force-dynamic";

const CONNECTED = new Set(["CONNECTED", "CONNECTED_AC", "CONNECTED_DC"]);
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

function fmtRelative(d: Date | string | null): string | null {
  if (!d) return null;
  const t = typeof d === "string" ? Date.parse(d) : d.getTime();
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function Pill({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
      {label}
    </span>
  );
}

function SocRing({ soc, target }: { soc: number | null; target: number | null }) {
  const value = soc ?? 0;
  const radius = 60;
  const circ = 2 * Math.PI * radius;
  return (
    <div className="relative h-40 w-40">
      <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
        <circle cx="80" cy="80" r={radius} stroke="currentColor" strokeOpacity="0.1" strokeWidth="14" fill="none" />
        <circle
          cx="80"
          cy="80"
          r={radius}
          stroke="currentColor"
          strokeWidth="14"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${(circ * value) / 100} ${circ}`}
          className="text-emerald-500"
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
        {target ? (
          <div className="text-xs text-zinc-500">target {target}%</div>
        ) : null}
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session.userId) redirect("/");
  const loaded = await loadUserVehicleAndCreds(session.userId);
  if (!loaded) redirect("/");

  // Best-effort: refresh state on page load so the first dashboard visit shows live data.
  await pollOne({
    vin: loaded.user.vin,
    creds: loaded.creds,
    batteryCapacityKwh: loaded.user.batteryCapacityKwh,
  }).catch(() => undefined);

  const latest = (
    await db
      .select()
      .from(stateSnapshots)
      .where(eq(stateSnapshots.vin, loaded.user.vin))
      .orderBy(desc(stateSnapshots.observedAt))
      .limit(1)
  )[0];

  const openSession = (
    await db
      .select()
      .from(chargingSessions)
      .where(and(eq(chargingSessions.vin, loaded.user.vin), eq(chargingSessions.isOpen, true)))
      .limit(1)
  )[0];

  const isConnected = latest?.connectionStatus
    ? CONNECTED.has(latest.connectionStatus)
    : false;

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-6">
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {loaded.user.model ?? "Your Volvo"}
            {loaded.user.modelYear ? (
              <span className="ml-1 text-zinc-500">·{loaded.user.modelYear}</span>
            ) : null}
          </h1>
          <p className="text-xs text-zinc-500">
            VIN ••• {loaded.user.vin.slice(-4)}
            {loaded.user.externalColour ? ` · ${loaded.user.externalColour}` : null}
          </p>
        </div>
        {loaded.user.exteriorImageUrl ? (
          <Image
            src={loaded.user.exteriorImageUrl}
            alt="Vehicle"
            width={80}
            height={48}
            className="h-12 w-20 rounded object-cover"
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
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            ~{latest.rangeKm} km range
          </p>
        ) : null}
        {latest?.chargingPowerKw != null ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Charging at {latest.chargingPowerKw.toFixed(1)} kW
          </p>
        ) : null}
        <p className="text-xs text-zinc-500">
          Updated {fmtRelative(latest?.observedAt ?? null) ?? "—"}
        </p>
      </section>

      <section className="mt-5 flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div>
          <p className="text-sm font-medium">
            {openSession ? "Session in progress" : isConnected ? "Connected" : "No active session"}
          </p>
          {openSession ? (
            <p className="text-xs text-zinc-500">
              Started {fmtRelative(openSession.startedAt)} · {openSession.startSoc}% → {latest?.soc ?? "?"}%
            </p>
          ) : (
            <p className="text-xs text-zinc-500">Last poll {fmtRelative(latest?.observedAt ?? null) ?? "never"}</p>
          )}
        </div>
        <RefreshButton />
      </section>

      <p className="mt-6 text-center text-xs text-zinc-500">
        Polls Energy API on every Refresh. Sessions are derived from observed plug/unplug
        transitions in <code>state_snapshots</code>.
      </p>
    </main>
  );
}
