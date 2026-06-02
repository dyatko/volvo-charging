/**
 * Adaptive polling cadence — pure decision logic, no DB/IO.
 *
 * The Cloud Scheduler tick fires every minute, but we only call the Energy API
 * for a vehicle when its `vehicles.next_poll_at` is due. After each poll we set
 * `next_poll_at = now + decidePollInterval(...)` so a car that's doing nothing
 * is polled rarely and a car that's charging (or being watched) is polled often.
 * This keeps us well inside Volvo's 10 000 req/day per-app quota.
 *
 * See the plan in ~/.claude/plans for the scenario walk-throughs and the
 * worst-case detection latencies each interval implies.
 */

export const POLL_INTERVAL_MS = {
  /** Charging, moving, or the user is watching — keep it live. */
  active: 60_000, // 1 min
  /** Plugged in but not actively charging (at target / paused / scheduled). */
  target: 120_000, // 2 min
  /** Disconnected and nothing has changed for a while — parked. */
  idle: 300_000, // 5 min
} as const;

/** How long after the user was last seen we keep polling every minute. */
export const USER_ACTIVE_WINDOW_MS = 15 * 60_000;
/** A disconnected car counts as "active" while something changed this recently. */
export const IDLE_ACTIVITY_WINDOW_MS = 20 * 60_000;
/** Position delta (metres) above which we treat the car as having moved. */
export const MOVEMENT_THRESHOLD_M = 100;

/**
 * How stale `last_seen_at` (the last *successful* poll) may get before the
 * dashboard warns that data may be missing. A healthy poller refreshes at worst
 * every `idle` interval (5 min); 15 min is comfortably past that, so this only
 * trips on a genuine stall — dead token, failing API, or the scheduler down.
 */
export const POLL_STALE_MS = 15 * 60_000;

/** True when there's been no successful poll within POLL_STALE_MS (or ever). */
export function isPollStale(lastSeenAt: Date | null, now: number): boolean {
  return !lastSeenAt || now - lastSeenAt.getTime() > POLL_STALE_MS;
}

const CONNECTED_STATES = new Set(["CONNECTED", "CONNECTED_AC", "CONNECTED_DC"]);

/** True when the charge cable is in (any AC/DC variant). */
export function isConnected(s: string | null | undefined): boolean {
  return !!s && CONNECTED_STATES.has(s);
}

export type CadenceSignals = {
  connectionStatus: string | null;
  /** "CHARGING" | "IDLE" | "DONE" | … | null (capabilities can come back ERROR). */
  chargingStatus: string | null;
  /** observedAt of the latest snapshot for this VIN — i.e. when a value last changed. */
  lastChangeAt: Date | null;
  /** Position changed beyond MOVEMENT_THRESHOLD_M at this poll. */
  moved: boolean;
  /** When the owner was last seen (login / dashboard view). */
  userLastSeenAt: Date | null;
};

function within(at: Date | null, windowMs: number, now: number): boolean {
  return !!at && now - at.getTime() < windowMs;
}

/**
 * Decide how long to wait before the next Energy poll for a vehicle.
 * Priority ladder, first match wins:
 *   1. user active (<15 min)                       → active (1 min)
 *   2. connected & charging                        → active (1 min)
 *   3. connected & not charging                    → target (2 min)
 *   4. disconnected & moved-or-changed (<20 min)   → active (1 min)
 *   5. disconnected & idle (≥20 min)               → idle   (5 min)
 */
export function decidePollInterval(s: CadenceSignals, now: number): number {
  // Rule 4 — the user is looking (or looked very recently): keep it live.
  if (within(s.userLastSeenAt, USER_ACTIVE_WINDOW_MS, now)) {
    return POLL_INTERVAL_MS.active;
  }

  if (isConnected(s.connectionStatus)) {
    // Rule 1 — actively charging.
    if (s.chargingStatus === "CHARGING") return POLL_INTERVAL_MS.active;
    // Rule 2 — plugged in but not charging: at target, paused, or scheduled.
    return POLL_INTERVAL_MS.target;
  }

  // Disconnected. Rule 1 ("moving") via position delta, or anything that
  // changed recently (a driving car's SOC/range tick down continuously).
  if (s.moved || within(s.lastChangeAt, IDLE_ACTIVITY_WINDOW_MS, now)) {
    return POLL_INTERVAL_MS.active;
  }

  // Rule 3 — parked and quiet.
  return POLL_INTERVAL_MS.idle;
}

/**
 * Great-circle distance in metres between two lat/lng points (haversine).
 * Used to tell a moving car apart from one whose SOC/range merely drifted
 * while parked.
 */
export function metersBetween(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6_371_000; // Earth radius, metres
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
