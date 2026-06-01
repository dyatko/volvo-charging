import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { loadUserContext } from "@/lib/userVehicle";
import { pollAllVehicles } from "@/lib/polling";
import { verifyInternalCaller } from "@/lib/internalAuth";

// Hit every minute by Cloud Scheduler (`tick-1min` job in europe-north1).
// Iterates every user, refreshes tokens if needed, polls every vehicle.
// At low scale this fits comfortably in one Cloud Run request; revisit
// with Cloud Tasks fan-out if total time approaches the 300s timeout.
export async function POST(req: Request) {
  const auth = await verifyInternalCaller(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, reason: auth.reason }, { status: 401 });
  }

  const allUsers = await db.select({ id: users.id }).from(users);
  let polled = 0;
  let skipped = 0;
  let snapshotsInserted = 0;
  for (const u of allUsers) {
    const ctx = await loadUserContext(u.id);
    if (!ctx || ctx.vehicles.length === 0) continue;
    // Adaptive cadence: only poll vehicles whose next_poll_at is due.
    const results = await pollAllVehicles(ctx, { onlyDue: true });
    for (const r of results) {
      if (r.outcome.ok && r.outcome.skipped) skipped += 1;
      else polled += 1;
      if (r.outcome.ok && r.outcome.snapshotInserted) snapshotsInserted += 1;
    }
  }
  return NextResponse.json({
    ok: true,
    users: allUsers.length,
    polled,
    skipped,
    snapshotsInserted,
  });
}
