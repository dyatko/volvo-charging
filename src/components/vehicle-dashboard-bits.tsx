// Presentational helpers shared by the vehicle header (VehicleDashboard) and the
// charging-sessions list (SessionsSection). Pure and free of client-only hooks,
// so both server and client components can render them.

export const friendly: Record<string, string> = {
  CONNECTED: "Plugged in",
  CONNECTED_AC: "AC plugged in",
  CONNECTED_DC: "DC plugged in",
  DISCONNECTED: "Unplugged",
  IDLE: "Idle",
  CHARGING: "Charging",
  DONE: "Done",
  DISCHARGING: "Discharging",
  SCHEDULED: "Scheduled",
  ERROR: "Error",
  UNSPECIFIED: "—",
  NONE: "None",
  AC: "AC",
  DC: "DC",
  POWER_AVAILABLE: "Power available",
  NO_POWER_AVAILABLE: "No power",
  FAULT: "Fault",
};

export function fmtSessionDuration(startedAt: string, endedAt: string | null): string {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const minutes = Math.max(0, Math.round((end - start) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function fmtCoord(lat: number | null, lng: number | null): string | null {
  if (lat == null || lng == null) return null;
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

export function MapLink({
  lat,
  lng,
  label,
  className,
  demo,
}: {
  lat: number;
  lng: number;
  label: string;
  className?: string;
  demo?: boolean;
}) {
  if (demo) return <span className={className}>{label}</span>;
  return (
    <a
      href={`https://www.google.com/maps?q=${lat},${lng}`}
      target="_blank"
      rel="noopener noreferrer"
      className={className ?? "underline-offset-2 hover:underline"}
      title="Open in Google Maps"
    >
      {label}
    </a>
  );
}

export function Pill({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium leading-none text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
      {label}
    </span>
  );
}

/**
 * A hairline rule that fades to transparent at both ends, so a separator reads
 * as a soft seam rather than a hard box edge. `horizontal` (default) sits
 * between stacked rows; `vertical` self-stretches to split two columns — drop
 * it straight into a flex row in place of Tailwind's `divide-x`. Tune the gap
 * with margin utilities via `className` (e.g. `my-2.5`).
 */
export function Divider({
  orientation = "horizontal",
  className,
}: {
  orientation?: "horizontal" | "vertical";
  className?: string;
}) {
  const shape =
    orientation === "vertical"
      ? "w-px self-stretch bg-gradient-to-b"
      : "h-px w-full bg-gradient-to-r";
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={`${shape} shrink-0 from-transparent via-zinc-300/45 to-transparent dark:via-zinc-800/25${
        className ? ` ${className}` : ""
      }`}
    />
  );
}
