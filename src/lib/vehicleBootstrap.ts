import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users, vehicles } from "@/db/schema";
import { makeConveClient, type VolvoCreds } from "@/lib/volvo/client";
import type { components as ConveComponents } from "@/lib/volvo/conve.gen";

type VehicleDetails = ConveComponents["schemas"]["VehicleDetails"];

/**
 * Fetch the user's full VIN list via Connected Vehicle, pull `VehicleDetails`
 * for each (model / battery capacity / photo), upsert every row, and set
 * users.active_vin to the first one if it wasn't set yet.
 *
 * Best-effort: individual failures don't abort the whole bootstrap. Returns
 * the list of VINs that were successfully persisted.
 */
export async function bootstrapVehiclesFromConve(opts: {
  userId: string;
  conveCreds: VolvoCreds;
}): Promise<string[]> {
  const conve = makeConveClient(opts.conveCreds);
  const list = await conve.GET("/vehicles");
  const vins = list.data?.data?.map((v) => v.vin).filter((v): v is string => !!v) ?? [];
  if (vins.length === 0) return [];

  const persisted: string[] = [];
  for (const vin of vins) {
    let details: VehicleDetails | undefined;
    try {
      const r = await conve.GET("/vehicles/{vin}", { params: { path: { vin } } });
      details = r.data ?? undefined;
    } catch {
      // Keep VIN-only row.
    }
    await db
      .insert(vehicles)
      .values({
        vin,
        userId: opts.userId,
        model: details?.descriptions?.model ?? null,
        modelYear: details?.modelYear ?? null,
        fuelType: details?.fuelType ?? null,
        externalColour: details?.externalColour ?? null,
        batteryCapacityKwh: details?.batteryCapacityKWH ?? null,
        exteriorImageUrl: details?.images?.exteriorImageUrl ?? null,
      })
      .onConflictDoUpdate({
        target: vehicles.vin,
        set: {
          userId: opts.userId,
          model: details?.descriptions?.model ?? null,
          modelYear: details?.modelYear ?? null,
          fuelType: details?.fuelType ?? null,
          externalColour: details?.externalColour ?? null,
          batteryCapacityKwh: details?.batteryCapacityKWH ?? null,
          exteriorImageUrl: details?.images?.exteriorImageUrl ?? null,
        },
      });
    persisted.push(vin);
  }

  const userRow = (await db.select().from(users).where(eq(users.id, opts.userId)).limit(1))[0];
  if (userRow && !userRow.activeVin) {
    await db.update(users).set({ activeVin: persisted[0] }).where(eq(users.id, opts.userId));
  }

  return persisted;
}

/**
 * Upsert a single vehicle (test-mode path: we only have the VIN the user pasted).
 * Pulls `VehicleDetails` if a Conve token is supplied; otherwise persists VIN-only.
 */
export async function upsertSingleVehicle(opts: {
  userId: string;
  vin: string;
  conveCreds?: VolvoCreds | null;
}): Promise<{ conveError: string | null }> {
  let details: VehicleDetails | undefined;
  let conveError: string | null = null;
  if (opts.conveCreds) {
    const conve = makeConveClient(opts.conveCreds);
    const r = await conve.GET("/vehicles/{vin}", { params: { path: { vin: opts.vin } } });
    if (r.error) conveError = `details fetch failed: HTTP ${r.response.status}`;
    else details = r.data ?? undefined;
  }

  await db
    .insert(vehicles)
    .values({
      vin: opts.vin,
      userId: opts.userId,
      model: details?.descriptions?.model ?? null,
      modelYear: details?.modelYear ?? null,
      fuelType: details?.fuelType ?? null,
      externalColour: details?.externalColour ?? null,
      batteryCapacityKwh: details?.batteryCapacityKWH ?? null,
      exteriorImageUrl: details?.images?.exteriorImageUrl ?? null,
    })
    .onConflictDoUpdate({
      target: vehicles.vin,
      set: {
        userId: opts.userId,
        model: details?.descriptions?.model ?? null,
        modelYear: details?.modelYear ?? null,
        fuelType: details?.fuelType ?? null,
        externalColour: details?.externalColour ?? null,
        batteryCapacityKwh: details?.batteryCapacityKWH ?? null,
        exteriorImageUrl: details?.images?.exteriorImageUrl ?? null,
      },
    });

  // Set as active vehicle if user has none yet.
  const userRow = (await db.select().from(users).where(eq(users.id, opts.userId)).limit(1))[0];
  if (userRow && !userRow.activeVin) {
    await db.update(users).set({ activeVin: opts.vin }).where(eq(users.id, opts.userId));
  }

  return { conveError };
}
