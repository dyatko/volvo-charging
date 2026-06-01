/**
 * Coordinate quantisation for the geocode cache key.
 *
 * GPS fixes jitter by a few metres even for a parked car. Rounding to a fixed
 * grid folds those near-identical points onto one cache key so we geocode a
 * charging spot once, not on every metre of drift. 3 decimal places ≈ 111 m at
 * the equator (and less E-W at Swedish latitudes), which lines up with the
 * MOVEMENT_THRESHOLD_M = 100 used for "did the car actually move" in
 * src/lib/pollCadence.ts.
 */
export const GEOCODE_PRECISION_DP = 3;

/**
 * Round a lat/lng to GEOCODE_PRECISION_DP. `toFixed` rounds half-away-from-zero
 * and avoids binary-float artefacts (e.g. 18.068000000000001), so the rounded
 * value compares exactly between the writer (poll) and the reader (dashboard).
 */
export function quantizeCoord(lat: number, lng: number): { qLat: number; qLng: number } {
  return {
    qLat: Number(lat.toFixed(GEOCODE_PRECISION_DP)),
    qLng: Number(lng.toFixed(GEOCODE_PRECISION_DP)),
  };
}

/** Stable string key for in-memory maps keyed by quantised coordinates. */
export function coordKey(qLat: number, qLng: number): string {
  return `${qLat},${qLng}`;
}
