import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { chargingSessions } from "@/db/schema";
import { getSession } from "@/lib/session";
import { loadUserContext } from "@/lib/userVehicle";

export const dynamic = "force-dynamic";

function fmtDuration(startedAt: Date, endedAt: Date | null): string {
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

export default async function SessionsPage() {
  const session = await getSession();
  if (!session.userId) redirect("/");
  const ctx = await loadUserContext(session.userId);
  if (!ctx || !ctx.activeVehicle) redirect("/");

  const active = ctx.activeVehicle;
  const rows = await db
    .select()
    .from(chargingSessions)
    .where(eq(chargingSessions.vin, active.vin))
    .orderBy(desc(chargingSessions.startedAt))
    .limit(100);

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-6">
      <h1 className="text-xl font-semibold tracking-tight">Charging sessions</h1>
      <p className="mt-1 break-all font-mono text-xs text-zinc-500">{active.vin}</p>
      <p className="mt-1 text-xs text-zinc-500">
        Derived from <code>state_snapshots</code>. New sessions appear automatically when the
        car transitions between connected/disconnected.
      </p>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No sessions yet. Plug the car in (or hit{" "}
          <span className="font-medium">Refresh</span> from the dashboard while it's plugged in)
          and one will appear here.
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.map((s) => {
            const startLoc = fmtCoord(s.startLat, s.startLng);
            const endLoc = fmtCoord(s.endLat, s.endLng);
            return (
              <li
                key={s.id}
                className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-baseline justify-between">
                  <div>
                    <p className="font-medium">
                      {new Date(s.startedAt).toLocaleString()}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {fmtDuration(new Date(s.startedAt), s.endedAt ? new Date(s.endedAt) : null)}{" "}
                      · {s.connectionType ?? "?"}
                      {s.isOpen ? " · in progress" : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono tabular-nums">
                      {s.startSoc}% → {s.endSoc ?? "…"}%
                    </p>
                    {s.energyKwh != null ? (
                      <p className="text-xs text-zinc-500">
                        +{s.energyKwh.toFixed(2)} kWh
                      </p>
                    ) : null}
                    {s.peakPowerKw != null ? (
                      <p className="text-xs text-zinc-500">peak {s.peakPowerKw.toFixed(1)} kW</p>
                    ) : null}
                  </div>
                </div>
                {(startLoc || endLoc) ? (
                  <p className="mt-2 text-xs text-zinc-500">
                    {startLoc ? <>start {startLoc}</> : null}
                    {startLoc && endLoc ? " · " : null}
                    {endLoc ? <>end {endLoc}</> : null}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
