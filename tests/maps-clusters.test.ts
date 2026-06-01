import { describe, expect, it } from "vitest";
import { clusterSessionsByLocation, type SessionLocation } from "@/lib/maps/clusters";

function s(over: Partial<SessionLocation> & { id: string }): SessionLocation {
  return { lat: null, lng: null, label: null, energyKwh: null, ...over };
}

describe("clusterSessionsByLocation", () => {
  it("folds sessions at the same quantised spot into one marker", () => {
    const out = clusterSessionsByLocation([
      s({ id: "a", lat: 59.3293, lng: 18.0686, label: "Norrmalm · Stockholm", energyKwh: 10 }),
      s({ id: "b", lat: 59.32935, lng: 18.06865, label: null, energyKwh: 5 }), // metres away
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ count: 2, energyKwh: 15, label: "Norrmalm · Stockholm" });
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
