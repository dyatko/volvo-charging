"use client";

import { useMemo, useState } from "react";
import { LocalTime, formatLocalDate } from "@/components/local-time";
import { SessionsMap } from "@/components/sessions-map";
import { MapLink, Pill, Divider, fmtCoord, fmtSessionDuration } from "@/components/vehicle-dashboard-bits";
import { fmtKw, fmtKwh } from "@/lib/format";
import { energyKwhFromSoc } from "@/lib/sessions";
import { clusterSessionsByLocation } from "@/lib/maps/clusters";
import { inBounds, type MapBounds } from "@/lib/maps/bounds";
import { sessionLatLng, type DashboardSession } from "@/lib/dashboard/types";

// The "Charging sessions" body: a date-range heading, the overview map, and the
// session list. Client-side so two filters can compose live — first the date
// range (the heading's start/end pickers), then the map viewport (pan/zoom).
// The heading lives here (not in VehicleDashboard) because its dates are
// interactive. VehicleDashboard just wraps this in a <section>.

export type SessionsSectionProps = {
  sessions: DashboardSession[];
  /** Latest SOC, used to fill in live values for an in-progress session. */
  latestSoc: number | null;
  batteryCapacityKwh: number | null;
  /** Demo mode: map coordinates render as plain text (no navigating links). */
  demo?: boolean;
  /** Browser-side Maps JS key. Omitted/null → no map (additive). */
  mapApiKey?: string | null;
  /** Map ID for Advanced Markers; defaults to Google's no-setup demo Map ID. */
  mapId?: string;
};

// The session's calendar day in the *viewer's* timezone, as a sortable
// "YYYY-MM-DD" (en-CA yields ISO order). Matches the value space of a native
// <input type="date">, so day comparisons against the pickers are plain string
// compares. UTC during SSR vs local in the browser only shifts the label by a
// day at most — harmless, since the default range spans everything either way
// (the dynamic nodes carry suppressHydrationWarning).
function dayKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function clampDay(v: string, lo: string, hi: string): string {
  return v < lo ? lo : v > hi ? hi : v;
}

// Energy delivered by one session: the recorded figure, or — for a session
// still in progress — derived live from the SOC gained against pack capacity
// (the same formula the poller persists on close, so the list and its
// "totalling …" sum always agree with the stored value).
function sessionEnergyKwh(
  s: DashboardSession,
  latestSoc: number | null,
  batteryCapacityKwh: number | null,
): number | null {
  if (s.energyKwh != null) return s.energyKwh;
  const endSoc = s.endSoc ?? (s.isOpen ? latestSoc : null);
  return energyKwhFromSoc(s.startSoc, endSoc, batteryCapacityKwh);
}

/**
 * An inline, clickable date that shows a friendly formatted label but opens the
 * browser's native date picker. The real <input type="date"> sits transparently
 * over the label (so a click anywhere lands on it) and `showPicker()` makes the
 * calendar open on the first click rather than just focusing the field.
 */
function DateField({
  value,
  min,
  max,
  onChange,
  ariaLabel,
}: {
  value: string;
  min: string;
  max: string;
  onChange: (v: string) => void;
  ariaLabel: string;
}) {
  return (
    <span className="group relative inline-block align-baseline">
      <span
        aria-hidden
        suppressHydrationWarning
        className="rounded-md font-semibold text-zinc-900 underline decoration-dotted decoration-zinc-400 underline-offset-4 transition-colors group-hover:bg-zinc-100 dark:text-zinc-100 dark:decoration-zinc-600 dark:group-hover:bg-zinc-800"
      >
        {formatLocalDate(`${value}T00:00:00`)}
      </span>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => e.currentTarget.showPicker?.()}
        aria-label={ariaLabel}
        suppressHydrationWarning
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </span>
  );
}

