import { describe, expect, it } from "vitest";
import { fmtKw, fmtKwh, round1 } from "@/lib/format";

// Non-breaking space (U+00A0) — what fmtKwh/fmtKw put between number and unit.
const NBSP = String.fromCharCode(0xa0);

describe("round1", () => {
  it("rounds to one decimal place", () => {
    expect(round1(1.56)).toBe("1.6");
    expect(round1(26.94)).toBe("26.9");
    expect(round1(0.149)).toBe("0.1");
  });

  it("rounds half up", () => {
    expect(round1(1.55)).toBe("1.6");
    expect(round1(2.25)).toBe("2.3");
  });

  it("drops a trailing .0 so whole numbers stay clean", () => {
    expect(round1(27)).toBe("27");
    expect(round1(69)).toBe("69");
    expect(round1(11.0)).toBe("11");
    expect(round1(0)).toBe("0");
  });

  it("keeps a value already at one decimal", () => {
    expect(round1(1.6)).toBe("1.6");
  });

  it("handles negatives", () => {
    expect(round1(-1.56)).toBe("-1.6");
  });
});

describe("fmtKwh / fmtKw", () => {
  it("appends the unit with a non-breaking space", () => {
    expect(fmtKwh(1.56)).toBe(`1.6${NBSP}kWh`);
    expect(fmtKwh(69)).toBe(`69${NBSP}kWh`);
    expect(fmtKw(11.0)).toBe(`11${NBSP}kW`);
    expect(fmtKw(151.34)).toBe(`151.3${NBSP}kW`);
  });
});
