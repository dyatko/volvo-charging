import { describe, expect, it } from "vitest";
import type { EnergyState } from "@/lib/volvo/state";
import {
  chargingPowerToKw,
  classifyConnectionTransition,
  deriveSnapshot,
  latestUpdatedAt,
  snapshotObservablyEqual,
  type ObservableFields,
} from "@/lib/snapshot";

describe("chargingPowerToKw", () => {
  it("converts explicit watt units to kW", () => {
    expect(chargingPowerToKw(3435, "watt")).toBeCloseTo(3.435, 5);
    expect(chargingPowerToKw(11000, "W")).toBe(11);
    expect(chargingPowerToKw(11000, "watts")).toBe(11);
  });

  it("passes kilowatt units through unchanged", () => {
    expect(chargingPowerToKw(11, "kilowatt")).toBe(11);
    expect(chargingPowerToKw(7.4, "kW")).toBe(7.4);
  });

  it("falls back to a magnitude heuristic when the unit is missing", () => {
    expect(chargingPowerToKw(3435, undefined)).toBeCloseTo(3.435, 5); // ≥1000 → watts
    expect(chargingPowerToKw(11, undefined)).toBe(11); // <1000 → already kW
  });
});

describe("latestUpdatedAt", () => {
  it("returns the most recent parseable timestamp", () => {
    const got = latestUpdatedAt([
      "2026-01-01T10:00:00Z",
      "2026-01-01T12:30:00Z",
      "2026-01-01T09:00:00Z",
    ]);
    expect(got.toISOString()).toBe("2026-01-01T12:30:00.000Z");
  });

  it("ignores null/undefined/unparseable values", () => {
    const got = latestUpdatedAt([null, undefined, "not-a-date", "2026-03-04T05:06:07Z"]);
    expect(got.toISOString()).toBe("2026-03-04T05:06:07.000Z");
  });

  it("falls back to ~now when there is nothing usable", () => {
    const before = Date.now();
    const got = latestUpdatedAt([null, undefined]).getTime();
    expect(got).toBeGreaterThanOrEqual(before);
    expect(got).toBeLessThanOrEqual(Date.now());
  });
});

// Field builders mirroring the Energy API's per-field { status, … } union.
const ok = (value: unknown, updatedAt: string, unit?: string) =>
  ({ status: "OK", value, updatedAt, ...(unit ? { unit } : {}) });
const err = () => ({ status: "ERROR", code: "PROPERTY_NOT_FOUND", message: "missing" });

function energyState(overrides: Record<string, unknown> = {}): EnergyState {
  return {
    batteryChargeLevel: ok(72.4, "2026-01-01T12:00:00Z"),
    electricRange: ok(305.6, "2026-01-01T11:59:00Z"),
    chargerConnectionStatus: ok("CONNECTED", "2026-01-01T11:58:00Z"),
    chargingStatus: ok("CHARGING", "2026-01-01T11:58:00Z"),
    chargingType: ok("AC", "2026-01-01T11:58:00Z"),
    chargerPowerStatus: ok("POWER_AVAILABLE", "2026-01-01T11:58:00Z"),
    chargingPower: ok(3435, "2026-01-01T12:00:00Z", "watt"),
    targetBatteryChargeLevel: ok(80, "2026-01-01T08:00:00Z"),
    chargingCurrentLimit: ok(16, "2026-01-01T08:00:00Z"),
    ...overrides,
  } as unknown as EnergyState;
}

describe("deriveSnapshot", () => {
  it("maps OK fields, rounding SOC/range and converting power to kW", () => {
    const snap = deriveSnapshot(energyState());
    expect(snap).toMatchObject({
      soc: 72, // rounded
      rangeKm: 306, // rounded
      connectionStatus: "CONNECTED",
      chargingStatus: "CHARGING",
      chargingType: "AC",
      chargerPowerStatus: "POWER_AVAILABLE",
      chargingPowerKw: 3.435, // 3435 W → kW
      targetSoc: 80,
      currentLimitA: 16,
    });
  });

  it("collapses ERROR/NOT_FOUND fields to null instead of throwing", () => {
    const snap = deriveSnapshot(
      energyState({ chargingPower: err(), electricRange: err(), targetBatteryChargeLevel: err() }),
    );
    expect(snap.chargingPowerKw).toBeNull();
    expect(snap.rangeKm).toBeNull();
    expect(snap.targetSoc).toBeNull();
    // Unaffected fields still map.
    expect(snap.soc).toBe(72);
  });

  it("uses the latest observable updatedAt as observedAt, ignoring target/limit", () => {
    // batteryChargeLevel + chargingPower are the latest observable fields (12:00).
    // targetBatteryChargeLevel is even later but must NOT count.
    const snap = deriveSnapshot(
      energyState({ targetBatteryChargeLevel: ok(90, "2026-06-01T00:00:00Z") }),
    );
    expect(snap.observedAt.toISOString()).toBe("2026-01-01T12:00:00.000Z");
  });
});

describe("snapshotObservablyEqual", () => {
  const base: ObservableFields = {
    soc: 72,
    rangeKm: 305,
    connectionStatus: "CONNECTED",
    chargingStatus: "CHARGING",
    chargingType: "AC",
    chargerPowerStatus: "POWER_AVAILABLE",
    chargingPowerKw: 3.4,
    targetSoc: 80,
    currentLimitA: 16,
  };

  it("is true for identical observable fields", () => {
    expect(snapshotObservablyEqual(base, { ...base })).toBe(true);
  });

  it("is false when any single observable field differs", () => {
    expect(snapshotObservablyEqual(base, { ...base, soc: 73 })).toBe(false);
    expect(snapshotObservablyEqual(base, { ...base, connectionStatus: "DISCONNECTED" })).toBe(false);
    expect(snapshotObservablyEqual(base, { ...base, chargingPowerKw: 3.5 })).toBe(false);
    expect(snapshotObservablyEqual(base, { ...base, currentLimitA: null })).toBe(false);
  });
});

describe("classifyConnectionTransition", () => {
  it("opens on disconnected → connected", () => {
    expect(classifyConnectionTransition(false, true)).toBe("opened");
  });
  it("closes on connected → disconnected", () => {
    expect(classifyConnectionTransition(true, false)).toBe("closed");
  });
  it("stays connected (peak-power upkeep) on connected → connected", () => {
    expect(classifyConnectionTransition(true, true)).toBe("still-connected");
  });
  it("stays disconnected (no transition) on disconnected → disconnected", () => {
    expect(classifyConnectionTransition(false, false)).toBe("still-disconnected");
  });
});
