"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { MarkerClusterer, type Cluster, type Renderer } from "@googlemaps/markerclusterer";
import type { MapLocation } from "@/lib/maps/clusters";
import type { MapBounds } from "@/lib/maps/bounds";
import { fmtKwh } from "@/lib/format";
import { BRAND_GREEN } from "@/lib/brand";

// Overview map of charging locations. Uses the official Google loader
// (@googlemaps/js-api-loader) and Google's own marker clusterer
// (@googlemaps/markerclusterer) over the native maps API — no third-party React
// map wrapper. Markers are branded charging pins (a lightning bolt in our
// green); spots that sit close together on screen collapse into a single count
// badge and split back into pins as you zoom in. Additive: the dashboard only
// renders this when a browser key is configured and there's at least one
// located session, so the page works fine without Maps (the session list
// remains the source of truth).
//
// Two layers of grouping: locations sharing a ~100 m grid cell are already
// folded into one MapLocation upstream (clusterSessionsByLocation — repeat
// charges at home/work) so identical coordinates don't pile up; the clusterer
// then groups distinct-but-nearby spots by zoom on top of that.
//
// Panning/zooming reports the new viewport via `onBoundsChange`, which
// SessionsSection uses to filter the list below to what's on screen. Only
// genuine user gestures report — the initial fit and every reset are
// programmatic and swallowed (see `programmatic`).
//
// The overview stays focused on the markers via `minZoom` (caps zoom-out at the
// all-markers view) plus a *non-strict* restriction (confines the centre).
// Deliberately NOT `strictBounds: true`: that clamps the whole viewport and
// caps zoom-out as a side effect.
//
// Tapping a cluster zooms in via `map.moveCamera({centre, zoom})` with an
// explicitly computed camera — NOT `fitBounds`. `fitBounds` interacts badly with
// *any* active restriction on a large jump: it computes a target, the
// restriction re-adjusts it, and the camera lands far from the cluster (we hit
// exactly that — a Stockholm cluster tapped from the zoomed-out initial view
// dumped the map south). `moveCamera` sets the camera atomically and is immune.
//
// The basemap follows the app's light/dark theme via the `colorScheme` map
// option, kept in sync with <html data-theme> (set by the ThemeToggle). That
// option can only be set at construction, so a theme flip rebuilds the map (it
// re-fits to all markers — fine, theme changes are rare). Our overlay card uses
// `dark:` variants so it matches whichever tiles sit beneath it.

// setOptions configures the loader once per page; guard so an effect re-run
// doesn't reconfigure an already-loading API.
let optionsConfigured = false;

// Safe margin around the initial "all markers" view, as a fraction of that
// view's span, used for the centre restriction — so markers never sit flush
// against the edge and there's a little room to breathe.
const RESTRICTION_MARGIN = 0.12;

// When a cluster is tapped we zoom in to split it: keep this much padding (px)
// around its members, and never zoom past this level (so two near-identical
// spots don't dive to building level).
const SPLIT_PAD_PX = 56;
const MAX_SPLIT_ZOOM = 16;

// Pins, badges, and the cluster colour all use BRAND_GREEN (src/lib/brand.ts) —
// the same green as <ChargingLogo />, the SOC ring's full-charge anchor, and the
// favicon bolt — so the map reads as part of the same app.

/** A branded teardrop pin with a lightning bolt — one charging session. */
function chargingPinElement(): HTMLElement {
  const el = document.createElement("div");
  el.style.cursor = "pointer";
  // Tip sits at the bottom-centre of the SVG, which is where Advanced Markers
  // anchor content — so the point lands exactly on the coordinate.
  el.innerHTML = `
    <svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg"
         style="display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.35))">
      <path d="M15 1.5C8.1 1.5 2.5 7.1 2.5 14c0 8.9 12.5 24.5 12.5 24.5S27.5 22.9 27.5 14C27.5 7.1 21.9 1.5 15 1.5Z"
            fill="${BRAND_GREEN}" stroke="#fff" stroke-width="2"/>
      <path d="M16.6 6.5 10.5 15.8H14.2L13.4 21.5 19.5 12H15.6Z" fill="#fff"/>
    </svg>`;
  return el;
}

