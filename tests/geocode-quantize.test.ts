import { describe, expect, it } from "vitest";
import { coordKey, GEOCODE_PRECISION_DP, quantizeCoord } from "@/lib/geocoding/quantize";
import { metersBetween } from "@/lib/pollCadence";

describe("quantizeCoord", () => {
  it("rounds to GEOCODE_PRECISION_DP (3) decimal places", () => {
    expect(GEOCODE_PRECISION_DP).toBe(3);
    expect(quantizeCoord(59.32932, 18.06858)).toEqual({ qLat: 59.329, qLng: 18.069 });
  });

  it("produces clean doubles with no binary-float artefacts", () => {
    const { qLat, qLng } = quantizeCoord(18.068, -0.001);
    expect(qLat).toBe(18.068);
    expect(qLng).toBe(-0.001);
    // The value is exactly representable enough to compare by equality, which is
    // what the cache key relies on between writer and reader.
    expect(Object.is(quantizeCoord(0, 0).qLat, 0)).toBe(true);
  });

  it("collapses two fixes within ~100 m onto the same key", () => {
    const a = quantizeCoord(59.3293, 18.0686);
    const b = quantizeCoord(59.32935, 18.06865); // a few metres away
    expect(metersBetween(59.3293, 18.0686, 59.32935, 18.06865)).toBeLessThan(100);
    expect(coordKey(a.qLat, a.qLng)).toBe(coordKey(b.qLat, b.qLng));
  });

  it("keeps points hundreds of metres apart on different keys", () => {
    const a = quantizeCoord(59.329, 18.069);
    const b = quantizeCoord(59.331, 18.069); // ~222 m north
    expect(metersBetween(59.329, 18.069, 59.331, 18.069)).toBeGreaterThan(150);
    expect(coordKey(a.qLat, a.qLng)).not.toBe(coordKey(b.qLat, b.qLng));
  });
});

describe("coordKey", () => {
  it("formats a stable string key", () => {
    expect(coordKey(59.329, 18.069)).toBe("59.329,18.069");
  });
});
