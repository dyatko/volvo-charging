import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { loadUserContext } from "@/lib/userVehicle";
import { pollAllVehicles } from "@/lib/polling";
import { verifyInternalCaller } from "@/lib/internalAuth";
import { log } from "@/lib/log";

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
  let failed = 0;
  let snapshotsInserted = 0;
  let usersSkipped = 0;
  for (const u of allUsers) {
    const ctx = await loadUserContext(u.id);
    // loadUserContext already logs *why* it returned null (refresh failed /
    // missing grant); count it here so the tick summary shows users we couldn't
    // poll at all this round.
    if (!ctx) {
      usersSkipped += 1;
      continue;
    }
    if (ctx.vehicles.length === 0) continue;
    // Adaptive cadence: only poll vehicles whose next_poll_at is due.
    const results = await pollAllVehicles(ctx, { onlyDue: true });
    for (const r of results) {
      if (r.outcome.ok && r.outcome.skipped) skipped += 1;
      else if (r.outcome.ok) polled += 1;
      else failed += 1;
      if (r.outcome.ok && r.outcome.snapshotInserted) snapshotsInserted += 1;
    }
  }
  const summary = {
    users: allUsers.length,
    usersSkipped,
    polled,
    skipped,
    failed,
    snapshotsInserted,
  };
  // One queryable line per tick. Bump to a warning when something actually
  // failed so a stalled poller shows up under severity>=WARNING in Cloud Logging.
  if (failed > 0 || usersSkipped > 0) log.warn("tick complete with failures", summary);
  else log.info("tick complete", summary);
  return NextResponse.json({ ok: true, ...summary });
}
