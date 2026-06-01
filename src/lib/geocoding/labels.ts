import { reverseGeocode } from "@/lib/geocoding/service";
import { coordKey, quantizeCoord } from "@/lib/geocoding/quantize";

/** Resolve a coarse place name for a coordinate; null when none is known. */
export type LocationNameLookup = (lat: number | null, lng: number | null) => string | null;

/**
 * Batch-resolve coarse "Area · City" labels for a set of coordinates and return
 * a synchronous lookup keyed by position. Inputs are deduped onto the geocode
 * cache's quantised grid, so N display coordinates cost at most one lookup per
 * distinct ~100 m cell. Cache hits are instant DB reads; a miss populates the
 * cache (this is what backfills names for historical sessions on first view).
 *
 * Best-effort throughout: reverseGeocode never throws, an unresolved point maps
 * to null, and the returned lookup returns null for null inputs — so a geocoding
 * outage degrades to raw coordinates rather than breaking the page.
 */
export async function resolveLocationLabels(
  coords: Array<[number, number]>,
): Promise<LocationNameLookup> {
  // Dedup by quantised key — repeat charges at one spot resolve once.
  const uniqueByKey = new Map<string, [number, number]>();
  for (const [lat, lng] of coords) {
    const { qLat, qLng } = quantizeCoord(lat, lng);
    const k = coordKey(qLat, qLng);
    if (!uniqueByKey.has(k)) uniqueByKey.set(k, [lat, lng]);
  }

  const nameByKey = new Map<string, string | null>();
  await Promise.all(
    [...uniqueByKey.entries()].map(async ([k, [lat, lng]]) => {
      const result = await reverseGeocode(lat, lng).catch(() => null);
      nameByKey.set(k, result?.label ?? null);
    }),
  );

  return (lat, lng) => {
    if (lat == null || lng == null) return null;
    const { qLat, qLng } = quantizeCoord(lat, lng);
    return nameByKey.get(coordKey(qLat, qLng)) ?? null;
  };
}
