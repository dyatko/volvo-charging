import { beforeEach, describe, expect, it, vi } from "vitest";

// A chainable db.update().set().where() that resolves — pollOne's failure
// path (the only path we exercise here) just bumps the vehicle row.
vi.mock("@/db/client", () => ({
  db: {
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  },
}));

// Energy GET returns a 404 so withRetry returns immediately (no backoff sleeps)
// and pollOne takes the failure path without touching the DB read.
const energyGet = vi.fn(async () => ({
  data: undefined,
  error: { detail: "stub 404" },
  response: { status: 404, headers: new Headers() },
}));

vi.mock("@/lib/volvo/client", () => ({
  makeEnergyClient: vi.fn(() => ({ GET: energyGet })),
  makeLocationClient: vi.fn(() => ({ GET: vi.fn() })),
  pointToLatLng: vi.fn(() => null),
}));

import { pollAllVehicles } from "@/lib/polling";
import type { UserContext, VehicleRow } from "@/lib/userVehicle";

const NOW = Date.now();

function vehicle(vin: string, nextPollAt: Date): VehicleRow {
  return { vin, batteryCapacityKwh: null, currentLat: null, currentLng: null, nextPollAt } as VehicleRow;
}

function ctxWith(vehicles: VehicleRow[]): UserContext {
  return {
    userId: "u1",
    email: null,
    userLastSeenAt: null,
    vccApiKey: "k",
    credsFor: () => ({ accessToken: "t", vccApiKey: "k" }),
    vehicles,
    activeVehicle: vehicles[0] ?? null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("pollAllVehicles cadence gate (onlyDue)", () => {
  it("skips a vehicle whose nextPollAt is in the future and polls one that's due", async () => {
    const ctx = ctxWith([
      vehicle("DUE", new Date(NOW - 60_000)), // due (past)
      vehicle("NOTYET", new Date(NOW + 120_000)), // not due (future)
    ]);

    const results = await pollAllVehicles(ctx, { onlyDue: true });

    const due = results.find((r) => r.vin === "DUE")!;
    const notYet = results.find((r) => r.vin === "NOTYET")!;

    // The future-dated vehicle is skipped with no API call.
    expect(notYet.outcome).toMatchObject({ ok: true, skipped: true });
    // The due vehicle was actually polled (its Energy GET ran; here it 404s).
    expect(due.outcome.ok).toBe(false);
    expect(energyGet).toHaveBeenCalledTimes(1);
  });

  it("without onlyDue, polls every vehicle regardless of nextPollAt (dashboard force-poll)", async () => {
    const ctx = ctxWith([
      vehicle("A", new Date(NOW + 999_000)),
      vehicle("B", new Date(NOW + 999_000)),
    ]);

    const results = await pollAllVehicles(ctx);

    expect(results.every((r) => !("skipped" in r.outcome && r.outcome.skipped))).toBe(true);
    expect(energyGet).toHaveBeenCalledTimes(2);
  });
});
