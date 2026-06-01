import { describe, expect, it } from "vitest";
import type { GeocodeResult } from "@googlemaps/google-maps-services-js";
import { deriveAddress } from "@/lib/geocoding/address";

// Minimal address-component / result fixtures. The real Google response carries
// many more fields, but deriveAddress only reads `address_components[].{types,
// long_name}`, so we cast partial shapes for readability.
function comp(long_name: string, types: string[]) {
  return { long_name, short_name: long_name, types };
}
function result(components: ReturnType<typeof comp>[]): GeocodeResult {
  return { address_components: components } as unknown as GeocodeResult;
}

describe("deriveAddress", () => {
  it("combines a sublocality and its locality into 'Area · City'", () => {
    const r = result([
      comp("Limhamn", ["sublocality_level_1", "sublocality", "political"]),
      comp("Malmö", ["locality", "political"]),
      comp("Sweden", ["country", "political"]),
    ]);
    expect(deriveAddress([r])).toEqual({
      city: "Malmö",
      area: "Limhamn",
      label: "Limhamn · Malmö",
    });
  });

  it("falls back to postal_town for the city and neighborhood for the area", () => {
    const r = result([
      comp("Hagastaden", ["neighborhood", "political"]),
      comp("Stockholm", ["postal_town"]),
    ]);
    expect(deriveAddress([r])).toEqual({
      city: "Stockholm",
      area: "Hagastaden",
      label: "Hagastaden · Stockholm",
    });
  });

  it("uses a route alone when no city resolves (street-only fallback)", () => {
    const r = result([comp("Storgatan", ["route"])]);
    expect(deriveAddress([r])).toEqual({ city: null, area: "Storgatan", label: "Storgatan" });
  });

  it("dedupes when area and city are the same place", () => {
    const r = result([
      comp("Malmö", ["sublocality_level_1"]),
      comp("Malmö", ["locality"]),
    ]);
    expect(deriveAddress([r])).toEqual({ city: "Malmö", area: "Malmö", label: "Malmö" });
  });

  it("prefers higher-priority component types", () => {
    const r = result([
      comp("Route Name", ["route"]),
      comp("Innerstaden", ["sublocality_level_1"]),
      comp("Östergötland County", ["administrative_area_level_2"]),
      comp("Linköping", ["locality"]),
    ]);
    // locality beats administrative_area_level_2; sublocality_level_1 beats route.
    expect(deriveAddress([r])).toEqual({
      city: "Linköping",
      area: "Innerstaden",
      label: "Innerstaden · Linköping",
    });
  });

  it("uses long_name, not short_name", () => {
    const r = result([{ long_name: "Göteborg", short_name: "GBG", types: ["locality"] }]);
    expect(deriveAddress([r]).city).toBe("Göteborg");
  });

  it("returns all-null for an empty result set", () => {
    expect(deriveAddress([])).toEqual({ city: null, area: null, label: null });
  });
});
