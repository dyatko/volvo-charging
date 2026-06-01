import { describe, expect, it } from "vitest";
import {
  decidePollInterval,
  isConnected,
  metersBetween,
  POLL_INTERVAL_MS,
  type CadenceSignals,
} from "@/lib/pollCadence";

const { active, target, idle } = POLL_INTERVAL_MS;

// Fixed "now" so every case is deterministic without fake timers.
const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);
const minsAgo = (m: number) => new Date(NOW - m * 60_000);

/** Build a CadenceSignals with sensible "nothing happening" defaults. */
function signals(overrides: Partial<CadenceSignals> = {}): CadenceSignals {
  return {
    connectionStatus: "DISCONNECTED",
    chargingStatus: "IDLE",
    lastChangeAt: null,
    moved: false,
    userLastSeenAt: null,
    ...overrides,
  };
}

const decide = (o: Partial<CadenceSignals> = {}) => decidePollInterval(signals(o), NOW);

describe("isConnected", () => {
  it("recognises every CONNECTED* variant and rejects the rest", () => {
    expect(isConnected("CONNECTED")).toBe(true);
    expect(isConnected("CONNECTED_AC")).toBe(true);
    expect(isConnected("CONNECTED_DC")).toBe(true);
    expect(isConnected("DISCONNECTED")).toBe(false);
    expect(isConnected(null)).toBe(false);
    expect(isConnected(undefined)).toBe(false);
  });
});

describe("decidePollInterval — leaf branches", () => {
  it("connected + CHARGING → active, even with a stale last change", () => {
    expect(
      decide({ connectionStatus: "CONNECTED_DC", chargingStatus: "CHARGING", lastChangeAt: minsAgo(30) }),
    ).toBe(active);
  });

  it("connected + not charging (DONE / IDLE / reached target) → target", () => {
    expect(decide({ connectionStatus: "CONNECTED", chargingStatus: "DONE" })).toBe(target);
    expect(decide({ connectionStatus: "CONNECTED_AC", chargingStatus: "IDLE" })).toBe(target);
  });

  it("connected + unknown chargingStatus (ERROR / unsupported) → target (safe)", () => {
    expect(decide({ connectionStatus: "CONNECTED", chargingStatus: null })).toBe(target);
  });

  it("disconnected + moved → active", () => {
    expect(decide({ connectionStatus: "DISCONNECTED", moved: true, lastChangeAt: minsAgo(99) })).toBe(active);
  });

  it("disconnected + changed recently → active; changed long ago → idle", () => {
    expect(decide({ lastChangeAt: minsAgo(5) })).toBe(active);
    expect(decide({ lastChangeAt: minsAgo(25) })).toBe(idle);
  });

  it("user active (<15 min) overrides an otherwise-idle parked car", () => {
    expect(decide({ lastChangeAt: minsAgo(25), userLastSeenAt: minsAgo(5) })).toBe(active);
  });

  it("user-active window expired (16 min) + parked-idle → idle", () => {
    expect(decide({ lastChangeAt: minsAgo(25), userLastSeenAt: minsAgo(16) })).toBe(idle);
  });

  it("brand-new vehicle (no snapshots, disconnected, not moved) → idle", () => {
    expect(decide({ lastChangeAt: null })).toBe(idle);
  });
});

describe("decidePollInterval — window boundaries", () => {
  it("user-active window is exclusive at exactly 15 min", () => {
    // 14:59 → still active, 15:00 → expired.
    expect(decide({ userLastSeenAt: new Date(NOW - (15 * 60_000 - 1000)) })).toBe(active);
    expect(decide({ userLastSeenAt: new Date(NOW - 15 * 60_000) })).toBe(idle);
  });

  it("idle-activity window is exclusive at exactly 20 min", () => {
    expect(decide({ lastChangeAt: new Date(NOW - (20 * 60_000 - 1000)) })).toBe(active);
    expect(decide({ lastChangeAt: new Date(NOW - 20 * 60_000) })).toBe(idle);
  });
});

