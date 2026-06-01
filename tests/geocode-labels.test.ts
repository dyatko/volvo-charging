import { beforeEach, describe, expect, it, vi } from "vitest";

const { reverseGeocodeMock } = vi.hoisted(() => ({ reverseGeocodeMock: vi.fn() }));

vi.mock("@/lib/geocoding/service", () => ({
  reverseGeocode: reverseGeocodeMock,
}));

import { resolveLocationLabels } from "@/lib/geocoding/labels";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveLocationLabels", () => {
  it("dedups coordinates onto the quantised grid — one lookup per ~100 m cell", async () => {
    reverseGeocodeMock.mockResolvedValue({ city: "Stockholm", area: "Vasastan", label: "Vasastan · Stockholm" });
    // Three points: two within the same 3-dp cell (59.344x, 18.038x), one apart.
    await resolveLocationLabels([
      [59.3448, 18.0389],
      [59.34481, 18.03894], // same quantised cell as the first
      [58.4108, 15.6214], // distinct cell
    ]);
    expect(reverseGeocodeMock).toHaveBeenCalledTimes(2);
  });

  it("returns a lookup keyed by quantised position", async () => {
    reverseGeocodeMock.mockImplementation(async (lat: number) =>
      lat > 59 ? { label: "Vasastan · Stockholm" } : { label: "Innerstaden · Linköping" },
    );
    const nameFor = await resolveLocationLabels([
      [59.3448, 18.0389],
      [58.4108, 15.6214],
    ]);
    // A nearby point in the same cell resolves to the cached label.
    expect(nameFor(59.34479, 18.03888)).toBe("Vasastan · Stockholm");
    expect(nameFor(58.4108, 15.6214)).toBe("Innerstaden · Linköping");
  });

  it("returns null for null inputs and for unresolved positions", async () => {
    reverseGeocodeMock.mockResolvedValue({ label: null });
    const nameFor = await resolveLocationLabels([[59.3448, 18.0389]]);
    expect(nameFor(null, 18.0389)).toBeNull();
    expect(nameFor(59.3448, null)).toBeNull();
    expect(nameFor(59.3448, 18.0389)).toBeNull(); // resolved, but no readable label
    expect(nameFor(10, 10)).toBeNull(); // never looked up
  });

  it("degrades to null when a lookup rejects (best-effort, never throws)", async () => {
    reverseGeocodeMock.mockRejectedValue(new Error("network"));
    const nameFor = await resolveLocationLabels([[59.3448, 18.0389]]);
    expect(nameFor(59.3448, 18.0389)).toBeNull();
  });
});
