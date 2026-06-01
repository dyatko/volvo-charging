// Pure snapshot derivation — the core domain logic that turns one Energy `state`
// response into a `state_snapshots` row, decides whether it's worth persisting,
// and classifies the plug transition. No DB, no IO, so it's unit-testable in
// isolation (see tests/snapshot.test.ts). `pollOne` in src/lib/polling.ts is the
// thin IO shell that wires these together with the database.

import type { EnergyState } from "@/lib/volvo/state";
import { readField } from "@/lib/volvo/state";

/**
 * Normalise Volvo's charging-power readout to kW. The Energy API returns
 * integers tagged with a `unit` field — we've observed "watt" (e.g. 3435 W
 * for ~3.4 kW AC charging). Be defensive: also accept "kilowatt" in case
 * Volvo ever switches the unit on a given car.
 */
export function chargingPowerToKw(value: number, unit: string | undefined): number {
  const u = (unit ?? "").toLowerCase();
  if (u === "w" || u === "watt" || u === "watts") return value / 1000;
  if (u === "kw" || u === "kilowatt" || u === "kilowatts") return value;
  // Heuristic fallback: anything ≥ 1000 is almost certainly watts.
  return value >= 1000 ? value / 1000 : value;
}

/**
 * The most recent of a set of per-field ISO `updatedAt` strings, as a Date.
 * Each Energy property carries its own freshness, so a response is not "now" —
 * we treat the latest changed field's timestamp as the snapshot's `observedAt`.
 * Falls back to the current time when none are present/parseable.
 */
export function latestUpdatedAt(values: (string | null | undefined)[]): Date {
  let max = 0;
  for (const v of values) {
    if (!v) continue;
    const t = Date.parse(v);
    if (!Number.isNaN(t) && t > max) max = t;
  }
  return max ? new Date(max) : new Date();
}

/** The observable columns of a snapshot — everything the dedup compares on. */
export type ObservableFields = {
  soc: number | null;
  rangeKm: number | null;
  connectionStatus: string | null;
  chargingStatus: string | null;
  chargingType: string | null;
  chargerPowerStatus: string | null;
  chargingPowerKw: number | null;
  targetSoc: number | null;
  currentLimitA: number | null;
};

/** A derived snapshot: its observed time plus every observable field. */
export type DerivedSnapshot = ObservableFields & { observedAt: Date };

/**
 * Turn an Energy `state` response into snapshot columns (no `vin`). Every field
 * routes through `readField` so an ERROR/NOT_FOUND property collapses to null
 * rather than throwing. `observedAt` is the latest `updatedAt` across the
 * *observable* fields (target SOC and the current limit are stored but don't
 * count towards freshness — they change rarely and shouldn't mask a real tick).
 */
export function deriveSnapshot(data: EnergyState): DerivedSnapshot {
  const battery = readField(data.batteryChargeLevel);
  const range = readField(data.electricRange);
  const conn = readField(data.chargerConnectionStatus);
  const charging = readField(data.chargingStatus);
  const chargingType = readField(data.chargingType);
  const chargerPower = readField(data.chargerPowerStatus);
  const chargingPower = readField(data.chargingPower);
  const targetSoc = readField(data.targetBatteryChargeLevel);
  const currentLimit = readField(data.chargingCurrentLimit);

  const observedAt = latestUpdatedAt([
    battery.ok ? battery.updatedAt : null,
    range.ok ? range.updatedAt : null,
    conn.ok ? conn.updatedAt : null,
    charging.ok ? charging.updatedAt : null,
    chargingType.ok ? chargingType.updatedAt : null,
    chargerPower.ok ? chargerPower.updatedAt : null,
    chargingPower.ok ? chargingPower.updatedAt : null,
  ]);

  return {
    observedAt,
    soc: battery.ok ? Math.round(Number(battery.value)) : null,
    rangeKm: range.ok ? Math.round(Number(range.value)) : null,
    connectionStatus: conn.ok ? String(conn.value) : null,
    chargingStatus: charging.ok ? String(charging.value) : null,
    chargingType: chargingType.ok ? String(chargingType.value) : null,
    chargerPowerStatus: chargerPower.ok ? String(chargerPower.value) : null,
    chargingPowerKw: chargingPower.ok
      ? chargingPowerToKw(Number(chargingPower.value), chargingPower.unit)
      : null,
    targetSoc: targetSoc.ok ? Math.round(Number(targetSoc.value)) : null,
    currentLimitA: currentLimit.ok ? Math.round(Number(currentLimit.value)) : null,
  };
}

/**
 * True when two snapshots carry identical observable values. Drives the dedup:
 * a new `state_snapshots` row (and the Location call that rides with it) is only
 * written when at least one observable field actually changed.
 */
export function snapshotObservablyEqual(a: ObservableFields, b: ObservableFields): boolean {
  return (
    a.soc === b.soc &&
    a.rangeKm === b.rangeKm &&
    a.connectionStatus === b.connectionStatus &&
    a.chargingStatus === b.chargingStatus &&
    a.chargingType === b.chargingType &&
    a.chargerPowerStatus === b.chargerPowerStatus &&
    a.chargingPowerKw === b.chargingPowerKw &&
    a.targetSoc === b.targetSoc &&
    a.currentLimitA === b.currentLimitA
  );
}

/**
 * Classify a plug transition from the previous/next connection state. A session
 * is the *plug interval*: it opens on DISCONNECTED → CONNECTED* and closes on
 * CONNECTED* → DISCONNECTED. chargingStatus (IDLE/CHARGING/DONE) deliberately
 * does NOT trigger a transition — a charge that pauses or hits target SOC stays
 * one session for the whole plug interval. The two "still-*" cases are no
 * transition; "still-connected" is where peak power is kept up to date.
 */
export function classifyConnectionTransition(
  wasConnected: boolean,
  isConnected: boolean,
): "opened" | "closed" | "still-connected" | "still-disconnected" {
  if (!wasConnected && isConnected) return "opened";
  if (wasConnected && !isConnected) return "closed";
  return wasConnected ? "still-connected" : "still-disconnected";
}
