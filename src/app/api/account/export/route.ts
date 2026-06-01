import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { chargingSessions, stateSnapshots, users, vehicles } from "@/db/schema";
import { getSession } from "@/lib/session";

/**
 * GDPR Art. 20 portability: stream the user's data as JSON. Sensitive
 * fields (encrypted tokens, credentials) are deliberately excluded.
 */
export async function GET() {
  const session = await getSession();
  const userId = session.userId;
  if (!userId) {
    return NextResponse.json({ ok: false, reason: "not signed in" }, { status: 401 });
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    return NextResponse.json({ ok: false, reason: "user not found" }, { status: 404 });
  }

  const userVehicles = await db.select().from(vehicles).where(eq(vehicles.userId, userId));
  const vins = userVehicles.map((v) => v.vin);

  const sessions = vins.length
    ? await db
        .select()
        .from(chargingSessions)
        .where(eq(chargingSessions.vin, vins[0]))
    : [];
  const snapshots = vins.length
    ? await db
        .select()
        .from(stateSnapshots)
        .where(eq(stateSnapshots.vin, vins[0]))
    : [];

  // For multi-vehicle users, walk the rest. Small enough to do serially.
  for (const vin of vins.slice(1)) {
    sessions.push(
      ...(await db.select().from(chargingSessions).where(eq(chargingSessions.vin, vin))),
    );
    snapshots.push(
      ...(await db.select().from(stateSnapshots).where(eq(stateSnapshots.vin, vin))),
    );
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    user: {
      id: user.id,
      externalId: user.email,
      createdAt: user.createdAt,
      activeVin: user.activeVin,
      lastSeenAt: user.lastSeenAt,
    },
    vehicles: userVehicles,
    chargingSessions: sessions,
    stateSnapshots: snapshots,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="volvo-charging-export-${user.id}.json"`,
    },
  });
}