// Each case walks the cadence a car would experience through a real flow.
// The worst-case detection lag is the interval that was in effect when the
// event happened (the event lands just after a poll).
describe("decidePollInterval — real-life scenario timelines", () => {
  it("S1: long-parked car charges immediately, no app open", () => {
    // Parked, untouched >20 min → idle (5 min). Worst case: plug-in is seen
    // up to 5 min later, when we next poll and find it connected+charging.
    const parked = decide({ connectionStatus: "DISCONNECTED", chargingStatus: "IDLE", lastChangeAt: minsAgo(40) });
    const detected = decide({ connectionStatus: "CONNECTED_DC", chargingStatus: "CHARGING", lastChangeAt: minsAgo(0), moved: true });
    expect(parked).toBe(idle); // ≤5 min plug-in/charge-start lag
    expect(detected).toBe(active);
  });

  it("S2: plugged in, charging scheduled ~30 min later", () => {
    const parked = decide({ connectionStatus: "DISCONNECTED", lastChangeAt: minsAgo(40) });
    const pluggedWaiting = decide({ connectionStatus: "CONNECTED_AC", chargingStatus: "IDLE", lastChangeAt: minsAgo(0) });
    const chargingStarted = decide({ connectionStatus: "CONNECTED_AC", chargingStatus: "CHARGING", lastChangeAt: minsAgo(0) });
    expect(parked).toBe(idle); // plug-in seen ≤5 min
    expect(pluggedWaiting).toBe(target); // waits on 2-min cadence
    expect(chargingStarted).toBe(active); // real charge start caught ≤2 min, accurate startSoc
  });

  it("S3: drives home and plugs in within a few minutes (common case, no 5-min lag)", () => {
    const driving = decide({ connectionStatus: "DISCONNECTED", moved: true, lastChangeAt: minsAgo(0) });
    const justParked = decide({ connectionStatus: "DISCONNECTED", lastChangeAt: minsAgo(2) });
    const plugged = decide({ connectionStatus: "CONNECTED_AC", chargingStatus: "CHARGING", lastChangeAt: minsAgo(0) });
    expect(driving).toBe(active);
    expect(justParked).toBe(active); // ≤1 min plug-in detection
    expect(plugged).toBe(active);
  });

  it("S4: reaches target, sits plugged in, then unplugged", () => {
    const charging = decide({ connectionStatus: "CONNECTED_DC", chargingStatus: "CHARGING", lastChangeAt: minsAgo(0) });
    const atTarget = decide({ connectionStatus: "CONNECTED_DC", chargingStatus: "DONE", lastChangeAt: minsAgo(0) });
    const justUnplugged = decide({ connectionStatus: "DISCONNECTED", lastChangeAt: minsAgo(0) });
    const parkedAfter = decide({ connectionStatus: "DISCONNECTED", lastChangeAt: minsAgo(25) });
    expect(charging).toBe(active);
    expect(atTarget).toBe(target); // unplug caught ≤2 min
    expect(justUnplugged).toBe(active); // watch briefly after unplug
    expect(parkedAfter).toBe(idle);
  });

  it("S6: parked car SOC/range noise causes a bounded 1-min burst, then back to idle", () => {
    const noiseTick = decide({ connectionStatus: "DISCONNECTED", moved: false, lastChangeAt: minsAgo(0) });
    const settled = decide({ connectionStatus: "DISCONNECTED", moved: false, lastChangeAt: minsAgo(21) });
    expect(noiseTick).toBe(active); // 20-min burst — over-polls, never under-polls
    expect(settled).toBe(idle);
  });
});

describe("metersBetween", () => {
  it("is ~0 for identical points", () => {
    expect(metersBetween(59.3293, 18.0686, 59.3293, 18.0686)).toBeLessThan(1);
  });

  it("measures a > 100 m separation as moved, and a tiny jitter as not moved", () => {
    // ~0.001° latitude ≈ 111 m near Stockholm.
    expect(metersBetween(59.3293, 18.0686, 59.3303, 18.0686)).toBeGreaterThan(100);
    // ~0.0002° ≈ 22 m — within GPS jitter, below the 100 m threshold.
    expect(metersBetween(59.3293, 18.0686, 59.32932, 18.06862)).toBeLessThan(100);
  });

  it("matches a known Stockholm↔Gothenburg great-circle distance (~398 km)", () => {
    const d = metersBetween(59.3293, 18.0686, 57.7089, 11.9746);
    expect(d).toBeGreaterThan(390_000);
    expect(d).toBeLessThan(410_000);
  });
});
