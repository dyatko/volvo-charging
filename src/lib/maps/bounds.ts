/**
 * A map viewport as plain numbers (north/south latitude, east/west longitude),
 * decoupled from `google.maps` so the sessions list can be filtered by what's on
 * screen without the Maps API loaded. `inBounds` is pure and unit-tested.
 */
export type MapBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

/**
 * True when `(lat, lng)` falls inside the viewport. Handles a viewport that
 * wraps the antimeridian, where Google reports `east < west`.
 */
export function inBounds(lat: number, lng: number, b: MapBounds): boolean {
  if (lat > b.north || lat < b.south) return false;
  return b.west <= b.east ? lng >= b.west && lng <= b.east : lng >= b.west || lng <= b.east;
}
