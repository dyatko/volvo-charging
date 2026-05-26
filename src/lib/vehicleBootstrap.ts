import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users, vehicles } from "@/db/schema";
import { makeConveClient, type VolvoCreds } from "@/lib/volvo/client";
import { withRetry } from "@/lib/volvo/retry";
import type { components as ConveComponents } from "@/lib/volvo/conve.gen";

type VehicleDetails = ConveComponents["schemas"]["VehicleDetails"];

/**
 * Volvo's spec says GET /vehicles/{vin} returns `VehicleDetails` directly,
 * but the live API wraps it as `{ data: VehicleDetails }` (same shape as
 * GET /vehicles). Unwrap defensively so we still work if Volvo ever
 * corrects the spec.
 */
function unwrapDetails(body: unknown): VehicleDetails | undefined {
  if (!body || typeof body !== "object") return undefined;
  const obj = body as Record<string, unknown>;
  if ("vin" in obj) return obj as VehicleDetails;
  if ("data" in obj && obj.data && typeof obj.data === "object") {
    return obj.data as VehicleDetails;
  }
  return undefined;
}

function detailsToColumns(userId: string, vin: string, d: VehicleDetails | undefined) {
  return {
    vin,
    userId,
    model: d?.descriptions?.model ?? null,
    modelYear: d?.modelYear ?? null,
    fuelType: d?.fuelType ?? null,
    externalColour: d?.externalColour ?? null,
    batteryCapacityKwh: d?.batteryCapacityKWH ?? null,
    gearbox: d?.gearbox ?? null,
    upholstery: d?.descriptions?.upholstery ?? null,
    steering: d?.descriptions?.steering ?? null,
    exteriorImageUrl: d?.images?.exteriorImageUrl ?? null,
    internalImageUrl: d?.images?.internalImageUrl ?? null,
  };
}

async function upsertVehicleRow(userId: string, vin: string, details: VehicleDetails | undefined) {
  const cols = detailsToColumns(userId, vin, details);
  // Don't clobber existing details with nulls when we have nothing fresh.
  const { vin: _v, userId: _u, ...updateCols } = cols;
  void _v;
  void _u;
  await db
    .insert(vehicles)
    .values(cols)
    .onConflictDoUpdate({ target: vehicles.vin, set: { userId, ...updateCols } });
}

async function setActiveIfMissing(userId: string, vin: string) {
  const userRow = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
  if (userRow && !userRow.activeVin) {
    await db.update(users).set({ activeVin: vin }).where(eq(users.id, userId));
  }
}

/**
 * Fetch the user's full VIN list via Connected Vehicle, pull `VehicleDetails`
 * for each, upsert every row, and set users.active_vin to the first one if
 * it wasn't set yet. Best-effort: per-VIN failures don't abort the bootstrap.
 */
export async function bootstrapVehiclesFromConve(opts: {
  userId: string;
  conveCreds: VolvoCreds;
}): Promise<string[]> {
  const conve = makeConveClient(opts.conveCreds);
  const list = await withRetry(() => conve.GET("/vehicles"));
  const vins = list.data?.data?.map((v) => v.vin).filter((v): v is string => !!v) ?? [];
  if (vins.length === 0) return [];

  const persisted: string[] = [];
  for (const vin of vins) {
    let details: VehicleDetails | undefined;
    try {
      const r = await withRetry(() =>
        conve.GET("/vehicles/{vin}", { params: { path: { vin } } }),
      );
      details = unwrapDetails(r.data);
    } catch {
      // Keep VIN-only row.
    }
    await upsertVehicleRow(opts.userId, vin, details);
    persisted.push(vin);
  }

  if (persisted[0]) await setActiveIfMissing(opts.userId, persisted[0]);
  return persisted;
}

/** Upsert a single vehicle. Pulls `VehicleDetails` if a Conve token is supplied. */
export async function upsertSingleVehicle(opts: {
  userId: string;
  vin: string;
  conveCreds?: VolvoCreds | null;
}): Promise<{ conveError: string | null }> {
  let details: VehicleDetails | undefined;
  let conveError: string | null = null;
  if (opts.conveCreds) {
    const conve = makeConveClient(opts.conveCreds);
    const r = await withRetry(() =>
      conve.GET("/vehicles/{vin}", { params: { path: { vin: opts.vin } } }),
    );
    if (r.error) conveError = `details fetch failed: HTTP ${r.response.status}`;
    else details = unwrapDetails(r.data);
  }
  await upsertVehicleRow(opts.userId, opts.vin, details);
  await setActiveIfMissing(opts.userId, opts.vin);
  return { conveError };
}
