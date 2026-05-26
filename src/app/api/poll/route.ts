import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { loadUserContext } from "@/lib/userVehicle";
import { pollAllVehicles } from "@/lib/polling";

export async function POST() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ ok: false, reason: "not signed in" }, { status: 401 });
  }
  const ctx = await loadUserContext(session.userId);
  if (!ctx) {
    return NextResponse.json({ ok: false, reason: "no user context" }, { status: 404 });
  }
  if (ctx.vehicles.length === 0) {
    return NextResponse.json({ ok: false, reason: "no vehicles linked" }, { status: 404 });
  }
  const results = await pollAllVehicles(ctx);
  return NextResponse.json({ ok: true, results });
}
