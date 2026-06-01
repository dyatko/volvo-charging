import { describe, expect, it } from "vitest";
import { sessionLatLng } from "@/lib/dashboard/types";
import { toVehicleDashboardProps } from "@/lib/dashboard/adapt";
import type { VehicleRow } from "@/lib/userVehicle";

describe("sessionLatLng", () => {
  const base = { startLat: 59.3, startLng: 18.0, endLat: 59.4, endLng: 18.1 };

  it("prefers the end coordinate when both end values are present", () => {
    expect(sessionLatLng(base)).toEqual({ lat: 59.4, lng: 18.1 });
  });

  it("falls back to the start coordinate when the end pair is incomplete", () => {
    expect(sessionLatLng({ ...base, endLat: null })).toEqual({ lat: 59.3, lng: 18.0 });
    expect(sessionLatLng({ ...base, endLng: null })).toEqual({ lat: 59.3, lng: 18.0 });
  });

  it("returns null when neither pair is complete", () => {
    expect(
      sessionLatLng({ startLat: null, startLng: 18.0, endLat: null, endLng: null }),
    ).toBeNull();
    expect(
      sessionLatLng({ startLat: null, startLng: null, endLat: null, endLng: null }),
    ).toBeNull();
  });
});

// A vehicle row with just the fields the adapter reads (cast for the rest).
const vehicle = {
  vin: "YV1TESTVIN0000001",
  model: "EX40",
  modelYear: 2024,
  batteryCapacityKwh: 69,
  exteriorImageUrl: null,
  currentLat: 59.34,
  currentLng: 18.04,
  lastSeenAt: new Date("2026-06-01T10:00:00Z"),
} as unknown as VehicleRow;

const nameFor = (lat: number | null, lng: number | null): string | null =>
  lat === 59.34 && lng === 18.04 ? "Vasastan · Stockholm" : null;

describe("toVehicleDashboardProps", () => {
  it("maps the vehicle header, resolving a place name and ISO timestamp", () => {
    const props = toVehicleDashboardProps({
      vehicle,
      latest: undefined,
      sessions: [],
      nameFor,
      mapApiKey: "key",
      mapId: "MAP",
    });
    expect(props.vehicle).toMatchObject({
      vin: "YV1TESTVIN0000001",
      model: "EX40",
      batteryCapacityKwh: 69,
      locationName: "Vasastan · Stockholm",
      lastSeenAt: "2026-06-01T10:00:00.000Z",
    });
    expect(props.mapApiKey).toBe("key");
    expect(props.mapId).toBe("MAP");
    // Not the demo path.
    expect(props.demo).toBeUndefined();
  });

  it("maps a null latest snapshot to null", () => {
    const props = toVehicleDashboardProps({
      vehicle,
      latest: undefined,
      sessions: [],
      nameFor,
      mapApiKey: null,
      mapId: "MAP",
    });
    expect(props.latest).toBeNull();
  });

  it("maps a snapshot's fields verbatim with an ISO observedAt", () => {
    const latest = {
      soc: 72,
      targetSoc: 80,
      rangeKm: 305,
      chargingPowerKw: 11,
      connectionStatus: "CONNECTED",
      chargingStatus: "CHARGING",
      chargingType: "AC",
      observedAt: new Date("2026-06-01T09:59:00Z"),
    };
    const props = toVehicleDashboardProps({
      vehicle,
      latest: latest as never,
      sessions: [],
      nameFor,
      mapApiKey: null,
      mapId: "MAP",
    });
    expect(props.latest).toEqual({
      soc: 72,
      targetSoc: 80,
      rangeKm: 305,
      chargingPowerKw: 11,
      connectionStatus: "CONNECTED",
      chargingStatus: "CHARGING",
      chargingType: "AC",
      observedAt: "2026-06-01T09:59:00.000Z",
    });
  });

  it("maps sessions, stringifying the id and resolving the latest-known location name", () => {
    const sessions = [
      {
        id: "abc-123",
        startedAt: new Date("2026-05-30T08:00:00Z"),
        endedAt: new Date("2026-05-30T09:00:00Z"),
        startSoc: 41,
        endSoc: 80,
        energyKwh: 26.9,
        peakPowerKw: 11,
        connectionType: "AC",
        isOpen: false,
        startLat: 59.34,
        startLng: 18.04,
        endLat: 59.34,
        endLng: 18.04,
      },
    ];
    const props = toVehicleDashboardProps({
      vehicle,
      latest: undefined,
      sessions: sessions as never,
      nameFor,
      mapApiKey: null,
      mapId: "MAP",
    });
    expect(props.sessions).toHaveLength(1);
    expect(props.sessions[0]).toMatchObject({
      id: "abc-123",
      startedAt: "2026-05-30T08:00:00.000Z",
      endedAt: "2026-05-30T09:00:00.000Z",
      startSoc: 41,
      endSoc: 80,
      energyKwh: 26.9,
      isOpen: false,
      locationName: "Vasastan · Stockholm",
    });
  });
});
