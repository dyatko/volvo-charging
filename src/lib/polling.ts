import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { chargingSessions, stateSnapshots, vehicles } from "@/db/schema";
import { makeEnergyClient, makeLocationClient, pointToLatLng, type VolvoCreds } from "@/lib/volvo/client";
import { readField } from "@/lib/volvo/state";
import type { UserContext } from "@/lib/userVehicle";

type SnapshotRow = typeof stateSnapshots.$inferInsert;

const CONNECTED_STATES = new Set(["CONNECTED", "CONNECTED_AC", "CONNECTED_DC"]);

function isConnected(s: string | null | undefined): boolean {
  return !!s && CONNECTED_STATES.has(s);
}

function maxIsoDate(values: (string | null | undefined)[]): Date {
  let max = 0;
  for (const v of values) {
    if (!v) continue;
    const t = Date.parse(v);
    if (!Number.isNaN(t) && t > max) max = t;
  }
  return max ? new Date(max) : new Date();
}

export type PollOutcome =
  | {
      ok: true;
      snapshotInserted: boolean;
      observedAt: Date;
      transition?: "opened" | "closed" | "none";
    }
  | { ok: false; reason: string; status?: number };

/** Poll one vehicle, dedup-write a state_snapshots row, derive session transitions. */
export async function pollOne(opts: {
  vin: string;
  energyCreds: VolvoCreds;
  /** Optional — when absent we skip location capture at session boundaries. */
  locationCreds?: VolvoCreds | null;
  batteryCapacityKwh: number | null;
}): Promise<PollOutcome> {
  const energy = makeEnergyClient(opts.energyCreds);
  const { data, error, response } = await energy.GET("/vehicles/{vin}/state", {
    params: { path: { vin: opts.vin } },
  });
  if (error || !data) {
    return { ok: false, reason: JSON.stringify(error ?? "unknown"), status: response?.status };
  }

  const battery = readField(data.batteryChargeLevel);
  const range = readField(data.electricRange);
  const conn = readField(data.chargerConnectionStatus);
  const charging = readField(data.chargingStatus);
  const chargingType = readField(data.chargingType);
  const chargerPower = readField(data.chargerPowerStatus);
  const chargingPower = readField(data.chargingPower);
  const targetSoc = readField(data.targetBatteryChargeLevel);
  const currentLimit = readField(data.chargingCurrentLimit);

  const observedAt = maxIsoDate([
    battery.ok ? battery.updatedAt : null,
    range.ok ? range.updatedAt : null,
    conn.ok ? conn.updatedAt : null,
    charging.ok ? charging.updatedAt : null,
    chargingType.ok ? chargingType.updatedAt : null,
    chargerPower.ok ? chargerPower.updatedAt : null,
    chargingPower.ok ? chargingPower.updatedAt : null,
  ]);

  const next: SnapshotRow = {
    vin: opts.vin,
    observedAt,
    soc: battery.ok ? Math.round(Number(battery.value)) : null,
    rangeKm: range.ok ? Math.round(Number(range.value)) : null,
    connectionStatus: conn.ok ? String(conn.value) : null,
    chargingStatus: charging.ok ? String(charging.value) : null,
    chargingType: chargingType.ok ? String(chargingType.value) : null,
    chargerPowerStatus: chargerPower.ok ? String(chargerPower.value) : null,
    chargingPowerKw: chargingPower.ok ? Number(chargingPower.value) : null,
    targetSoc: targetSoc.ok ? Math.round(Number(targetSoc.value)) : null,
    currentLimitA: currentLimit.ok ? Math.round(Number(currentLimit.value)) : null,
  };

  // Dedup: skip if no observable field changed since the previous snapshot.
  const prev = (
    await db
      .select()
      .from(stateSnapshots)
      .where(eq(stateSnapshots.vin, opts.vin))
      .orderBy(desc(stateSnapshots.observedAt))
      .limit(1)
  )[0];

  const observableEqual =
    prev &&
    prev.soc === next.soc &&
    prev.rangeKm === next.rangeKm &&
    prev.connectionStatus === next.connectionStatus &&
    prev.chargingStatus === next.chargingStatus &&
    prev.chargingType === next.chargingType &&
    prev.chargerPowerStatus === next.chargerPowerStatus &&
    prev.chargingPowerKw === next.chargingPowerKw &&
    prev.targetSoc === next.targetSoc &&
    prev.currentLimitA === next.currentLimitA;

  // Refresh "current location" every poll when we have a Location token —
  // this is what the dashboard reads to show where the car is right now.
  // Charging-session boundaries also use Location calls separately below; in
  // practice those resolve to the same value within the same poll so the
  // extra call is only here on every-poll cadence.
  let liveLocation: { lat: number; lng: number } | null = null;
  if (opts.locationCreds) {
    liveLocation = await fetchLocation(opts.vin, opts.locationCreds);
  }

  // Always bump vehicle.last_seen + next_poll regardless of dedup.
  await db
    .update(vehicles)
    .set({
      lastSeenAt: new Date(),
      nextPollAt: new Date(Date.now() + 60_000),
      consecutiveFailures: 0,
      ...(liveLocation
        ? {
            currentLat: liveLocation.lat,
            currentLng: liveLocation.lng,
            locationUpdatedAt: new Date(),
          }
        : {}),
    })
    .where(eq(vehicles.vin, opts.vin));

  if (observableEqual) {
    return { ok: true, snapshotInserted: false, observedAt, transition: "none" };
  }

  // Insert (idempotent on (vin, observed_at) unique index).
  await db.insert(stateSnapshots).values(next).onConflictDoNothing();

  // Derive session transitions.
  const wasConnected = isConnected(prev?.connectionStatus ?? null);
  const isConn = isConnected(next.connectionStatus);

  let transition: "opened" | "closed" | "none" = "none";

  if (!wasConnected && isConn) {
    // DISCONNECTED → CONNECTED*: open a session, reuse the live location.
    await db.insert(chargingSessions).values({
      vin: opts.vin,
      startedAt: observedAt,
      startSoc: next.soc ?? 0,
      connectionType: next.chargingType,
      startLat: liveLocation?.lat ?? null,
      startLng: liveLocation?.lng ?? null,
      isOpen: true,
    });
    transition = "opened";
  } else if (wasConnected && !isConn) {
    // CONNECTED* → DISCONNECTED: close the open session, reuse the live location.
    const open = (
      await db
        .select()
        .from(chargingSessions)
        .where(and(eq(chargingSessions.vin, opts.vin), eq(chargingSessions.isOpen, true)))
        .limit(1)
    )[0];
    if (open) {
      const location = liveLocation;
      const endSoc = next.soc ?? open.startSoc;
      const energyKwh =
        opts.batteryCapacityKwh != null
          ? Math.max(0, (endSoc - open.startSoc) / 100) * opts.batteryCapacityKwh
          : null;
      await db
        .update(chargingSessions)
        .set({
          endedAt: observedAt,
          endSoc,
          energyKwh,
          endLat: location?.lat ?? null,
          endLng: location?.lng ?? null,
          isOpen: false,
        })
        .where(eq(chargingSessions.id, open.id));
      transition = "closed";
    }
  } else if (wasConnected && isConn && next.chargingPowerKw != null) {
    // While charging, keep peak power up to date on the open session.
    const open = (
      await db
        .select()
        .from(chargingSessions)
        .where(and(eq(chargingSessions.vin, opts.vin), eq(chargingSessions.isOpen, true)))
        .limit(1)
    )[0];
    if (open) {
      const peak = Math.max(open.peakPowerKw ?? 0, next.chargingPowerKw);
      if (peak !== open.peakPowerKw) {
        await db
          .update(chargingSessions)
          .set({ peakPowerKw: peak })
          .where(eq(chargingSessions.id, open.id));
      }
    }
  }

  return { ok: true, snapshotInserted: true, observedAt, transition };
}