/** A round count badge — N sessions grouped at/around this point. */
function countBadgeElement(count: number): HTMLElement {
  const el = document.createElement("div");
  el.style.cursor = "pointer";
  // Advanced Markers anchor content by its bottom-centre; nudge down by half so
  // the circle is centred on the coordinate instead of sitting above it.
  el.style.transform = "translateY(50%)";
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;
                box-sizing:border-box;min-width:34px;height:34px;padding:0 7px;
                border-radius:9999px;background:${BRAND_GREEN};color:#fff;
                border:2px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,0.35);
                font:700 14px/1 ui-sans-serif,system-ui,-apple-system,sans-serif;
                letter-spacing:0.01em;">${count}</div>`;
  return el;
}

/** Display title for a location: its place name, or a coordinate fallback. */
function locationTitle(loc: MapLocation): string {
  return loc.label ?? `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`;
}

/** Secondary line: session count and (when known) total energy. */
function locationMeta(loc: MapLocation): string {
  const sessions = `${loc.count} session${loc.count === 1 ? "" : "s"}`;
  return loc.energyKwh != null ? `${sessions} · ${fmtKwh(loc.energyKwh)}` : sessions;
}

/**
 * The app's resolved theme ("light" | "dark"), read from <html data-theme> — the
 * attribute the pre-paint script and ThemeToggle write (see
 * src/components/theme-toggle.tsx). Watched via a MutationObserver so a toggle (or
 * an OS change while on "System") rebuilds the map with a matching `colorScheme`.
 * SSR/first paint assume "light"; the effect reads the real value on mount.
 */
function useResolvedTheme(): "light" | "dark" {
  return useSyncExternalStore(
    (onChange) => {
      const observer = new MutationObserver(onChange);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });
      return () => observer.disconnect();
    },
    () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light"),
    () => "light",
  );
}

