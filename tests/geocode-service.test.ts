import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Shared mock fns/state, hoisted so the vi.mock factories below can close over them.
const { reverseGeocodeMock, valuesMock, onConflictMock, selectState } = vi.hoisted(() => {
  const onConflictMock = vi.fn(() => Promise.resolve());
  return {
    reverseGeocodeMock: vi.fn(),
    valuesMock: vi.fn(() => ({ onConflictDoUpdate: onConflictMock })),
    onConflictMock,
    selectState: { rows: [] as Array<Record<string, unknown>> },
  };
});

vi.mock("@googlemaps/google-maps-services-js", () => ({
  Client: class {
    reverseGeocode = reverseGeocodeMock;
  },
  Status: {
    OK: "OK",
    ZERO_RESULTS: "ZERO_RESULTS",
    OVER_QUERY_LIMIT: "OVER_QUERY_LIMIT",
    OVER_DAILY_LIMIT: "OVER_DAILY_LIMIT",
    REQUEST_DENIED: "REQUEST_DENIED",
    INVALID_REQUEST: "INVALID_REQUEST",
    UNKNOWN_ERROR: "UNKNOWN_ERROR",
    NOT_FOUND: "NOT_FOUND",
  },
  // address.ts reads these enum members at module load.
  AddressType: {
    locality: "locality",
    postal_town: "postal_town",
    administrative_area_level_2: "administrative_area_level_2",
    sublocality_level_1: "sublocality_level_1",
    neighborhood: "neighborhood",
    sublocality: "sublocality",
    route: "route",
  },
}));

vi.mock("@/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve(selectState.rows) }) }),
    }),
    insert: () => ({ values: valuesMock }),
  },
}));

import { reverseGeocode } from "@/lib/geocoding/service";

const okResponse = {
  data: {
    status: "OK",
    results: [
      {
        address_components: [
          { long_name: "Limhamn", short_name: "Limhamn", types: ["sublocality_level_1"] },
          { long_name: "Malmö", short_name: "Malmö", types: ["locality"] },
        ],
      },
    ],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  selectState.rows = [];
  process.env.GOOGLE_MAPS_API_KEY = "AIzaTestKey0000000000000000000000000000";
});

afterEach(() => {
  delete process.env.GOOGLE_MAPS_API_KEY;
});

describe("reverseGeocode", () => {
  it("returns the cached row without calling Google on a hit", async () => {
    selectState.rows = [{ city: "Malmö", area: "Limhamn", label: "Limhamn · Malmö" }];
    const result = await reverseGeocode(59.3293, 18.0686);
    expect(result).toEqual({ city: "Malmö", area: "Limhamn", label: "Limhamn · Malmö" });
    expect(reverseGeocodeMock).not.toHaveBeenCalled();
    expect(valuesMock).not.toHaveBeenCalled();
  });

  it("geocodes the quantised coords on a miss, upserts, and returns the label", async () => {
    reverseGeocodeMock.mockResolvedValue(okResponse);
    const result = await reverseGeocode(59.32932, 18.06858);

    expect(result).toEqual({ city: "Malmö", area: "Limhamn", label: "Limhamn · Malmö" });
    // Quantised request, with the key, no language param.
    expect(reverseGeocodeMock).toHaveBeenCalledTimes(1);
    const params = (
      (reverseGeocodeMock.mock.calls[0] as unknown[])[0] as {
        params: { latlng: unknown; key: string; language?: unknown };
      }
    ).params;
    expect(params.latlng).toEqual({ lat: 59.329, lng: 18.069 });
    expect(params.key).toBe("AIzaTestKey0000000000000000000000000000");
    expect(params.language).toBeUndefined();
    // Upsert stores derived fields, language "local", and the raw response.
    const inserted = (valuesMock.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(inserted).toMatchObject({
      qLat: 59.329,
      qLng: 18.069,
      city: "Malmö",
      area: "Limhamn",
      label: "Limhamn · Malmö",
      language: "local",
      responseJson: okResponse.data,
    });
    expect(onConflictMock).toHaveBeenCalledTimes(1);
  });

  it("negative-caches ZERO_RESULTS (null fields, but still upserts)", async () => {
    reverseGeocodeMock.mockResolvedValue({ data: { status: "ZERO_RESULTS", results: [] } });
    const result = await reverseGeocode(0, 0);
    expect(result).toEqual({ city: null, area: null, label: null });
    expect(valuesMock).toHaveBeenCalledTimes(1);
  });

  it("treats OVER_QUERY_LIMIT as a soft miss — returns null, does not cache", async () => {
    reverseGeocodeMock.mockResolvedValue({ data: { status: "OVER_QUERY_LIMIT", results: [] } });
    const result = await reverseGeocode(59.3293, 18.0686);
    expect(result).toBeNull();
    expect(valuesMock).not.toHaveBeenCalled();
  });

  it("returns null without calling Google when no API key is configured", async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    const result = await reverseGeocode(59.3293, 18.0686);
    expect(result).toBeNull();
    expect(reverseGeocodeMock).not.toHaveBeenCalled();
  });

  it("returns null without calling Google when the key is still the bootstrap placeholder", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "SET_ME";
    const result = await reverseGeocode(59.3293, 18.0686);
    expect(result).toBeNull();
    expect(reverseGeocodeMock).not.toHaveBeenCalled();
  });

  it("returns null (poll-safe) when the SDK rejects", async () => {
    reverseGeocodeMock.mockRejectedValue(new Error("network"));
    const result = await reverseGeocode(59.3293, 18.0686);
    expect(result).toBeNull();
  });

  it("returns null for out-of-range coordinates without touching the cache or Google", async () => {
    const result = await reverseGeocode(Number.NaN, 18.0686);
    expect(result).toBeNull();
    expect(reverseGeocodeMock).not.toHaveBeenCalled();
    expect(valuesMock).not.toHaveBeenCalled();
  });
});
