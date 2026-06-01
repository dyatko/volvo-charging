import { optionalEnv } from "@/lib/env";

/**
 * Browser-side Google Maps JavaScript API key. Separate from the server-side
 * geocoding key (src/lib/geocoding/config.ts): this one is referrer-restricted
 * and API-restricted to Maps JS in Google Cloud, so it's safe to ship to the
 * client. Read at request time in the (server) dashboard page and passed to the
 * map component as a prop — so it's a runtime secret (Cloud Run --update-secrets),
 * NOT baked into the client bundle at build time. Null when unset/placeholder so
 * the map stays dark and the page renders fine without it.
 */
export function getGoogleMapsBrowserKey(): string | null {
  return optionalEnv("GOOGLE_MAPS_BROWSER_KEY");
}

/**
 * Map ID for the overview map. Advanced Markers (the non-deprecated successor to
 * google.maps.Marker) only render on a map created with a `mapId`, so we always
 * supply one. A Map ID is NOT a secret — it travels in plain sight in every Maps
 * request — so it's a plain env var, not a Secret Manager entry.
 *
 * Unset/placeholder falls back to Google's "DEMO_MAP_ID", which enables Advanced
 * Markers without Cloud enablement and renders the same default pins we use now.
 * To get a brand-styled basemap, create a Map ID in the Google Cloud console
 * (Maps → Map Management) and set GOOGLE_MAPS_MAP_ID — no code change needed.
 */
export function getGoogleMapsMapId(): string {
  return optionalEnv("GOOGLE_MAPS_MAP_ID") ?? "DEMO_MAP_ID";
}
