// Shared number formatting for user-facing values, so energy/power read the
// same everywhere (the dashboard header, the session list, the map labels).
// One precision rule, one place to change it.

/**
 * Round to at most one decimal place, dropping a trailing ".0".
 * 1.56 → "1.6", 1.6 → "1.6", 27.0 → "27", 69 → "69".
 *
 * `toFixed(1)` does the rounding (float-safe), then `Number(...)` strips the
 * trailing zero so whole numbers stay clean ("69", not "69.0").
 */
export function round1(value: number): string {
  return Number(value.toFixed(1)).toString();
}

// A non-breaking space keeps the number and its unit on the same line.
const NBSP = " ";

/** Energy, e.g. "1.6 kWh", "26.9 kWh", "69 kWh". */
export function fmtKwh(value: number): string {
  return `${round1(value)}${NBSP}kWh`;
}

/** Power, e.g. "11 kW", "151.3 kW". */
export function fmtKw(value: number): string {
  return `${round1(value)}${NBSP}kW`;
}
