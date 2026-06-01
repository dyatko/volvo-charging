import { BRAND_GREEN, BRAND_ORANGE, BRAND_RED, hexToRgb } from "@/lib/brand";

// Colour for the state-of-charge ring. Interpolates between the brand anchors
// (red at low SOC, orange in the middle, green at high — the same colours as
// <ChargingLogo />) so a one-percent change never produces a visible jump. Pure
// and unit-tested (tests/soc-color.test.ts).

const SOC_RED = hexToRgb(BRAND_RED);
const SOC_ORANGE = hexToRgb(BRAND_ORANGE);
const SOC_GREEN = hexToRgb(BRAND_GREEN);

function mixRgb(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): string {
  const h = (v: number) => Math.round(v).toString(16).padStart(2, "0");
  return `#${h(a[0] + (b[0] - a[0]) * t)}${h(a[1] + (b[1] - a[1]) * t)}${h(a[2] + (b[2] - a[2]) * t)}`;
}

/**
 * Hex colour for a SOC percentage: solid red at ≤10 %, solid green at ≥90 %, and
 * a smooth red→orange→green blend in between (the midpoint, 50 %, lands on
 * orange).
 */
export function socRingColor(soc: number): string {
  if (soc <= 10) return mixRgb(SOC_RED, SOC_RED, 0);
  if (soc >= 90) return mixRgb(SOC_GREEN, SOC_GREEN, 0);
  if (soc <= 50) return mixRgb(SOC_RED, SOC_ORANGE, (soc - 10) / 40);
  return mixRgb(SOC_ORANGE, SOC_GREEN, (soc - 50) / 40);
}
