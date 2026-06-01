import { describe, expect, it } from "vitest";
import { inBounds, type MapBounds } from "@/lib/maps/bounds";

// A Stockholm-ish viewport.
const stockholm: MapBounds = { north: 59.5, south: 59.2, east: 18.2, west: 17.9 };

describe("inBounds", () => {
  it("includes a point inside the viewport", () => {
    expect(inBounds(59.3293, 18.0686, stockholm)).toBe(true);
  });

  it("excludes points north or south of the viewport", () => {
    expect(inBounds(60.0, 18.0686, stockholm)).toBe(false);
    expect(inBounds(58.0, 18.0686, stockholm)).toBe(false);
  });

  it("excludes points east or west of the viewport", () => {
    expect(inBounds(59.3, 19.0, stockholm)).toBe(false);
    expect(inBounds(59.3, 17.0, stockholm)).toBe(false);
  });

  it("includes points on the edges", () => {
    expect(inBounds(59.5, 18.2, stockholm)).toBe(true);
    expect(inBounds(59.2, 17.9, stockholm)).toBe(true);
  });

  it("handles a viewport that wraps the antimeridian (east < west)", () => {
    const pacific: MapBounds = { north: 10, south: -10, east: -170, west: 170 };
    expect(inBounds(0, 175, pacific)).toBe(true);
    expect(inBounds(0, -175, pacific)).toBe(true);
    expect(inBounds(0, 0, pacific)).toBe(false);
  });
});
