import { NextResponse } from "next/server";

// Plain liveness check for Cloud Run / uptime monitoring.
// Does not touch the database — a working request handler is sufficient.
export async function GET() {
  return NextResponse.json({ ok: true });
}
