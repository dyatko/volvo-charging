import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users, vehicles } from "@/db/schema";
import { getSession } from "@/lib/session";

/**
 * Disconnect a single vehicle from the account. Cascade drops the rows in
 * vehicles → state_snapshots → charging_sessions for this VIN. The OAuth
 * tokens and credentials stay (they're per-user, not per-vehicle).
 */
export async function DELETE(_req: Request, context: { params: Promise<{ vin: string }> }) {
  const session = await getSession();
  const userId = session.userId;
  if (!userId) {
    return NextResponse.json({ ok: false, reason: "not signed in" }, { status: 401 });
  }
  const { vin } = await context.params;

  const owned = (
    await db
      .select({ vin: vehicles.vin })
      .from(vehicles)
      .where(and(eq(vehicles.userId, userId), eq(vehicles.vin, vin)))
      .limit(1)
  )[0];
  if (!owned) {
    return NextResponse.json({ ok: false, reason: "VIN not linked to this user" }, { status: 404 });
  }

  // If the user is dropping the active vehicle, fall back to whatever's left.
  const remaining = (
    await db
      .select({ vin: vehicles.vin })
      .from(vehicles)
      .where(eq(vehicles.userId, userId))
  ).filter((v) => v.vin !== vin);

  await db.delete(vehicles).where(eq(vehicles.vin, vin));
  await db
    .update(users)
    .set({ activeVin: remaining[0]?.vin ?? null })
    .where(eq(users.id, userId));

  return NextResponse.json({ ok: true, remaining: remaining.length });
}
