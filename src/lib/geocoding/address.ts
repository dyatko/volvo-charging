import { AddressType, type GeocodeResult } from "@googlemaps/google-maps-services-js";

/**
 * Pure derivation of a coarse, friendly label from a Google Geocoding result.
 *
 * We deliberately surface only "Area · City" — never the full street address —
 * so the shared location snippet doesn't expose a precise position. When neither
 * a city nor an area resolves, `label` is null and the UI falls back to raw
 * coordinates.
 */
export type DerivedAddress = {
  city: string | null;
  area: string | null;
  label: string | null;
};

// Priority ladders, first hit wins. A Swedish town like Limhamn surfaces as a
// sublocality of Malmö; a place with no neighbourhood falls back to its street.
const CITY_TYPES: AddressType[] = [
  AddressType.locality,
  AddressType.postal_town,
  AddressType.administrative_area_level_2,
];
const AREA_TYPES: AddressType[] = [
  AddressType.sublocality_level_1,
  AddressType.neighborhood,
  AddressType.sublocality,
  AddressType.route,
];

function pick(components: GeocodeResult["address_components"], wanted: AddressType[]): string | null {
  for (const type of wanted) {
    const hit = components.find((c) => c.types.includes(type));
    if (hit) return hit.long_name;
  }
  return null;
}

/**
 * results[0] → { city, area, label }. Uses each component's `long_name` (the
 * full local name). Returns all-null when there's no usable result.
 */
export function deriveAddress(results: GeocodeResult[]): DerivedAddress {
  const first = results?.[0];
  if (!first) return { city: null, area: null, label: null };

  const components = first.address_components ?? [];
  const city = pick(components, CITY_TYPES);
  const area = pick(components, AREA_TYPES);

  // "Area · City" when both and distinct; otherwise whichever we have. Dedupe so
  // a sublocality that equals its city never renders as "Malmö · Malmö".
  const label = city && area && city !== area ? `${area} · ${city}` : city ?? area ?? null;

  return { city, area, label };
}