export function SessionsMap({
  apiKey,
  mapId,
  locations,
  onBoundsChange,
  resetSignal = 0,
  connectedBelow = false,
}: {
  apiKey: string;
  /** Required for Advanced Markers; "DEMO_MAP_ID" works without Cloud enablement. */
  mapId: string;
  locations: MapLocation[];
  /** Called with the viewport after a user pan/zoom, or `null` after a reset. */
  onBoundsChange?: (bounds: MapBounds | null) => void;
  /** Bump to re-fit the map to every marker (clears a user pan/zoom). */
  resetSignal?: number;
  /** When a banner is docked directly below (e.g. the map-area filter hint),
   *  square off the bottom corners so the two read as one connected card. */
  connectedBelow?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  // Drives the basemap's `colorScheme`; a change rebuilds the map (see below).
  const theme = useResolvedTheme();
  // The location whose details card is open, or null when none is. Rendered as
  // our own overlay card (below) rather than a Google InfoWindow: the map is
  // short (h-56) with overflow-hidden for its rounded corners, and the centre
  // restriction clamps InfoWindow auto-pan — so a native popup's header (and its
  // close button) gets clipped above the top edge and can't be dismissed.
  const [selected, setSelected] = useState<MapLocation | null>(null);

  // Keep the latest callback without re-running the (heavy) map-build effect.
  const onBoundsChangeRef = useRef(onBoundsChange);
  useEffect(() => {
    onBoundsChangeRef.current = onBoundsChange;
  }, [onBoundsChange]);

  // A "fit to all markers" closure published by the build effect, so the reset
  // effect can act on the already-built map.
  const fitAllRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!ref.current || locations.length === 0) return;
    let cancelled = false;
    let locationMarkers: google.maps.marker.AdvancedMarkerElement[] = [];
    let clusterer: MarkerClusterer | null = null;
    let idleListener: google.maps.MapsEventListener | null = null;
    let clickListener: google.maps.MapsEventListener | null = null;
    // The initial fit (and every reset) settles with one `idle`; arm this so
    // that programmatic settle is swallowed and only user pans/zooms report.
    let programmatic = true;
    // Focus the overview (minZoom + centre restriction) once, on the initial
    // view's first settle (see the idle handler).
    let focused = false;

    (async () => {
      try {
        if (!optionsConfigured) {
          setOptions({ key: apiKey, v: "weekly" });
          optionsConfigured = true;
        }
        const [{ Map }, { AdvancedMarkerElement }, { LatLngBounds, ColorScheme }] =
          await Promise.all([
            importLibrary("maps"),
            importLibrary("marker"),
            importLibrary("core"),
          ]);
        if (cancelled || !ref.current) return;

        const map = new Map(ref.current, {
          // Advanced Markers require a Map ID; supplied by the caller (falls back
          // to "DEMO_MAP_ID" in config when none is provisioned).
          mapId,
          // Match the app's light/dark theme. Construction-only, so `theme` is in
          // this effect's deps and a flip rebuilds the map.
          colorScheme: theme === "dark" ? ColorScheme.DARK : ColorScheme.LIGHT,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          gestureHandling: "cooperative",
        });
        // Tapping the map background (not a marker) dismisses the details card.
        clickListener = map.addListener("click", () => setSelected(null));

        // One marker per location; a multi-session spot reads as a count badge,
        // a one-off as a plain pin. `markerLoc` lets the cluster renderer sum
        // sessions across a group (not just count the markers).
        const markerLoc = new WeakMap<google.maps.marker.AdvancedMarkerElement, MapLocation>();
        const bounds = new LatLngBounds();
        locationMarkers = locations.map((loc) => {
          const position = { lat: loc.lat, lng: loc.lng };
          bounds.extend(position);
          const marker = new AdvancedMarkerElement({
            position,
            title: loc.label ?? undefined,
            content: loc.count > 1 ? countBadgeElement(loc.count) : chargingPinElement(),
            gmpClickable: true,
          });
          markerLoc.set(marker, loc);
          marker.addListener("gmp-click", () => setSelected(loc));
          return marker;
        });

        // Cluster badge: brand pill showing the total sessions in the group.
        const renderer: Renderer = {
          render(cluster: Cluster) {
            let sessions = 0;
            for (const m of cluster.markers) {
              const loc = markerLoc.get(m as google.maps.marker.AdvancedMarkerElement);
              sessions += loc?.count ?? 1;
            }
            return new AdvancedMarkerElement({
              position: cluster.position,
              content: countBadgeElement(sessions),
              // The clusterer attaches the click listener but does NOT set this,
              // so a non-clickable Advanced Marker would swallow the tap.
              gmpClickable: true,
              zIndex: 1000 + cluster.count,
            });
          },
        };

        clusterer = new MarkerClusterer({
          map,
          markers: locationMarkers,
          renderer,
          // Zoom in to break the group apart. We compute the camera and set it
          // with moveCamera rather than fitBounds — see the file header for why
          // fitBounds misbehaves under a restriction.
          onClusterClick: (_event, cluster) => {
            // Splitting a cluster zooms away from any open card — close it.
            setSelected(null);
            const bounds = cluster.bounds;
            const proj = map.getProjection();
            const div = map.getDiv();
            const fallbackZoom = Math.min((map.getZoom() ?? 12) + 3, MAX_SPLIT_ZOOM);
            if (!bounds || !proj || !div.clientWidth || !div.clientHeight) {
              map.moveCamera({ center: cluster.position, zoom: fallbackZoom });
              return;
            }
            // World coordinates are zoom-independent (0..256); pixels at zoom z
            // are worldSpan · 2^z. Solve for the zoom whose member span fits the
            // padded viewport on the tighter axis.
            const ne = proj.fromLatLngToPoint(bounds.getNorthEast());
            const sw = proj.fromLatLngToPoint(bounds.getSouthWest());
            if (!ne || !sw) {
              map.moveCamera({ center: cluster.position, zoom: fallbackZoom });
              return;
            }
            const spanX = Math.max(Math.abs(ne.x - sw.x), 1e-6);
            const spanY = Math.max(Math.abs(ne.y - sw.y), 1e-6);
            const availW = Math.max(div.clientWidth - 2 * SPLIT_PAD_PX, 32);
            const availH = Math.max(div.clientHeight - 2 * SPLIT_PAD_PX, 32);
            const fit = Math.min(Math.log2(availW / spanX), Math.log2(availH / spanY));
            // Always zoom in a little, and cap so near-identical spots don't dive.
            const zoom = Math.min(Math.max(fit, (map.getZoom() ?? 0) + 0.5), MAX_SPLIT_ZOOM);
            map.moveCamera({ center: cluster.position, zoom });
          },
        });

        const fitAll = () => {
          // Re-fitting is programmatic: arm the guard so the resulting `idle`
          // isn't reported as a user view.
          programmatic = true;
          if (locations.length === 1) {
            // fitBounds on a single point zooms in too far — centre instead.
            map.setCenter({ lat: locations[0].lat, lng: locations[0].lng });
            map.setZoom(13);
          } else {
            map.fitBounds(bounds, 48);
          }
        };
        fitAllRef.current = fitAll;

        idleListener = map.addListener("idle", () => {
          if (programmatic) {
            programmatic = false;
            // Lock the overview to the initial "all markers" view once it has
            // settled. We read the settled zoom/bounds back (rather than
            // computing them up front) so they already include fitBounds'
            // padding and the map's aspect ratio. `minZoom` caps zoom-out;
            // the non-strict restriction keeps the centre near the markers
            // without clamping the viewport (so fitBounds stays well-behaved).
            if (!focused) {
              focused = true;
              const z = map.getZoom();
              const b = map.getBounds();
              const opts: google.maps.MapOptions = {};
              if (z != null) opts.minZoom = Math.max(0, Math.floor(z));
              if (b) {
                const ne = b.getNorthEast();
                const sw = b.getSouthWest();
                const latMargin = (ne.lat() - sw.lat()) * RESTRICTION_MARGIN;
                const lngMargin = (ne.lng() - sw.lng()) * RESTRICTION_MARGIN;
                opts.restriction = {
                  latLngBounds: {
                    north: ne.lat() + latMargin,
                    south: sw.lat() - latMargin,
                    east: ne.lng() + lngMargin,
                    west: sw.lng() - lngMargin,
                  },
                  strictBounds: false,
                };
              }
              map.setOptions(opts);
            }
            return;
          }
          const b = map.getBounds();
          if (!b) return;
          const ne = b.getNorthEast();
          const sw = b.getSouthWest();
          onBoundsChangeRef.current?.({
            north: ne.lat(),
            south: sw.lat(),
            east: ne.lng(),
            west: sw.lng(),
          });
        });

        fitAll();
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      idleListener?.remove();
      clickListener?.remove();
      // A rebuild (new marker set) drops the old MapLocation references, so any
      // open card would show stale data — close it.
      setSelected(null);
      clusterer?.clearMarkers();
      clusterer?.setMap(null);
      for (const m of locationMarkers) m.map = null;
      locationMarkers = [];
      fitAllRef.current = null;
    };
  }, [apiKey, mapId, locations, theme]);

  // Reset: re-fit to all markers and clear the filter. Skip the initial mount
  // (resetSignal starts at 0) so we don't fight the build effect's own fit.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    fitAllRef.current?.();
    onBoundsChangeRef.current?.(null);
  }, [resetSignal]);

  if (locations.length === 0) return null;

  // Rendered between the "Charging sessions" heading and the list, so no heading
  // of its own. Falls back to a quiet note if the Maps API fails to load.
  return failed ? (
    <p className="mt-2 text-xs text-zinc-500">Map unavailable.</p>
  ) : (
    <div
      className={`relative mt-2 h-56 w-full overflow-hidden border border-zinc-200 dark:border-zinc-800 ${
        connectedBelow ? "rounded-t-xl" : "rounded-xl"
      }`}
    >
      <div ref={ref} className="h-full w-full" />
      {/* Our own details card — see the `selected` declaration for why we don't
          use Google's InfoWindow. Theme-aware (`dark:` variants) so it matches the
          themed tiles beneath it, inset so it never touches the clipped, rounded
          edges, and dismissable via the × or a tap on the map. */}
      {selected ? (
        <div className="absolute left-2 top-2 z-10 flex max-w-[calc(100%-1rem)] items-start gap-2 rounded-lg border border-zinc-200 bg-white/95 px-2.5 py-1.5 shadow-md backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/95">
          <div className="min-w-0">
            <p className="text-xs font-semibold leading-snug text-zinc-900 dark:text-zinc-100">
              {locationTitle(selected)}
            </p>
            <p className="mt-0.5 text-[11px] leading-tight text-zinc-500 dark:text-zinc-400">
              {locationMeta(selected)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSelected(null)}
            aria-label="Close"
            className="-mr-1 -mt-0.5 shrink-0 rounded p-0.5 text-zinc-400 transition-colors hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden fill="none">
              <path
                d="M3.5 3.5l7 7M10.5 3.5l-7 7"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      ) : null}
    </div>
  );
}
