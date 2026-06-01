import { coordKey, quantizeCoord } from "@/lib/geocoding/quantize";

/**
 * Group charging sessions into map markers by location. Sessions are folded onto
 * the same quantised grid used by the geocode cache, so repeat charges at the
 * same spot (home, work, a favourite charger) collapse into one marker with a
 * session count and total energy — keeping the overview map readable and the
 * marker count tiny. Pure: no IO, unit-tested.
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
  /** Stable per-location id (the quantised coordinate key). */
  id: string;
  lat: number;
  lng: number;
  label: string | null;
  /** Number of sessions at this location. */
  count: number;
  /** Total energy across those sessions, or null if none was recorded. */
  energyKwh: number | null;
};

export function clusterSessionsByLocation(sessions: SessionLocation[]): MapLocation[] {
  const byKey = new Map<string, MapLocation>();
  for (const s of sessions) {
    if (s.lat == null || s.lng == null) continue;
    const { qLat, qLng } = quantizeCoord(s.lat, s.lng);
    const key = coordKey(qLat, qLng);
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
