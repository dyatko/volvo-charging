import { Client, Status } from "@googlemaps/google-maps-services-js";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { geocodeCache } from "@/db/schema";
import { deriveAddress, type DerivedAddress } from "./address";
import { getGoogleMapsApiKey } from "./config";
import { quantizeCoord } from "./quantize";

// The cached, coarse "Area · City" result — the same shape deriveAddress
// produces (one declaration, in ./address).
export type GeocodeResult = DerivedAddress;

// Module-level singleton: manages its own axios instance, keep-alive agent and
// retry-axios backoff (429/5xx). Cheap to construct; no network at import time.
const client = new Client();

function inRange(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  );
}

/**
 * Reverse-geocode a coordinate to a coarse "Area · City" label, caching results
 * in `geocode_cache`. Self-populating: quantise → cache lookup → on miss call
 * Google → upsert → return. Best-effort — returns null (never throws) when the
 * coords are invalid, no API key is configured, or the lookup fails, so a
 * failure can never break a poll or a dashboard render.
 *
 * Note: Google replies HTTP 200 even for OVER_QUERY_LIMIT, so retry-axios can't
 * see it — we treat it as a soft miss (return null, don't cache) rather than
 * poisoning the cache with a transient error.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<GeocodeResult | null> {
  if (!inRange(lat, lng)) return null;
  const { qLat, qLng } = quantizeCoord(lat, lng);

  try {
    const cached = (
      await db
        .select({ city: geocodeCache.city, area: geocodeCache.area, label: geocodeCache.label })
        .from(geocodeCache)
        .where(and(eq(geocodeCache.qLat, qLat), eq(geocodeCache.qLng, qLng)))
        .limit(1)
    )[0];
    if (cached) return cached;

    const key = getGoogleMapsApiKey();
    if (!key) return null;

    // Geocode the quantised point so the cached coordinate == the geocoded one.
    // No `language` param → Google returns local-language names (Göteborg, not
    // Gothenburg); names with no local form stay readable for the viewer.
    const { data } = await client.reverseGeocode({ params: { latlng: { lat: qLat, lng: qLng }, key } });

    if (data.status === Status.OK) {
      const derived = deriveAddress(data.results);
      await upsert(qLat, qLng, derived, data);
      return derived;
    }

    if (data.status === Status.ZERO_RESULTS) {
      // Negative-cache: store the empty result so a lake/field isn't re-queried.
      const empty = { city: null, area: null, label: null };
      await upsert(qLat, qLng, empty, data);
      return empty;
    }

    // OVER_QUERY_LIMIT / OVER_DAILY_LIMIT / REQUEST_DENIED / INVALID_REQUEST /
    // UNKNOWN_ERROR — transient or config errors. Don't cache; surface as a miss.
    return null;
  } catch {
    return null;
  }
}

async function upsert(qLat: number, qLng: number, derived: GeocodeResult, responseJson: unknown) {
  const set = { ...derived, responseJson, fetchedAt: new Date() };
  await db
    .insert(geocodeCache)
    .values({ qLat, qLng, ...derived, language: "local", responseJson })
    .onConflictDoUpdate({ target: [geocodeCache.qLat, geocodeCache.qLng], set });
}
