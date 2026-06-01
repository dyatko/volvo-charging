import { optionalEnv } from "@/lib/env";

/**
 * Single app-level Google Maps Platform key for server-side reverse geocoding —
 * read from the environment, never stored in the DB and never per-user (mirrors
 * SESSION_SECRET, not the encrypted per-user Volvo creds). Returns null when
 * unset (or still the bootstrap placeholder) so reverse geocoding stays dark and
 * the UI falls back to raw coordinates. See src/lib/volvoConfig.ts.
 */
export function getGoogleMapsApiKey(): string | null {
  return optionalEnv("GOOGLE_MAPS_API_KEY");
}
