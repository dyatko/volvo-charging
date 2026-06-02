/**
 * Group charging sessions into map markers by location. Repeat charges at the
 * same spot (home, work, a favourite charger) collapse into one marker with a
 * session count and total energy — keeping the overview map readable and the
 * marker count tiny. Pure: no IO, unit-tested.
 *
 * The clustering grid is deliberately *finer* than the geocode cache's ~111 m
 * privacy grid (`GEOCODE_PRECISION_DP`): the map needs to keep two chargers a
 * few tens of metres apart as separate pins, whereas the coarse "Area · City"
 * label is the same at either resolution — so the two grids have different jobs
 * and are sized independently.
 */
export type SessionLocation = {
  id: string;
  lat: number | null;
  lng: number | null;
  /** Coarse "Area · City" label, when reverse geocoding resolved one. */
  label: string | null;
  energyKwh: number | null;
};

export type MapLocation = {
  /** Stable per-location id (the clustering grid cell key). */
  id: string;
  lat: number;
  lng: number;
  label: string | null;
  /** Number of sessions at this location. */
  count: number;
  /** Total energy across those sessions, or null if none was recorded. */
  energyKwh: number | null;
};

/**
 * Worst-case distance, in metres, between two sessions that still collapse into
 * one map marker. The grid is a square sized so its diagonal equals this at the
 * equator (where longitude cells are widest); at higher latitudes the longitude
 * axis shrinks, so the real merge threshold only ever drops below it.
 */
export const CLUSTER_MERGE_DIAGONAL_M = 20;

// Metres per degree of latitude — near-constant everywhere. A square cell whose
// diagonal is CLUSTER_MERGE_DIAGONAL_M has side = diagonal / √2.
const M_PER_DEGREE = 111_320;
const CELL_DEG = CLUSTER_MERGE_DIAGONAL_M / Math.SQRT2 / M_PER_DEGREE;

/**
 * Bucket a coordinate onto the clustering grid. `Math.round` centres each cell
 * on a grid node so a parked car's GPS jitter around one node stays in a single
 * bucket. This is purely in-process (one pass over the dashboard's sessions), so
 * — unlike the cross-process geocode cache key — it needs no exact-compare
 * float guarantees.
 */
function clusterKey(lat: number, lng: number): string {
  return `${Math.round(lat / CELL_DEG)},${Math.round(lng / CELL_DEG)}`;
}

export function clusterSessionsByLocation(sessions: SessionLocation[]): MapLocation[] {
  const byKey = new Map<string, MapLocation>();
  for (const s of sessions) {
    if (s.lat == null || s.lng == null) continue;
    const key = clusterKey(s.lat, s.lng);
    const existing = byKey.get(key);
    if (existing) {
      existing.count += 1;
      if (s.energyKwh != null) existing.energyKwh = (existing.energyKwh ?? 0) + s.energyKwh;
      if (!existing.label && s.label) existing.label = s.label;
    } else {
      byKey.set(key, {
        id: key,
        // Representative position: the first session's actual fix at this spot.
        lat: s.lat,
        lng: s.lng,
        label: s.label,
        count: 1,
        energyKwh: s.energyKwh,
      });
    }
  }
  return [...byKey.values()];
}
