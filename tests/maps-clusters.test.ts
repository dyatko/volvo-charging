import { describe, expect, it } from "vitest";
import {
  CLUSTER_MERGE_DIAGONAL_M,
  clusterSessionsByLocation,
  type SessionLocation,
} from "@/lib/maps/clusters";
import { metersBetween } from "@/lib/pollCadence";

function s(over: Partial<SessionLocation> & { id: string }): SessionLocation {
  return { lat: null, lng: null, label: null, energyKwh: null, ...over };
}

describe("clusterSessionsByLocation", () => {
  it("folds sub-metre GPS jitter at one spot into a single marker", () => {
    // ~0.3 m apart: well inside one grid cell, so the same physical charger.
    expect(metersBetween(59.3293, 18.0686, 59.32931, 18.06861)).toBeLessThan(2);
    const out = clusterSessionsByLocation([
      s({ id: "a", lat: 59.3293, lng: 18.0686, label: "Norrmalm · Stockholm", energyKwh: 10 }),
      s({ id: "b", lat: 59.32931, lng: 18.06861, label: null, energyKwh: 5 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ count: 2, energyKwh: 15, label: "Norrmalm · Stockholm" });
  });

  it("keeps two nearby chargers (~50 m apart) as separate markers", () => {
    // The regression this grid fixes: spots a few tens of metres apart used to
    // merge onto the coarse ~111 m geocode grid. 0.0005° lat ≈ 56 m > the cell.
    expect(metersBetween(59.3293, 18.0686, 59.3298, 18.0686)).toBeGreaterThan(CLUSTER_MERGE_DIAGONAL_M);
    const out = clusterSessionsByLocation([
      s({ id: "a", lat: 59.3293, lng: 18.0686 }),
      s({ id: "b", lat: 59.3298, lng: 18.0686 }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("keeps distinct locations as separate markers", () => {
    const out = clusterSessionsByLocation([
      s({ id: "a", lat: 59.3293, lng: 18.0686 }),
      s({ id: "b", lat: 58.4108, lng: 15.6214 }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("skips sessions with no coordinates", () => {
    const out = clusterSessionsByLocation([
      s({ id: "a" }),
      s({ id: "b", lat: 59.3293, lng: null }),
      s({ id: "c", lat: 59.3293, lng: 18.0686 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(1);
  });

  it("leaves energy null when no session recorded any", () => {
    const out = clusterSessionsByLocation([
      s({ id: "a", lat: 59.3293, lng: 18.0686 }),
      s({ id: "b", lat: 59.3293, lng: 18.0686 }),
    ]);
    expect(out[0].count).toBe(2);
    expect(out[0].energyKwh).toBeNull();
  });

  it("backfills a label from a later session when the first lacked one", () => {
    const out = clusterSessionsByLocation([
      s({ id: "a", lat: 59.3293, lng: 18.0686, label: null }),
      s({ id: "b", lat: 59.3293, lng: 18.0686, label: "Norrmalm · Stockholm" }),
    ]);
    expect(out[0].label).toBe("Norrmalm · Stockholm");
  });
});
