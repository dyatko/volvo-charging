import createClient from "openapi-fetch";
import type { paths as EnergyPaths } from "./energy.gen";
import type { paths as ConvePaths } from "./conve.gen";
import type { paths as LocationPaths } from "./location.gen";

export type VolvoCreds = {
  accessToken: string;
  vccApiKey: string;
};

function authHeaders({ accessToken, vccApiKey }: VolvoCreds) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "vcc-api-key": vccApiKey,
    Accept: "application/json",
  };
}

export const makeEnergyClient = (creds: VolvoCreds) =>
  createClient<EnergyPaths>({
    baseUrl: "https://api.volvocars.com/energy/v2",
    headers: authHeaders(creds),
  });

export const makeConveClient = (creds: VolvoCreds) =>
  createClient<ConvePaths>({
    baseUrl: "https://api.volvocars.com/connected-vehicle/v2",
    headers: authHeaders(creds),
  });

// Location API base URL has no version segment — the `/v1/` is in the path.
export const makeLocationClient = (creds: VolvoCreds) =>
  createClient<LocationPaths>({
    baseUrl: "https://api.volvocars.com/location",
    headers: authHeaders(creds),
  });

/**
 * Extract [longitude, latitude, altitude?] from a Location API GeoJSON Point.
 * GeoJSON puts longitude first; database columns are stored as separate lat/lng.
 */
export function pointToLatLng(
  coordinates: number[] | undefined,
): { lat: number; lng: number; alt?: number } | null {
  if (!coordinates || coordinates.length < 2) return null;
  const [lng, lat, alt] = coordinates;
  return { lat, lng, alt };
}
