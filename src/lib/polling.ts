import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { chargingSessions, stateSnapshots, vehicles } from "@/db/schema";
import { makeEnergyClient, makeLocationClient, pointToLatLng, type VolvoCreds } from "@/lib/volvo/client";
import { withRetry } from "@/lib/volvo/retry";
import {
  classifyConnectionTransition,
  deriveSnapshot,
  snapshotObservablyEqual,
} from "@/lib/snapshot";
import { energyKwhFromSoc } from "@/lib/sessions";
import { reverseGeocode } from "@/lib/geocoding/service";
import { log, errText } from "@/lib/log";
import {
  decidePollInterval,
  isConnected,
  metersBetween,
  MOVEMENT_THRESHOLD_M,
} from "@/lib/pollCadence";
import type { UserContext } from "@/lib/userVehicle";

type SnapshotRow = typeof stateSnapshots.$inferInsert;

export type PollOutcome =
  | {
      ok: true;
      snapshotInserted: boolean;
      observedAt: Date;
      transition?: "opened" | "closed" | "none";
      /** Set when the cadence gate skipped the poll (no API call made). */
      skipped?: boolean;
    }
  | { ok: false; reason: string; status?: number };

/** Poll one vehicle, dedup-write a state_snapshots row, derive session transitions. */
export async function pollOne(opts: {
  vin: string;
  energyCreds: VolvoCreds;
  /** Optional — when absent we skip location capture at session boundaries. */
  locationCreds?: VolvoCreds | null;
  batteryCapacityKwh: number | null;
  /** Previously stored position, for movement detection (Location delta). */
  prevLat?: number | null;
  prevLng?: number | null;
  /** When the owner was last seen — feeds the user-active cadence rule. */
  userLastSeenAt?: Date | null;
}): Promise<PollOutcome> {
  const energy = makeEnergyClient(opts.energyCreds);
  const { data, error, response } = await withRetry(() =>
    energy.GET("/vehicles/{vin}/state", { params: { path: { vin: opts.vin } } }),
  );
  if (error || !data) {
    // Back off lightly: retry at ~1 min rather than hammering a failing
    // vehicle on every tick, and keep a visible failure count + reason.
    const status = response?.status;
    const reason = errText(error ?? "unknown");
    const lastError = (status ? `HTTP ${status}: ${reason}` : reason).slice(0, 500);
    await db
      .update(vehicles)
      .set({
        lastPolledAt: new Date(),
        nextPollAt: new Date(Date.now() + 60_000),
        consecutiveFailures: sql`${vehicles.consecutiveFailures} + 1`,
        lastError,
      })
      .where(eq(vehicles.vin, opts.vin));
    log.warn("poll failed", { vin: opts.vin, status, reason });
    return { ok: false, reason, status };
  }

  const derived = deriveSnapshot(data);
  const observedAt = derived.observedAt;
  const next: SnapshotRow = { vin: opts.vin, ...derived };

  // Dedup: skip if no observable field changed since the previous snapshot.
  const prev = (
    await db
      .select()
      .from(stateSnapshots)
      .where(eq(stateSnapshots.vin, opts.vin))
      .orderBy(desc(stateSnapshots.observedAt))
      .limit(1)
  )[0];

  const observableEqual = prev && snapshotObservablyEqual(prev, derived);

  const now = Date.now();

  // Refresh the car's live position. We fetch Location on any observable change
  // (so a charging tick / session boundary still captures a fresh fix, as before)
  // AND on every poll while the cable is OUT. A driving car's position changes
  // without any Energy field changing — Volvo's Energy API tends to go quiet in
  // motion — so coupling Location to Energy changes freezes the map mid-trip
  // (start location sticks for the whole drive). A plugged-in car is parked at
  // its charger, so we keep the cheap fetch-on-change path there. This widens
  // Location usage for unplugged cars; see the "Rate budget" note in AGENTS.md.
  const disconnected = !isConnected(next.connectionStatus);
  const wantLocation = !!opts.locationCreds && (!observableEqual || disconnected);

  let liveLocation: { lat: number; lng: number } | null = null;
  if (wantLocation && opts.locationCreds) {
    liveLocation = await fetchLocation(opts.vin, opts.locationCreds);
    if (liveLocation) {
      await db
        .update(vehicles)
        .set({
          currentLat: liveLocation.lat,
          currentLng: liveLocation.lng,
          locationUpdatedAt: new Date(now),
        })
        .where(eq(vehicles.vin, opts.vin));
      // Warm the geocode cache for this position. One call per poll covers the
      // session start/end coords too (they equal liveLocation and the cache is
      // position-keyed). Best-effort: a geocode failure must never affect the poll.
      await reverseGeocode(liveLocation.lat, liveLocation.lng).catch(() => null);
    }
  }

  // Movement: did the car's position move beyond the threshold since the last
  // stored fix? This tells a driving car apart from one whose SOC/range merely
  // drifted while parked, and keeps a moving car on the 1-min cadence even when
  // no Energy field changed. Only meaningful when we fetched a fresh Location.
  const moved =
    !!liveLocation &&
    opts.prevLat != null &&
    opts.prevLng != null &&
    metersBetween(opts.prevLat, opts.prevLng, liveLocation.lat, liveLocation.lng) >
      MOVEMENT_THRESHOLD_M;

  if (observableEqual) {
    // No observable Energy change: no snapshot, no session work. But the car may
    // still be driving, so we keep last_seen fresh and feed `moved` into the
    // cadence — a moving car stays at 1 min, a parked-unplugged one relaxes to
    // idle. Its live position was already refreshed above when disconnected.
    const interval = decidePollInterval(
      {
        connectionStatus: next.connectionStatus ?? null,
        chargingStatus: next.chargingStatus ?? null,
        lastChangeAt: prev?.observedAt ?? observedAt,
        moved,
        userLastSeenAt: opts.userLastSeenAt ?? null,
      },
      now,
    );
    await db
      .update(vehicles)
      .set({
        lastSeenAt: new Date(now),
        lastPolledAt: new Date(now),
        nextPollAt: new Date(now + interval),
        consecutiveFailures: 0,
        lastError: null,
      })
      .where(eq(vehicles.vin, opts.vin));
    return { ok: true, snapshotInserted: false, observedAt, transition: "none" };
  }

  // Insert (idempotent on (vin, observed_at) unique index).
  await db.insert(stateSnapshots).values(next).onConflictDoNothing();

  // Derive session transitions.
  //
  // A "charging session" here is the *plug interval*: it opens when the cable
  // goes in (DISCONNECTED → CONNECTED*) and closes when it comes out
  // (CONNECTED* → DISCONNECTED). chargingStatus (IDLE / CHARGING / DONE) is
  // intentionally NOT a transition trigger — a session that pauses (load
  // balancing, scheduled charging, hitting target SOC and resuming after
  // someone unlocks the door) stays a single session for the whole plug
  // interval, which is what humans usually mean when they say "this charge."
  const wasConnected = isConnected(prev?.connectionStatus ?? null);
  const isConn = isConnected(next.connectionStatus);
  const transitionKind = classifyConnectionTransition(wasConnected, isConn);

  let transition: "opened" | "closed" | "none" = "none";

  if (transitionKind === "opened") {
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
  } else if (transitionKind === "closed") {
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
      const energyKwh = energyKwhFromSoc(open.startSoc, endSoc, opts.batteryCapacityKwh);
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
  } else if (transitionKind === "still-connected" && next.chargingPowerKw != null) {
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

  // Something just changed, so lastChangeAt is now. `moved` was computed above
  // (right after the Location fetch) and is reused here.
  const interval = decidePollInterval(
    {
      connectionStatus: next.connectionStatus ?? null,
      chargingStatus: next.chargingStatus ?? null,
      lastChangeAt: observedAt,
      moved,
      userLastSeenAt: opts.userLastSeenAt ?? null,
    },
    now,
  );
  await db
    .update(vehicles)
    .set({
      lastSeenAt: new Date(now),
      lastPolledAt: new Date(now),
      nextPollAt: new Date(now + interval),
      consecutiveFailures: 0,
      lastError: null,
    })
    .where(eq(vehicles.vin, opts.vin));

  return { ok: true, snapshotInserted: true, observedAt, transition };
}

async function fetchLocation(vin: string, creds: VolvoCreds) {
  try {
    const client = makeLocationClient(creds);
    const { data } = await withRetry(() =>
      client.GET("/v1/vehicles/{vin}/location", { params: { path: { vin } } }),
    );
    return pointToLatLng(data?.data?.geometry?.coordinates);
  } catch {
    return null;
  }
}

/** Most recent state_snapshots row for a VIN (the dashboard's "latest" read). */
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

/**
 * Poll every vehicle linked to the user, in parallel. Returns per-vehicle
 * outcomes. Skips polling if no usable Energy creds — caller decides whether
 * to surface that to the UI.
 *
 * `opts.onlyDue` applies the adaptive cadence gate: a vehicle whose
 * `nextPollAt` is still in the future is skipped (no API call). The scheduler
 * tick passes this; the dashboard's user-initiated refresh does not (it always
 * forces a fresh read).
 */
export async function pollAllVehicles(
  ctx: UserContext,
  opts: { onlyDue?: boolean } = {},
): Promise<Array<{ vin: string; outcome: PollOutcome }>> {
  const energyCreds = ctx.credsFor("energy");
  if (!energyCreds) {
    const reason = "no usable Energy API token";
    log.warn("poll skipped: no usable Energy API token", {
      userId: ctx.userId,
      vehicles: ctx.vehicles.length,
    });
    // Record the stall on every vehicle. Without this the failure is invisible:
    // the tick never reaches pollOne, so last_error/last_polled_at would stay
    // stale and the dashboard's health banner couldn't tell why data stopped —
    // including the common case where a fresh login refreshes creds (so they
    // look fine at view time) while the background poller has been dead.
    await Promise.all(
      ctx.vehicles.map((v) =>
        db
          .update(vehicles)
          .set({
            lastPolledAt: new Date(),
            lastError: reason,
            consecutiveFailures: sql`${vehicles.consecutiveFailures} + 1`,
            nextPollAt: new Date(Date.now() + 60_000),
          })
          .where(eq(vehicles.vin, v.vin)),
      ),
    ).catch((e) => log.error("failed to record poll stall", { userId: ctx.userId, reason: errText(e) }));
    return ctx.vehicles.map((v) => ({
      vin: v.vin,
      outcome: { ok: false, reason },
    }));
  }
  const locationCreds = ctx.credsFor("location");
  const now = Date.now();
  return Promise.all(
    ctx.vehicles.map(async (v) => {
      if (opts.onlyDue && v.nextPollAt.getTime() > now) {
        return {
          vin: v.vin,
          outcome: { ok: true, snapshotInserted: false, observedAt: v.nextPollAt, skipped: true } as PollOutcome,
        };
      }
      return {
        vin: v.vin,
        outcome: await pollOne({
          vin: v.vin,
          energyCreds,
          locationCreds,
          batteryCapacityKwh: v.batteryCapacityKwh,
          prevLat: v.currentLat,
          prevLng: v.currentLng,
          userLastSeenAt: ctx.userLastSeenAt,
        }).catch((e) => ({ ok: false, reason: e instanceof Error ? e.message : String(e) } as PollOutcome)),
      };
    }),
  );
}