async function fetchLocation(vin: string, creds: VolvoCreds) {
  try {
    const client = makeLocationClient(creds);
    const { data } = await client.GET("/v1/vehicles/{vin}/location", {
      params: { path: { vin } },
    });
    return pointToLatLng(data?.data?.geometry?.coordinates);
  } catch {
    return null;
  }
}

/** Older snapshot read helper used by the dashboard. */
export async function latestSnapshot(vin: string) {
  return (
    await db
      .select()
      .from(stateSnapshots)
      .where(eq(stateSnapshots.vin, vin))
      .orderBy(desc(stateSnapshots.observedAt))
      .limit(1)
  )[0];
}

// Marker exported for clarity in places that filter "currently charging" sessions.
export const openSessionFilter = isNull(chargingSessions.endedAt);

/**
 * Poll every vehicle linked to the user, in parallel. Returns per-vehicle
 * outcomes. Skips polling if no usable Energy creds — caller decides whether
 * to surface that to the UI.
 */
export async function pollAllVehicles(ctx: UserContext): Promise<
  Array<{ vin: string; outcome: PollOutcome }>
> {
  const energyCreds = ctx.credsFor("energy");
  if (!energyCreds) {
    return ctx.vehicles.map((v) => ({
      vin: v.vin,
      outcome: { ok: false, reason: "no usable Energy API token" },
    }));
  }
  const locationCreds = ctx.credsFor("location");
  return Promise.all(
    ctx.vehicles.map(async (v) => ({
      vin: v.vin,
      outcome: await pollOne({
        vin: v.vin,
        energyCreds,
        locationCreds,
        batteryCapacityKwh: v.batteryCapacityKwh,
      }).catch((e) => ({ ok: false, reason: e instanceof Error ? e.message : String(e) } as PollOutcome)),
    })),
  );
}
