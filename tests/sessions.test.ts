import { describe, expect, it } from "vitest";
import { energyKwhFromSoc } from "@/lib/sessions";

describe("energyKwhFromSoc", () => {
  it("returns the SOC delta against pack capacity", () => {
    // 41 → 80 % of a 69 kWh pack = 0.39 * 69 = 26.91 kWh
    expect(energyKwhFromSoc(41, 80, 69)).toBeCloseTo(26.91, 5);
    // 19 → 80 % of a 69 kWh pack = 0.61 * 69 = 42.09 kWh
    expect(energyKwhFromSoc(19, 80, 69)).toBeCloseTo(42.09, 5);
  });

  it("returns null when the end SOC is unknown (session still open, no live reading)", () => {
    expect(energyKwhFromSoc(58, null, 69)).toBeNull();
  });

  it("returns null when pack capacity is unknown", () => {
    expect(energyKwhFromSoc(41, 80, null)).toBeNull();
  });

  it("clamps a negative delta to zero (SOC drifted down while plugged in)", () => {
    expect(energyKwhFromSoc(80, 78, 69)).toBe(0);
  });

  it("is zero for no change", () => {
    expect(energyKwhFromSoc(50, 50, 69)).toBe(0);
  });
});
