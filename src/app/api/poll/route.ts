import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { loadUserVehicleAndCreds } from "@/lib/userVehicle";
import { pollOne } from "@/lib/polling";

export async function POST() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ ok: false, reason: "not signed in" }, { status: 401 });
  }
  const loaded = await loadUserVehicleAndCreds(session.userId);
  if (!loaded) {
    return NextResponse.json(
      { ok: false, reason: "user has no vehicle linked" },
      { status: 404 },
    );
  }
  const outcome = await pollOne({
    vin: loaded.user.vin,
    creds: loaded.creds,
    batteryCapacityKwh: loaded.user.batteryCapacityKwh,
  });
  return NextResponse.json(outcome);
}
