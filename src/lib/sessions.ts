// Charging-session domain maths, shared by the poller (which persists the
// figure when a session closes) and the dashboard (which shows it live for an
// in-progress session). Keeping the one formula here guarantees the live value
// and the stored value can never drift apart.

/**
 * Energy delivered across a session, derived from the SOC gained against pack
 * capacity: `(endSoc − startSoc) / 100 × capacityKwh`.
 *
 * Returns null when either the end SOC or the pack capacity is unknown (an
 * open session with no live reading, or a car whose capacity we never learned).
 * A negative delta — SOC drifting down slightly while plugged in — clamps to 0.
 */
export function energyKwhFromSoc(
  startSoc: number,
  endSoc: number | null,
  capacityKwh: number | null,
): number | null {
  if (endSoc == null || capacityKwh == null) return null;
  return Math.max(0, ((endSoc - startSoc) / 100) * capacityKwh);
}
