// The app's brand palette — the charging-bar colours from <ChargingLogo />,
// reused by the SOC ring (src/lib/soc-color.ts) and the overview-map pins
// (src/components/sessions-map.tsx). One source of truth so the logo green, the
// ring's full-charge anchor, and the map pins can never drift apart.
//
// (The static favicon at src/app/icon.svg can't import a module, so it repeats
// the same #00C853 by hand — keep it in step if BRAND_GREEN ever changes.)

export const BRAND_RED = "#E53935";
export const BRAND_ORANGE = "#FF8A00";
export const BRAND_GREEN = "#00C853";

/** Parse a "#rrggbb" hex colour into an [r, g, b] byte triple. */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}
