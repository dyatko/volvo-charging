// Adapters into the dashboard view-model (./types). The signed-in dashboard
// maps real DB rows here; the landing page uses demoVehicleDashboard(). Both
// must stay in lock-step — when you add a field to the view-model, extend BOTH
// the adapter and the demo so the public landing example never lags the real
// dashboard.

import type { chargingSessions, stateSnapshots } from "@/db/schema";
import type { VehicleRow } from "@/lib/userVehicle";
import { sessionLatLng, type VehicleDashboardProps } from "@/lib/dashboard/types";

type SnapshotRow = typeof stateSnapshots.$inferSelect;
type SessionRow = typeof chargingSessions.$inferSelect;

/** Date (or anything date-ish) → ISO string for the string-typed view-model. */
function toIso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  return typeof d === "string" ? d : d.toISOString();
}

/**
 * Build VehicleDashboard props from the active vehicle, its latest snapshot,
 * and its sessions. `nameFor` resolves a coarse place name for a coordinate
 * (see src/lib/geocoding/labels.ts) — already-batched, so this stays synchronous
 * and pure.
 */
export function toVehicleDashboardProps(opts: {
  vehicle: VehicleRow;
  latest: SnapshotRow | undefined;
  sessions: SessionRow[];
  nameFor: (lat: number | null, lng: number | null) => string | null;
  mapApiKey: string | null;
  mapId: string;
}): VehicleDashboardProps {
  const { vehicle, latest, sessions, nameFor, mapApiKey, mapId } = opts;
  return {
    vehicle: {
      model: vehicle.model,
      modelYear: vehicle.modelYear,
      batteryCapacityKwh: vehicle.batteryCapacityKwh,
      vin: vehicle.vin,
      exteriorImageUrl: vehicle.exteriorImageUrl,
      currentLat: vehicle.currentLat,
      currentLng: vehicle.currentLng,
      locationName: nameFor(vehicle.currentLat, vehicle.currentLng),
      lastSeenAt: toIso(vehicle.lastSeenAt ?? null),
    },
    latest: latest
      ? {
          soc: latest.soc,
          targetSoc: latest.targetSoc,
          rangeKm: latest.rangeKm,
          chargingPowerKw: latest.chargingPowerKw,
          connectionStatus: latest.connectionStatus,
          chargingStatus: latest.chargingStatus,
          chargingType: latest.chargingType,
          observedAt: toIso(latest.observedAt ?? null),
        }
      : null,
    sessions: sessions.map((s) => {
      const loc = sessionLatLng(s);
      return {
        id: String(s.id),
        startedAt: toIso(s.startedAt) ?? "",
        endedAt: toIso(s.endedAt ?? null),
        startSoc: s.startSoc,
        endSoc: s.endSoc,
        energyKwh: s.energyKwh,
        peakPowerKw: s.peakPowerKw,
        connectionType: s.connectionType,
        isOpen: s.isOpen,
        startLat: s.startLat,
        startLng: s.startLng,
        endLat: s.endLat,
        endLng: s.endLng,
        locationName: nameFor(loc?.lat ?? null, loc?.lng ?? null),
      };
    }),
    mapApiKey,
    mapId,
  };
}

/**
 * Locally-generated sample data for the landing-page demo. Timestamps are
 * relative to now so "Updated …" and session ages always look fresh. No
 * network, no real VIN. Two charges sit a few streets apart in the same
 * Stockholm district (Vasastan), so the overview map groups them into one
 * count marker when zoomed out and splits them into separate pins as you zoom
 * in — that's the clustering demo; the third is a DC fast-charge down in
 * Linköping that always stands alone.
 */
export function demoVehicleDashboard(): VehicleDashboardProps {
  const now = Date.now();
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  const iso = (ms: number) => new Date(ms).toISOString();
  return {
    demo: true,
    vehicle: {
      model: "EX40",
      modelYear: 2024,
      batteryCapacityKwh: 69,
      vin: "YV1XZK7L9P2••••••",
      exteriorImageUrl: null,
      currentLat: 59.3448,
      currentLng: 18.0389,
      locationName: "Norra Stationsgatan · Stockholm",
      lastSeenAt: iso(now - 38 * 1000),
    },
    latest: {
      soc: 72,
      targetSoc: 80,
      rangeKm: 305,
      chargingPowerKw: 11.0,
      connectionStatus: "CONNECTED",
      chargingStatus: "CHARGING",
      chargingType: "AC",
      observedAt: iso(now - 38 * 1000),
    },
    sessions: [
      {
        id: "demo-live",
        startedAt: iso(now - HOUR - 12 * MIN),
        endedAt: null,
        startSoc: 58,
        endSoc: null,
        energyKwh: null,
        peakPowerKw: 11.3,
        connectionType: "AC",
        isOpen: true,
        startLat: 59.3448,
        startLng: 18.0389,
        endLat: null,
        endLng: null,
        locationName: "Norra Stationsgatan · Stockholm",
      },
      {
        // A previous AC charge a few streets south, near Odenplan — a distinct
        // spot from the live session but still in Vasastan. Close enough that
        // the two Stockholm markers group when the map is zoomed out, far
        // enough that they split into separate pins as you zoom in.
        id: "demo-vasastan",
        startedAt: iso(now - DAY - 8 * HOUR),
        endedAt: iso(now - DAY - 3 * HOUR),
        startSoc: 41,
        endSoc: 80,
        energyKwh: 26.9,
        peakPowerKw: 11.0,
        connectionType: "AC",
        isOpen: false,
        startLat: 59.3429,
        startLng: 18.0494,
        endLat: 59.3429,
        endLng: 18.0494,
        locationName: "Vasastan · Stockholm",
      },
      {
        id: "demo-trip",
        startedAt: iso(now - 2 * DAY - 3 * HOUR),
        endedAt: iso(now - 2 * DAY - 3 * HOUR + 34 * MIN),
        startSoc: 19,
        endSoc: 80,
        energyKwh: 42.1,
        peakPowerKw: 151.0,
        connectionType: "DC",
        isOpen: false,
        startLat: 58.4108,
        startLng: 15.6214,
        endLat: 58.4108,
        endLng: 15.6214,
        locationName: "Innerstaden · Linköping",
      },
    ],
  };
}
