import type { ReactNode } from "react";

/**
 * Render lat/lng as a small clickable link that opens OpenStreetMap
 * centered on the coordinates with a marker. Works on every platform
 * (iOS Safari opens it in OSM; Apple/Google Maps can be reached from
 * there) and uses no API keys.
 */
export function CoordLink({
  lat,
  lng,
  label,
  zoom = 16,
}: {
  lat: number | null;
  lng: number | null;
  label?: ReactNode;
  zoom?: number;
}) {
  if (lat == null || lng == null) return null;
  const href = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${zoom}/${lat}/${lng}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300"
      title={`${lat.toFixed(5)}, ${lng.toFixed(5)}`}
    >
      <span aria-hidden>📍</span>
      {label ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`}
    </a>
  );
}

/**
 * A tiny embedded OSM map (no JS deps — uses the official OSM iframe).
 * Renders a square box; pass `height` to override.
 */
export function CoordMap({
  lat,
  lng,
  height = 140,
  span = 0.005,
}: {
  lat: number;
  lng: number;
  height?: number;
  span?: number;
}) {
  const bbox = [lng - span, lat - span, lng + span, lat + span].join(",");
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
  return (
    <iframe
      src={src}
      title={`Map centered on ${lat.toFixed(4)}, ${lng.toFixed(4)}`}
      loading="lazy"
      className="w-full overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800"
      style={{ height }}
    />
  );
}