export function SessionsSection({
  sessions,
  latestSoc,
  batteryCapacityKwh,
  demo = false,
  mapApiKey = null,
  mapId = "DEMO_MAP_ID",
}: SessionsSectionProps) {
  // --- Date-range filter (the heading's start/end pickers) ---
  // null → "use the default bound" (earliest / latest), so the labels always
  // show the current selection and reset just drops both back to the extremes.
  const [startSel, setStartSel] = useState<string | null>(null);
  const [endSel, setEndSel] = useState<string | null>(null);

  // Full extent of the data, in days. Cheap enough to recompute each render.
  let earliest = "";
  let latest = "";
  for (const s of sessions) {
    const d = dayKey(s.startedAt);
    if (earliest === "" || d < earliest) earliest = d;
    if (latest === "" || d > latest) latest = d;
  }
  const hasRange = sessions.length > 0;
  const start = hasRange ? clampDay(startSel ?? earliest, earliest, latest) : "";
  const end = hasRange ? clampDay(endSel ?? latest, earliest, latest) : "";
  // Only a genuine narrowing counts as "filtered" — at full extent no hint or
  // reset button appears.
  const datesFiltered = hasRange && (start > earliest || end < latest);

  function resetDates() {
    setStartSel(null);
    setEndSel(null);
  }

  // Dates first: everything below (list, map markers, map filter) works off the
  // date-scoped set.
  const dateScoped = hasRange
    ? sessions.filter((s) => {
        const d = dayKey(s.startedAt);
        return d >= start && d <= end;
      })
    : sessions;

  // Cluster the date-scoped located sessions into overview-map markers
  // (home/work/chargers fold onto one pin). Only built when a browser key is
  // present.
  const located = mapApiKey
    ? dateScoped.map((s) => {
        const loc = sessionLatLng(s);
        return {
          id: s.id,
          lat: loc?.lat ?? null,
          lng: loc?.lng ?? null,
          label: s.locationName ?? null,
          energyKwh: s.energyKwh,
        };
      })
    : [];
  // Keep the array identity stable across the dashboard's 15s auto-refresh:
  // router.refresh() hands us a fresh `sessions` array each tick, but we only
  // give the map a new `locations` prop when the located set actually changes —
  // otherwise the map would rebuild and throw away the viewer's pan/zoom (and
  // the filter below) every 15 seconds. Changing the date range *does* change
  // the located set, so the map re-fits to the new selection — intended.
  const locSig = JSON.stringify(located);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `located` is content-stable; key the memo on its serialisation.
  const mapLocations = useMemo(() => clusterSessionsByLocation(located), [locSig]);

  const showMap = mapApiKey != null && mapLocations.length > 0;

  // The map's current viewport: set on a user pan/zoom, cleared on reset.
  // null → no map filter (the full date-scoped list shows).
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  // Bumped to ask the map to re-fit to all markers.
  const [resetSignal, setResetSignal] = useState(0);

  // When the marker set genuinely changes (new data, or a new date range), the
  // map re-fits to all markers, so drop any active viewport filter to keep the
  // list and map in sync. React's "adjust state when a prop changes" pattern (no
  // effect, no extra paint). No-op on mount and on refreshes that preserve
  // `mapLocations` identity.
  const [prevLocations, setPrevLocations] = useState(mapLocations);
  if (prevLocations !== mapLocations) {
    setPrevLocations(mapLocations);
    setBounds(null);
  }

  function resetMapArea() {
    setBounds(null);
    setResetSignal((n) => n + 1);
  }

  const visible =
    bounds == null
      ? dateScoped
      : dateScoped.filter((s) => {
          const c = sessionLatLng(s);
          return c != null && inBounds(c.lat, c.lng, bounds);
        });
  // Only flag the map filter when the viewport is actually hiding something — at
  // full extent (initial fit / after reset) the whole list shows and no hint
  // appears.
  const mapFiltered = bounds != null && visible.length < dateScoped.length;

  // Energy across exactly what the list shows (date- and map-scoped).
  const totalKwh = visible.reduce(
    (sum, s) => sum + (sessionEnergyKwh(s, latestSoc, batteryCapacityKwh) ?? 0),
    0,
  );

  return (
    <>
      <div className="flex items-start justify-between gap-x-3">
        <h2 className="min-w-0 flex-1 text-sm font-semibold tracking-tight">
          Charging sessions
          {hasRange ? (
            <>
              {" "}
              <span className="font-normal text-zinc-500">between</span>{" "}
              <DateField
                value={start}
                min={earliest}
                max={end}
                onChange={(v) => setStartSel(v ? clampDay(v, earliest, end) : null)}
                ariaLabel="Start date"
              />{" "}
              <span className="font-normal text-zinc-500">and</span>{" "}
              <DateField
                value={end}
                min={start}
                max={latest}
                onChange={(v) => setEndSel(v ? clampDay(v, start, latest) : null)}
                ariaLabel="End date"
              />
            </>
          ) : null}
        </h2>
        {datesFiltered ? (
          <button
            type="button"
            onClick={resetDates}
            className="mt-0.5 shrink-0 rounded-md border border-zinc-300 px-2 py-1 text-[11px] font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Reset dates
          </button>
        ) : null}
      </div>

      {showMap ? (
        <SessionsMap
          apiKey={mapApiKey!}
          mapId={mapId}
          locations={mapLocations}
          onBoundsChange={setBounds}
          resetSignal={resetSignal}
          connectedBelow={mapFiltered}
        />
      ) : null}

      {mapFiltered ? (
        // Docked flush onto the map above: the map squares off its bottom
        // corners (connectedBelow), this drops its top corners and top border so
        // the two read as one connected card with no seam or gap between them.
        <div className="flex items-center justify-between gap-2 rounded-b-xl border border-t-0 border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[11px] leading-tight text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-500">
          <span>
            Showing {visible.length} of {dateScoped.length}{" "}
            {datesFiltered ? "sessions in the selected dates" : "sessions"} visible on the map.
          </span>
          <button
            type="button"
            onClick={resetMapArea}
            className="shrink-0 rounded-md border border-zinc-300 px-2 py-1 font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Reset map area
          </button>
        </div>
      ) : null}

      {sessions.length === 0 ? (
        <div className="mt-2 rounded-xl border border-dashed border-zinc-300 p-5 text-center text-xs text-zinc-500 dark:border-zinc-700">
          No sessions yet. Plug the car in and one will appear here.
        </div>
      ) : dateScoped.length === 0 ? (
        <div className="mt-2 rounded-xl border border-dashed border-zinc-300 p-5 text-center text-xs text-zinc-500 dark:border-zinc-700">
          No charging sessions in the selected dates.
        </div>
      ) : visible.length === 0 ? (
        <div className="mt-2 rounded-xl border border-dashed border-zinc-300 p-5 text-center text-xs text-zinc-500 dark:border-zinc-700">
          No charging sessions in this part of the map.
        </div>
      ) : (
        <>
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            <span className="font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
              {visible.length}
            </span>{" "}
            {visible.length === 1 ? "session" : "sessions"} totalling{" "}
            <span className="font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
              {fmtKwh(totalKwh)}
            </span>
          </p>
          <ul className="mt-2 space-y-2">
            {visible.map((s) => {
              // One location per session: the latest known — where it ended, or
              // where it started if it's still in progress.
              const loc = sessionLatLng(s);
              // Prefer a readable place name; fall back to coordinates.
              const locDisplay = s.locationName ?? fmtCoord(loc?.lat ?? null, loc?.lng ?? null);
              // For an in-progress session, compute live SOC + energy from the
              // latest snapshot rather than waiting for the close to populate them.
              const liveSoc = s.isOpen ? latestSoc ?? null : null;
              const displayEndSoc = s.endSoc ?? liveSoc;
              const liveEnergyKwh = sessionEnergyKwh(s, latestSoc, batteryCapacityKwh);
              return (
                <li
                  key={s.id}
                  className="rounded-xl border border-zinc-200 bg-[#fcfcfc] p-3 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  {/* Top: where · when · live status (mirrors the status pill) */}
                  <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-[11px] leading-tight text-zinc-500">
                    {locDisplay && loc ? (
                      <>
                        <span className={s.locationName ? undefined : "font-mono tabular-nums"}>
                          <span aria-hidden>📍</span>{" "}
                          <MapLink
                            lat={loc.lat}
                            lng={loc.lng}
                            label={locDisplay}
                            demo={demo}
                            className="underline-offset-2 hover:text-zinc-700 hover:underline dark:hover:text-zinc-300"
                          />
                        </span>
                        <span aria-hidden className="text-zinc-300 dark:text-zinc-700">·</span>
                      </>
                    ) : null}
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">
                      <LocalTime iso={s.startedAt} />
                    </span>
                  </div>

                  <Divider className="my-2" />

                  {/* SoC change | charging */}
                  <div className="flex items-stretch">
                    {/* SoC change · peak power · duration */}
                    <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-3 text-center">
                      <div className="text-base font-semibold leading-none tabular-nums">
                        {s.startSoc}
                        <span className="mx-1 font-normal text-zinc-400">→</span>
                        {displayEndSoc != null ? displayEndSoc : "…"}
                        <span className="text-xs font-normal text-zinc-500">%</span>
                      </div>
                      <div className="text-[11px] leading-tight text-zinc-500">
                        {s.peakPowerKw != null ? <>peak {fmtKw(s.peakPowerKw)} · </> : null}
                        {fmtSessionDuration(s.startedAt, s.endedAt)}
                      </div>
                    </div>

                    <Divider orientation="vertical" />

                    {/* Energy delivered · connection type · live status */}
                    <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-3 text-center">
                      <div className="whitespace-nowrap text-sm font-medium leading-none tabular-nums">
                        {liveEnergyKwh != null ? (
                          <>+{fmtKwh(liveEnergyKwh)}</>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-1">
                        {s.connectionType ? <Pill label={s.connectionType} /> : null}
                        {s.isOpen ? (
                          <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium leading-none text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                            in progress
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
