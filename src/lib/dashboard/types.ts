// The dashboard view-model: the prop shapes VehicleDashboard renders, decoupled
// from the database rows. The signed-in dashboard adapts real DB rows into these
// (see ./adapt.ts → toVehicleDashboardProps); the landing page feeds the same
// shapes from mock data (demoVehicleDashboard). Keeping the contract here — not
// in the component — is what lets both paths provably build the same object.

export type DashboardVehicle = {
  model: string | null;
  modelYear: number | null;
  batteryCapacityKwh: number | null;
  vin: string;
  exteriorImageUrl: string | null;
  currentLat: number | null;
  currentLng: number | null;
  /** Coarse "Area · City" label, when reverse geocoding resolved one. */
  locationName?: string | null;
  lastSeenAt: string | null; // ISO
};

export type DashboardSnapshot = {
  soc: number | null;
  targetSoc: number | null;
  rangeKm: number | null;
  chargingPowerKw: number | null;
  connectionStatus: string | null;
  chargingStatus: string | null;
  chargingType: string | null;
  observedAt: string | null; // ISO
};

export type DashboardSession = {
  id: string;
  startedAt: string; // ISO
  endedAt: string | null; // ISO
  startSoc: number;
  endSoc: number | null;
  energyKwh: number | null;
  peakPowerKw: number | null;
  connectionType: string | null;
  isOpen: boolean;
  startLat: number | null;
  startLng: number | null;
  endLat: number | null;
  endLng: number | null;
  /** Coarse "Area · City" label for the session's location, when resolved. */
  locationName?: string | null;
};

export type VehicleDashboardProps = {
  vehicle: DashboardVehicle;
  latest: DashboardSnapshot | null;
  sessions: DashboardSession[];
  /** Demo mode: map coordinates render as plain text (no navigating links). */
  demo?: boolean;
  /**
   * Browser-side Maps JS key. When set (and there are located sessions), the
   * charging-locations overview map renders inside the sessions section.
   * Omitted/null → no map (additive).
   */
  mapApiKey?: string | null;
  /**
   * Map ID for the overview map's Advanced Markers. Omitted → Google's
   * "DEMO_MAP_ID" (no Cloud enablement needed; identical default pins).
   */
  mapId?: string;
};

/** Any record carrying a session's start/end coordinates (DB row or view model). */
type SessionCoords = {
  startLat: number | null;
  startLng: number | null;
  endLat: number | null;
  endLng: number | null;
};

/**
 * The one location to show for a session: where it ended if both end
 * coordinates are known, otherwise where it started. Returns null when neither
 * pair is complete. The single source for this "end ?? start" rule, shared by
 * the adapter, the map markers, the viewport filter, and the list rows.
 */
export function sessionLatLng(s: SessionCoords): { lat: number; lng: number } | null {
  const hasEnd = s.endLat != null && s.endLng != null;
  const lat = hasEnd ? s.endLat : s.startLat;
  const lng = hasEnd ? s.endLng : s.startLng;
  return lat != null && lng != null ? { lat, lng } : null;
}
