import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { setActiveVehicle } from "@/lib/userVehicle";

const Body = z.object({ vin: z.string().min(11).max(20) });

export async function POST(req: Request) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ ok: false, reason: "not signed in" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, reason: "invalid body" }, { status: 400 });
  }
  const ok = await setActiveVehicle(session.userId, parsed.data.vin);
  if (!ok) {
    return NextResponse.json({ ok: false, reason: "VIN not linked to this user" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
