import { describe, expect, it } from "vitest";
import { BRAND_GREEN, BRAND_ORANGE, BRAND_RED, hexToRgb } from "@/lib/brand";
import { socRingColor } from "@/lib/soc-color";

describe("hexToRgb", () => {
  it("parses the brand hex colours into byte triples", () => {
    expect(hexToRgb(BRAND_RED)).toEqual([229, 57, 53]);
    expect(hexToRgb(BRAND_ORANGE)).toEqual([255, 138, 0]);
    expect(hexToRgb(BRAND_GREEN)).toEqual([0, 200, 83]);
  });

  it("is case-insensitive and tolerates a missing #", () => {
    expect(hexToRgb("#00c853")).toEqual([0, 200, 83]);
    expect(hexToRgb("00C853")).toEqual([0, 200, 83]);
  });
});

describe("socRingColor", () => {
  it("is solid brand red at or below 10 %", () => {
    expect(socRingColor(0)).toBe("#e53935");
    expect(socRingColor(10)).toBe("#e53935");
  });

  it("is solid brand green at or above 90 %", () => {
    expect(socRingColor(90)).toBe("#00c853");
    expect(socRingColor(100)).toBe("#00c853");
  });

  it("lands on brand orange at the 50 % midpoint", () => {
    expect(socRingColor(50)).toBe("#ff8a00");
  });

  it("produces a valid blended hex between the anchors", () => {
    expect(socRingColor(30)).toMatch(/^#[0-9a-f]{6}$/);
    expect(socRingColor(70)).toMatch(/^#[0-9a-f]{6}$/);
  });
});
